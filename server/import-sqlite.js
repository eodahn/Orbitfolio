import { DatabaseSync, backup } from "node:sqlite";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { openDatabase } from "./db.js";
export const transferTables = [
  "users",
  "projects",
  "commits",
  "project_likes",
  "favorites",
  "follows",
  "sessions",
  "profile_privacy",
  "github_connections",
  "github_oauth_states",
  "project_imports",
  "user_avatars",
];
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
const digest = (rows, columns) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        rows
          .map((row) =>
            columns.map((c) =>
              ArrayBuffer.isView(row[c]) ? Buffer.from(row[c]) : row[c],
            ),
          )
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      ),
    )
    .digest("hex");
// Makes a consistent private copy (including WAL), migrates only the copy, and
// copies all rows in a single PostgreSQL transaction. The source is never altered.
export async function importSqlite(
  sourcePath,
  destination,
  { dryRun = false } = {},
) {
  if (!existsSync(sourcePath))
    throw Error(
      "Arquivo SQLite não encontrado. Nenhum banco vazio foi criado.",
    );
  if (destination.dialect !== "postgres")
    throw Error("O destino deve ser PostgreSQL.");
  const directory = mkdtempSync(join(tmpdir(), "orbit-import-"));
  let source, snapshot;
  try {
    source = new DatabaseSync(sourcePath, { readOnly: true });
    if (
      !source
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'",
        )
        .get()
    )
      throw Error("Origem não contém contas Orbitfolio.");
    if (source.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
      throw Error("SQLite corrompido. Restaure um backup íntegro.");
    await backup(source, join(directory, "snapshot.sqlite"));
    source.close();
    source = null;
    snapshot = openDatabase(join(directory, "snapshot.sqlite"));
    if ((await snapshot.prepare("PRAGMA foreign_key_check").all()).length)
      throw Error(
        "Origem possui relacionamentos inválidos. Nenhum registro foi importado.",
      );
    const data = [];
    for (const table of transferTables) {
      const columns = (
        await snapshot.prepare(`PRAGMA table_info(${quote(table)})`).all()
      ).map((c) => c.name);
      const rows = await snapshot
        .prepare(`SELECT * FROM ${quote(table)}`)
        .all();
      data.push({ table, columns, rows, hash: digest(rows, columns) });
    }
    const counts = Object.fromEntries(
      data.map((d) => [d.table, d.rows.length]),
    );
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(data.map((d) => [d.table, d.hash])))
      .digest("hex");
    return await destination.transaction(async (tx) => {
      await tx.exec(
        "LOCK TABLE " +
          [...transferTables, "sqlite_import_history"].map(quote).join(",") +
          " IN ACCESS EXCLUSIVE MODE",
      );
      if (
        await tx
          .prepare("SELECT 1 FROM sqlite_import_history WHERE fingerprint=?")
          .get(fingerprint)
      )
        return { alreadyImported: true, counts };
      for (const table of transferTables) {
        if (
          (
            await tx
              .prepare(`SELECT COUNT(*) AS count FROM ${quote(table)}`)
              .get()
          ).count
        )
          throw Error(
            `Destino contém dados em ${table}. Importação recusada para não sobrescrever registros.`,
          );
      }
      for (const { table, columns, rows, hash } of data) {
        const insert = tx.prepare(
          `INSERT INTO ${quote(table)} (${columns.map(quote).join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
        );
        for (const row of rows)
          await insert.run(
            ...columns.map((c) =>
              ArrayBuffer.isView(row[c]) ? Buffer.from(row[c]) : row[c],
            ),
          );
        const copied = await tx.prepare(`SELECT * FROM ${quote(table)}`).all();
        if (digest(copied, columns) !== hash)
          throw Error(
            `Verificação de ${table} falhou. Transferência revertida.`,
          );
      }
      if (dryRun) {
        const signal = new Error("dry-run");
        signal.dryRunResult = { dryRun: true, counts };
        throw signal;
      }
      await tx
        .prepare(
          "INSERT INTO sqlite_import_history(fingerprint,counts_json) VALUES(?,?)",
        )
        .run(fingerprint, JSON.stringify(counts));
      return { imported: true, counts };
    });
  } catch (error) {
    if (error.dryRunResult) return error.dryRunResult;
    throw error;
  } finally {
    source?.close();
    if (snapshot) await snapshot.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
