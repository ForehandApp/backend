import { db } from "./src/services/db/client";
import { matchTable } from "./src/services/db/schema";
import { sql } from "drizzle-orm";

async function main() {
  try {
    const randomUuid = "ee1ecd45-7678-429d-bc30-ad674b65720e";
    
    const query = db.query.matchTable.findMany({
      where: sql`${matchTable.scorer} = ${randomUuid}` as any,
      with: {
        sets: true,
      },
    });
    
    console.log("SQL:", query.toSQL());

  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
main();
