import fs from "fs";

const filepath = "src/routes/v1/matchRoutes.ts";
let content = fs.readFileSync(filepath, "utf8").replace(/\\r\\n/g, "\\n");

function strictReplace(search: string, replace: string, name: string) {
  if (!content.includes(search)) {
    console.error("ERROR: Could not find string for " + name);
    process.exit(1);
  }
  content = content.replace(search, replace);
  console.log("Successfully applied " + name);
}

// Fix 2: available-scorers member lookup
strictReplace(
  `        const member = await db.query.organizationMemberTable.findFirst({
          where: ((table: any, { eq, and }: any) =>
            and(
              eq(table.organizationId, match.event!.tournament!.organizationId),
              eq(table.userId, user.id),
            )) as any,
        });`,
  `        const [member] = await db
          .select()
          .from(organizationMemberTable)
          .where(
            and(
              eq(organizationMemberTable.organizationId, match.event!.tournament!.organizationId),
              eq(organizationMemberTable.userId, user.id),
            ),
          )
          .limit(1);`,
  "Fix 2"
);

// Fix 3: available-scorers adminRows
strictReplace(
  `        const scorerRows = await db
          .select({
            id: profileTable.id,
            name: profileTable.name,
            avatarUrl: profileTable.profilePicUrl,
          })
          .from(tournamentVolunteerTable)
          .innerJoin(profileTable, eq(tournamentVolunteerTable.userId, profileTable.id))
          .where(
            and(
              eq(tournamentVolunteerTable.tournamentId, match.event.tournament.id),
              eq(tournamentVolunteerTable.role, "scorer"),
            ),
          );

        const assignedRows = await db`,
  `        const scorerRows = await db
          .select({
            id: profileTable.id,
            name: profileTable.name,
            avatarUrl: profileTable.profilePicUrl,
          })
          .from(tournamentVolunteerTable)
          .innerJoin(profileTable, eq(tournamentVolunteerTable.userId, profileTable.id))
          .where(
            and(
              eq(tournamentVolunteerTable.tournamentId, match.event.tournament.id),
              eq(tournamentVolunteerTable.role, "scorer"),
            ),
          );

        const adminRows = await db
          .select({
            id: profileTable.id,
            name: profileTable.name,
            avatarUrl: profileTable.profilePicUrl,
          })
          .from(organizationMemberTable)
          .innerJoin(profileTable, eq(organizationMemberTable.userId, profileTable.id))
          .where(
            eq(organizationMemberTable.organizationId, match.event.tournament.organizationId)
          );

        const allPotentialScorers = [...scorerRows, ...adminRows].filter(
          (v, i, a) => a.findIndex((t) => t.id === v.id) === i
        );

        const assignedRows = await db`,
  "Fix 3"
);

// Fix 4: available-scorers scorers list
strictReplace(
  `        const scorers = scorerRows.filter(
          (row) => row.id !== match.scorer && !unavailableScorerIds.has(row.id),
        );`,
  `        const scorers = allPotentialScorers.filter(
          (row) => row.id !== match.scorer && !unavailableScorerIds.has(row.id),
        );`,
  "Fix 4"
);

// Fix 5: assign-scorer member lookup
strictReplace(
  `        const member = await db.query.organizationMemberTable.findFirst({
          where: ((table: any, { eq, and }: any) =>
            and(
              eq(table.organizationId, match.event!.tournament!.organizationId),
              eq(table.userId, user.id),
            )) as any,
        });`,
  `        const [member] = await db
          .select()
          .from(organizationMemberTable)
          .where(
            and(
              eq(organizationMemberTable.organizationId, match.event!.tournament!.organizationId),
              eq(organizationMemberTable.userId, user.id),
            ),
          )
          .limit(1);`,
  "Fix 5"
);

// We need to change const [candidate] to let [candidate] or let candidate
strictReplace(
  `        const [candidate] = await db`,
  `        let [candidate]: any = await db`,
  "Fix 6b"
);

// Fix 6: assign-scorer admin candidate
strictReplace(
  `        if (!candidate) {
          return sendResponse({
            success: false,
            message: "Selected user is not an available scorer for this tournament",
          });
        }`,
  `        if (!candidate) {
          const [adminCandidate] = await db
            .select({
              id: profileTable.id,
              name: profileTable.name,
              avatarUrl: profileTable.profilePicUrl,
            })
            .from(organizationMemberTable)
            .innerJoin(profileTable, eq(organizationMemberTable.userId, profileTable.id))
            .where(
              and(
                eq(organizationMemberTable.organizationId, match.event!.tournament!.organizationId),
                eq(organizationMemberTable.userId, body.scorerId),
              ),
            )
            .limit(1);

          if (!adminCandidate) {
            return sendResponse({
              success: false,
              message: "Selected user is not an available scorer for this tournament",
            });
          }
          
          candidate = adminCandidate;
        }`,
  "Fix 6"
);


// Fix 7: assign-scorer conflictingMatch
strictReplace(
  `        const conflictingMatch = await db.query.matchTable.findFirst({
          where: ((table: any, { eq, and, ne, notInArray }: any) =>
            and(
              eq(table.eventId, match.eventId),
              eq(table.roundNumber, match.roundNumber),
              eq(table.scorer, body.scorerId),
              ne(table.id, matchId),
              notInArray(table.matchState, [
                "completed",
                "abandoned",
                "walkover",
              ]),
            )) as any,
        });`,
  `        const [conflictingMatch] = await db
          .select()
          .from(matchTable)
          .where(
            and(
              eq(matchTable.eventId, match.eventId),
              eq(matchTable.roundNumber, match.roundNumber),
              eq(matchTable.scorer, body.scorerId),
              ne(matchTable.id, matchId),
              notInArray(matchTable.matchState, [
                "completed",
                "abandoned",
                "walkover",
              ]),
            ),
          )
          .limit(1);`,
  "Fix 7"
);

// Fix 8: scorer-matches relation bug
strictReplace(
  `              teamAData: {
                with: {
                  participants: {
                    with: {
                      user: true,
                    },
                  },
                },
              },
              teamBData: {
                with: {
                  participants: {
                    with: {
                      user: true,
                    },
                  },
                },
              },`,
  `              teamA: {
                with: {
                  participants: {
                    with: {
                      user: true,
                    },
                  },
                },
              },
              teamB: {
                with: {
                  participants: {
                    with: {
                      user: true,
                    },
                  },
                },
              },`,
  "Fix 8"
);

fs.writeFileSync(filepath, content);
console.log("ALL FIXES APPLIED SUCCESSFULLY");
