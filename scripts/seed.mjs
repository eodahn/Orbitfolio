import { openConfiguredDatabase } from "../server/db.js";
import { seedDevelopmentData } from "../server/seed.js";
const db = await openConfiguredDatabase();
try {
  await seedDevelopmentData(db);
} finally {
  await db.close();
}
