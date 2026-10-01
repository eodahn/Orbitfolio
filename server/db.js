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
  return db;
}
