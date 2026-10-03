import { prepareDatabasePath } from "./storage.js";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const migrationsDir = join(root, "database", "migrations");

export function openDatabase(filename) {
  const db = new DatabaseSync(prepareDatabasePath(filename));
  db.exec(
    "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
  );
  const applied = new Set(
    db
      .prepare("SELECT name FROM schema_migrations")
      .all()
      .map((row) => row.name),
  );
  for (const name of readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    if (applied.has(name)) continue;
    db.exec("BEGIN");
    try {
      db.exec(readFileSync(join(migrationsDir, name), "utf8"));
      db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run(name);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return sqliteAdapter(db);
}

// Queue SQLite operations so an awaited transaction cannot absorb another request.
function sqliteAdapter(raw) {
  let tail = Promise.resolve();
  const queue = (action) => {
    const result = tail.then(action);
    tail = result.catch(() => {});
    return result;
  };
  const bound = (execute) => ({
    dialect: "sqlite",
    prepare(sql) {
      return Object.fromEntries(
        ["get", "all", "run"].map((method) => [
          method,
          (...args) => execute(() => raw.prepare(sql)[method](...args)),
        ]),
      );
    },
    exec: (sql) => execute(() => raw.exec(sql)),
    close: () => execute(() => raw.close()),
    transaction: (action) =>
      queue(async () => {
        raw.exec("BEGIN IMMEDIATE");
        try {
          const result = await action(
            bound((action) => Promise.resolve().then(action)),
          );
          raw.exec("COMMIT");
          return result;
        } catch (error) {
          raw.exec("ROLLBACK");
          throw error;
        }
      }),
  });
  return bound(queue);
}
export async function openConfiguredDatabase(env = process.env) {
  if (env.DATABASE_URL) {
    const { openPostgres } = await import("./postgres.js");
    return openPostgres(env.DATABASE_URL);
  }
  if (env.NODE_ENV === "production")
    throw Error(
      "DATABASE_URL é obrigatória em produção. Configure PostgreSQL antes de iniciar.",
    );
  return openDatabase();
}
