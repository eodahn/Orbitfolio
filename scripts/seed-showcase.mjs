import { openConfiguredDatabase } from "../server/db.js";
import { seedShowcase } from "../server/showcase.js";
const db = await openConfiguredDatabase();
try {
  console.log(await seedShowcase(db));
} finally {
  await db.close();
}
