import { openConfiguredDatabase } from "../server/db.js";
let db;
try {
  db = await openConfiguredDatabase();
  console.log(`Migrações ${db.dialect} concluídas.`);
} catch {
  console.error(
    "Falha nas migrações. Confira DATABASE_URL, conectividade e permissões do banco.",
  );
  process.exitCode = 1;
} finally {
  await db?.close();
}
