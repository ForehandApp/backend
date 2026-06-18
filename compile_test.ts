import { db } from "./src/services/db/client";

async function main() {
  const user = { id: "ee1ecd45-7678-429d-bc30-ad674b65720e" };
  const matches = await db.query.matchTable.findMany({
    where: { scorer: user.id },
    with: {
      sets: true,
      event: {
        with: {
          tournament: true,
        },
      },
    },
  });
}
main();
