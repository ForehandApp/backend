import { db } from "./src/services/db/client";
import { sql } from "drizzle-orm";

async function main() {
  try {
    await db.execute(sql`ALTER TABLE "match_table" ALTER COLUMN "scorer" DROP NOT NULL;`);
    console.log("Success! Constraint dropped.");
  } catch (e) {
    console.error("Error:", e);
  }
  process.exit(0);
}
main();
