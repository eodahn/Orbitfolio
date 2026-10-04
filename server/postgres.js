import pg from "pg";
import { readFileSync, readdirSync } from "node:fs";
const { Pool, types } = pg;
// IDs/byte counts/expiry milliseconds stay JavaScript numbers, never silently rounded.
const numericTypes = {
  getTypeParser(oid, format) {
    if (oid === 20)
      return (value) => {
        const n = Number(value);
        if (!Number.isSafeInteger(n))
          throw Error("Inteiro do banco excede o limite seguro.");
        return n;
      };
    return types.getTypeParser(oid, format);
  },
};
// Shared queries use ? placeholders. Preserve question marks inside SQL literals.
export function postgresSQL(sql) {
  let i = 0;
  return sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g, (part) =>
    part === "?" ? `$${++i}` : part,
  );
}
function adapter(client, pool, inTransaction = false) {
  const db = {
    dialect: "postgres",
    prepare(sql) {
      const query = async (values) => client.query(postgresSQL(sql), values);
      return {
        async get(...values) {
          return (await query(values)).rows[0];
        },
        async all(...values) {
          return (await query(values)).rows;
        },
        async run(...values) {
          const r = await query(values);
          return { changes: r.rowCount };
        },
      };
    },
    async exec(sql) {
      await client.query(sql);
    },
    async transaction(action) {
      if (inTransaction) throw Error("Transação aninhada não suportada.");
      const connection = await pool.connect();
      try {
        await connection.query("BEGIN");
        const result = await action(adapter(connection, pool, true));
        await connection.query("COMMIT");
        return result;
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      } finally {
        connection.release();
      }
    },
    async close() {
      if (!inTransaction) await pool.end();
    },
  };
  return db;
}
export async function openPostgres(
  connectionString = process.env.DATABASE_URL,
) {
  if (!connectionString || !/^postgres(?:ql)?:\/\//.test(connectionString))
    throw Error("Configure DATABASE_URL com a URL PostgreSQL do provedor.");
  const pool = new Pool({
    connectionString,
    types: numericTypes,
    max: 10,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
  });
  // Never log URLs, passwords or query parameters on connection errors.
  pool.on("error", () =>
    console.error("Conexão PostgreSQL interrompida. Verifique o provedor."),
  );
  const db = adapter(pool, pool);
  try {
    await db.transaction(async (tx) => {
      await tx.exec("SELECT pg_advisory_xact_lock(7430192601)");
      await tx.exec(
        "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text))",
      );
      const applied = new Set(
        (await tx.prepare("SELECT name FROM schema_migrations").all()).map(
          (r) => r.name,
        ),
      );
      const directory = new URL("../database/postgres/", import.meta.url);
      for (const name of readdirSync(directory)
        .filter((n) => n.endsWith(".sql"))
        .sort()) {
        if (applied.has(name)) continue;
        await tx.exec(readFileSync(new URL(name, directory), "utf8"));
        await tx
          .prepare("INSERT INTO schema_migrations(name) VALUES(?)")
          .run(name);
      }
    });
    return db;
  } catch (error) {
    await pool.end();
    throw error;
  }
}
