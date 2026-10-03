import { openPostgres } from "../server/postgres.js";
import { importSqlite } from "../server/import-sqlite.js";
const args = process.argv.slice(2),
  source = args.find((a) => !a.startsWith("--"));
if (!source || args.some((a) => a.startsWith("--") && a !== "--dry-run")) {
  console.error(
    "Uso: npm run import:sqlite -- /caminho/backup.sqlite [--dry-run]",
  );
  process.exit(1);
}
let db;
try {
  db = await openPostgres();
  const result = await importSqlite(source, db, {
    dryRun: args.includes("--dry-run"),
  });
  console.log(
    result.alreadyImported
      ? "Este backup já foi importado; nada foi sobrescrito."
      : result.dryRun
        ? "Simulação validada e revertida; nenhuma linha transferida."
        : "Transferência concluída e verificada. Preserve o backup original.",
  );
  console.table(result.counts);
} catch (error) {
  // PostgreSQL error detail may contain user data; never dump connection objects.
  console.error(
    error.code
      ? `Transferência abortada (${error.code}). Confira conexão, esquema e integridade; os dados não foram parcialmente importados.`
      : error.message,
  );
  process.exitCode = 1;
} finally {
  await db?.close();
}
