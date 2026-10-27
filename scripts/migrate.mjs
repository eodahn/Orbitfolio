import { openConfiguredDatabase } from "../server/db.js";
import { databaseStartupError } from "../server/database-config.js";
let db;
try {
  db = await openConfiguredDatabase();
  console.log(`Migrações ${db.dialect} concluídas.`);
} catch (error) {
  console.error(databaseStartupError(error));
  process.exitCode = 1;
} finally {
  await db?.close();
}
