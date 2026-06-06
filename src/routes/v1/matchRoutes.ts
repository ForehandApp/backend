import { protectedApi } from "@/controller";
import {
  matchTable,
  setTable,
  eventTable,
  teamTable,
  organizationMemberTable,
} from "@/services/db/schema";
import { sendResponse } from "@/utils/response";
import { eq, and, notInArray } from "drizzle-orm";
import { t } from "elysia";

export const matchRoutes = protectedApi.group("/match", (app) =>
  app
    .post(
      "/create",
      async ({ user, db, body }) => {
        try {
          const results = [];
          for (const matchData of body) {
            const event = await db.query.eventTable.findFirst({
              where: { id: matchData.eventId },
              with: {
                tournament: true,
              },
            });

            if (!event || !event.tournament) {
              results.push({
                success: false,
                message: `Event or related tournament not found for eventId: ${matchData.eventId}`,
              });
              continue;
            }

            // Check if user is eligible to create matches (org member)
            const member = await db.query.organizationMemberTable.findFirst({
              where: ((table: any, { eq, and }: any) =>
                and(
                  eq(table.organizationId, event.tournament!.organizationId),
                  eq(table.userId, user.id),
                )) as any,
            });

            if (!member) {
              results.push({
                success: false,
                message: `You are not eligible to create matches for eventId: ${matchData.eventId}`,
              });
              continue;
            }

            const matchId = await db.transaction(async (tx: any) => {
              const insertedMatches = await tx
                .insert(matchTable)
                .values({
                  eventId: matchData.eventId,
                  roundNumber: matchData.roundNumber,
                  teamA: matchData.teamA,
                  teamB: matchData.teamB,
                  scorer: matchData.scorer || user.id,
                  winnerId: matchData.winnerId ?? null,
                  matchState: matchData.matchState || "scheduled",
                  setsPerMatchId: matchData.setsPerMatch || event.setsPerMatch,
                  pointsPerSet: matchData.pointsPerSet || event.pointsPerSet,
                  sideSwitching: matchData.sideSwitching || "per_set",
                })
                .returning({ id: matchTable.id });

              const newMatch = insertedMatches[0];
              if (!newMatch) throw new Error("Failed to create match");

              return newMatch.id;
            });

            results.push({
              success: true,
              message: "Match created successfully",
              data: { matchId },
            });
          }

          const allSuccessful = results.every((r) => r.success);

          return sendResponse({
            success: allSuccessful,
            message: allSuccessful
              ? "All matches created successfully"
              : "Some matches failed to create",
            data: results,
          });
        } catch (error) {
          console.error("[match/create] failed", error);
          return sendResponse({
            success: false,
            message: "Failed to create matches",
          });
        }
      },
      {
        body: t.Array(
          t.Object({
            eventId: t.String(),
            roundNumber: t.Number(),
            teamA: t.String(),
            teamB: t.String(),
            scorer: t.Optional(t.String()),
            winnerId: t.Optional(t.Nullable(t.String())),
            matchState: t.Optional(
              t.Union([
                t.Literal("scheduled"),
                t.Literal("in_progress"),
                t.Literal("completed"),
                t.Literal("abandoned"),
                t.Literal("walkover"),
              ]),
            ),
            setsPerMatch: t.Optional(t.Number()),
            pointsPerSet: t.Optional(t.Number()),
            sideSwitching: t.Optional(
              t.Union([
                t.Literal("per_set"),
                t.Literal("half_set"),
                t.Literal("no_switch"),
              ]),
            ),
          }),
        ),
      },
    )
    .post(
      "/update-state/:matchId",
      async ({ user, db, body, params: { matchId }, server }: any) => {
        try {
          const match = await db.query.matchTable.findFirst({
            where: { id: matchId },
            with: {
              event: {
                with: {
                  tournament: true,
                },
              },
            },
          });

          if (!match || !match.event || !match.event.tournament) {
            return sendResponse({
              success: false,
              message: "Match or related tournament not found",
            });
          }

          // Allow scorer or org member to update state
          const isScorer = match.scorer === user.id;
          const member = await db.query.organizationMemberTable.findFirst({
            where: ((table: any, { eq, and }: any) =>
              and(
                eq(
                  table.organizationId,
                  match.event!.tournament!.organizationId,
                ),
                eq(table.userId, user.id),
              )) as any,
          });

          if (!isScorer && !member) {
            return sendResponse({
              success: false,
              message: "You are not authorized to update this match state",
            });
          }

          await db
            .update(matchTable)
            .set({
              matchState: body.state,
              winnerId: body.winnerId ?? null,
            })
            .where(eq(matchTable.id, matchId));

          // Broadcast match state update
          const tournamentId = match.event.tournament.id;
          const broadcastData = {
            type: "MATCH_STATE_UPDATE",
            data: {
              tournamentId: tournamentId,
              matchId: matchId,
              state: body.state,
              winnerId: body.winnerId ?? null,
            },
          };
          server?.publish(`match:${matchId}`, JSON.stringify(broadcastData));
          server?.publish(
            `tournament:${tournamentId}`,
            JSON.stringify(broadcastData),
          );

          return sendResponse({
            success: true,
            message: "Match state updated successfully",
          });
        } catch (error) {
          console.error("[match/update-state] failed", error);
          return sendResponse({
            success: false,
            message: "Failed to update match state",
          });
        }
      },
      {
        params: t.Object({ matchId: t.String() }),
        body: t.Object({
          state: t.Union([
            t.Literal("scheduled"),
            t.Literal("in_progress"),
            t.Literal("completed"),
            t.Literal("abandoned"),
            t.Literal("walkover"),
          ]),
          winnerId: t.Optional(t.Nullable(t.String())),
        }),
      },
    )
    .post(
      "/update-score",
      async ({ user, db, body, server }: any) => {
        try {
          const match = await db.query.matchTable.findFirst({
            where: ((table: any, { eq }: any) =>
              eq(table.id, body.matchId)) as any,
            with: {
              event: {
                with: {
                  tournament: true,
                },
              },
            },
          });

          if (!match) {
            return sendResponse({
              success: false,
              message: `Match not found for ID: ${body.matchId}`,
            });
          }

          if (!match.event || !match.event.tournament) {
            return sendResponse({
              success: false,
              message: "Related event or tournament not found for this match",
            });
          }

          const isScorer = match.scorer === user.id;
          const member = await db.query.organizationMemberTable.findFirst({
            where: ((table: any, { eq, and }: any) =>
              and(
                eq(
                  table.organizationId,
                  match.event!.tournament!.organizationId,
                ),
                eq(table.userId, user.id),
              )) as any,
          });

          if (!isScorer && !member) {
            return sendResponse({
              success: false,
              message: "You are not authorized to update scores for this match",
            });
          }

          await db.transaction(async (tx: any) => {
            // Check if set already exists
            const existingSet = await tx.query.setTable.findFirst({
              where: ((table: any, { eq, and }: any) =>
                and(
                  eq(table.matchId, body.matchId),
                  eq(table.setNumber, body.setNumber),
                )) as any,
            });

            if (existingSet) {
              await tx
                .update(setTable)
                .set({
                  teamAScore: body.teamAScore,
                  teamBScore: body.teamBScore,
                  setStatus: body.setStatus,
                  winnerId: body.winnerId ?? null,
                })
                .where(eq(setTable.id, existingSet.id));
            } else {
              await tx.insert(setTable).values({
                matchId: body.matchId,
                setNumber: body.setNumber,
                teamAScore: body.teamAScore,
                teamBScore: body.teamBScore,
                setStatus: body.setStatus,
                winnerId: body.winnerId ?? null,
              });
            }

            // If match is finished, update match state and winner
            if (body.matchFinished && body.matchWinnerId) {
              const loserId =
                body.matchWinnerId === match.teamA ? match.teamB : match.teamA;

              // 1. Update match state and winner
              await tx
                .update(matchTable)
                .set({
                  matchState: "completed",
                  winnerId: body.matchWinnerId,
                })
                .where(eq(matchTable.id, body.matchId));

              // 2. Update losing team status to eliminated
              await tx
                .update(teamTable)
                .set({ teamStatus: "eliminated" })
                .where(eq(teamTable.id, loserId));

              // 3. Check if it's the last match of the round
              const remainingMatches = await tx
                .select()
                .from(matchTable)
                .where(
                  and(
                    eq(matchTable.eventId, match.event!.id),
                    eq(matchTable.roundNumber, match.roundNumber),
                    notInArray(matchTable.matchState, [
                      "completed",
                      "abandoned",
                      "walkover",
                    ]),
                    notInArray(matchTable.id, [body.matchId]),
                  ),
                );

              if (remainingMatches.length === 0) {
                // Round is over
                const totalMatchesInRound = await tx
                  .select()
                  .from(matchTable)
                  .where(
                    and(
                      eq(matchTable.eventId, match.event!.id),
                      eq(matchTable.roundNumber, match.roundNumber),
                    ),
                  );

                if (totalMatchesInRound.length === 1) {
                  // It was the final!
                  await tx
                    .update(eventTable)
                    .set({
                      eventState: "completed",
                    })
                    .where(eq(eventTable.id, match.event!.id));
                } else {
                  await tx
                    .update(eventTable)
                    .set({
                      eventState: "round_over",
                      activeRound: match.roundNumber + 1,
                    })
                    .where(eq(eventTable.id, match.event!.id));
                }
              }
            }
          });

          // Broadcast score update
          const tournamentId = match.event!.tournament!.id;
          const broadcastData = {
            type: "SCORE_UPDATE",
            data: {
              tournamentId: tournamentId,
              matchId: body.matchId,
              setNumber: body.setNumber,
              teamAScore: body.teamAScore,
              teamBScore: body.teamBScore,
              setStatus: body.setStatus,
              matchFinished: body.matchFinished,
              matchWinnerId: body.matchWinnerId,
            },
          };
          server?.publish(
            `match:${body.matchId}`,
            JSON.stringify(broadcastData),
          );
          server?.publish(
            `tournament:${tournamentId}`,
            JSON.stringify(broadcastData),
          );

          return sendResponse({
            success: true,
            message: "Score updated successfully",
          });
        } catch (error: any) {
          console.error("[match/update-score] failed:", error);
          return sendResponse({
            success: false,
            message: error.message || "Failed to update score",
          });
        }
      },
      {
        body: t.Object({
          matchId: t.String({ format: "uuid" }),
          teamAId: t.Optional(t.Nullable(t.String({ format: "uuid" }))),
          teamBId: t.Optional(t.Nullable(t.String({ format: "uuid" }))),
          setNumber: t.Number(),
          teamAScore: t.Number(),
          teamBScore: t.Number(),
          setStatus: t.Union([
            t.Literal("not_started"),
            t.Literal("in_progress"),
            t.Literal("completed"),
          ]),
          winnerId: t.Optional(t.Nullable(t.String())),
          matchFinished: t.Optional(t.Boolean()),
          matchWinnerId: t.Optional(t.Nullable(t.String())),
        }),
      },
    )
    .get(
      "/list/:eventId",
      async ({ db, params: { eventId } }) => {
        const matches = await db.query.matchTable.findMany({
          where: { eventId: eventId },
          with: {
            sets: true,
            teamAData: {
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
            },
          },
        });

        return sendResponse({
          success: true,
          message: "Matches fetched successfully",
          data: matches,
        });
      },
      {
        params: t.Object({ eventId: t.String({ format: "uuid" }) }),
      },
    )
    .post(
      "/list/:eventId",
      async ({ db, params: { eventId }, body }) => {
        const matches = await db.query.matchTable.findMany({
          where: ((table: any, { eq, and }: any) =>
            and(
              eq(table.eventId, eventId),
              eq(table.roundNumber, body.roundNumber),
            )) as any,
          with: {
            sets: true,
            teamAData: {
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
            },
          },
        });

        return sendResponse({
          success: true,
          message: `Matches for event ${eventId} and round ${body.roundNumber} fetched successfully`,
          data: matches,
        });
      },
      {
        params: t.Object({ eventId: t.String({ format: "uuid" }) }),
        body: t.Object({
          roundNumber: t.Number(),
        }),
      },
    )
    .get(
      "/info/:matchId",
      async ({ db, params: { matchId } }) => {
        const match = await db.query.matchTable.findFirst({
          where: { id: matchId },
          with: {
            sets: true,
            teamAData: {
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
            },
            event: {
              with: {
                tournament: true,
              },
            },
            scorerUser: true,
            winner: true,
          },
        });

        if (!match) {
          return sendResponse({
            success: false,
            message: "Match not found",
          });
        }

        return sendResponse({
          success: true,
          message: "Match fetched successfully",
          data: match,
        });
      },
      {
        params: t.Object({ matchId: t.String({ format: "uuid" }) }),
      },
    )
    .get(
      "/set/info/:setId",
      async ({ db, params: { setId } }) => {
        const set = await db.query.setTable.findFirst({
          where: { id: setId },
          with: {
            match: {
              with: {
                event: {
                  with: {
                    tournament: true,
                  },
                },
              },
            },
            winner: true,
          },
        });

        if (!set) {
          return sendResponse({
            success: false,
            message: "Set not found",
          });
        }

        return sendResponse({
          success: true,
          message: "Set fetched successfully",
          data: set,
        });
      },
      {
        params: t.Object({ setId: t.String({ format: "uuid" }) }),
      },
    )
    .post(
      "/set/update-state/:setId",
      async ({ user, db, body, params: { setId }, server }: any) => {
        try {
          const set = await db.query.setTable.findFirst({
            where: { id: setId },
            with: {
              match: {
                with: {
                  event: {
                    with: {
                      tournament: true,
                    },
                  },
                },
              },
            },
          });

          if (
            !set ||
            !set.match ||
            !set.match.event ||
            !set.match.event.tournament
          ) {
            return sendResponse({
              success: false,
              message: "Set or related tournament not found",
            });
          }

          // Scorer or org member
          const isScorer = set.match.scorer === user.id;
          const member = await db.query.organizationMemberTable.findFirst({
            where: ((table: any, { eq, and }: any) =>
              and(
                eq(
                  table.organizationId,
                  set.match!.event!.tournament!.organizationId,
                ),
                eq(table.userId, user.id),
              )) as any,
          });

          if (!isScorer && !member) {
            return sendResponse({
              success: false,
              message: "You are not authorized to update this set state",
            });
          }

          await db
            .update(setTable)
            .set({ setStatus: body.state })
            .where(eq(setTable.id, setId));

          // Broadcast set state update
          const tournamentId = set.match.event!.tournament!.id;
          const broadcastData = {
            type: "SET_STATE_UPDATE",
            data: {
              tournamentId: tournamentId,
              matchId: set.matchId,
              setId: setId,
              setNumber: set.setNumber,
              state: body.state,
            },
          };
          server?.publish(
            `match:${set.matchId}`,
            JSON.stringify(broadcastData),
          );
          server?.publish(
            `tournament:${tournamentId}`,
            JSON.stringify(broadcastData),
          );

          return sendResponse({
            success: true,
            message: `Set status updated to ${body.state} successfully`,
          });
        } catch (error) {
          console.error("[match/set/update-state] failed", error);
          return sendResponse({
            success: false,
            message: "Failed to update set state",
          });
        }
      },
      {
        params: t.Object({ setId: t.String({ format: "uuid" }) }),
        body: t.Object({
          state: t.Union([
            t.Literal("not_started"),
            t.Literal("in_progress"),
            t.Literal("completed"),
          ]),
        }),
      },
    )
    .post(
      "/start/:matchId",
      async ({ db, user, params: { matchId }, server }: any) => {
        try {
          const match = await db.query.matchTable.findFirst({
            where: { id: matchId },
            with: {
              event: {
                with: {
                  tournament: true,
                },
              },
            },
          });

          if (!match || !match.event || !match.event.tournament) {
            return sendResponse({
              success: false,
              message: "Match or related tournament not found",
            });
          }

          const isScorer = match.scorer === user.id;
          const member = await db.query.organizationMemberTable.findFirst({
            where: ((table: any, { eq, and }: any) =>
              and(
                eq(
                  table.organizationId,
                  match.event!.tournament!.organizationId,
                ),
                eq(table.userId, user.id),
              )) as any,
          });

          if (!isScorer && !member) {
            return sendResponse({
              success: false,
              message: "You are not authorized to start this match",
            });
          }

          await db.transaction(async (tx: any) => {
            // Update match state
            await tx
              .update(matchTable)
              .set({ matchState: "in_progress" })
              .where(eq(matchTable.id, matchId));

            // If event is not yet in_progress, set it to in_progress
            if (match.event!.eventState !== "in_progress") {
              await tx
                .update(eventTable)
                .set({ eventState: "in_progress" })
                .where(eq(eventTable.id, match.event!.id));
            }
          });

          // Broadcast match start
          const tournamentId = match.event!.tournament!.id;
          const broadcastData = {
            type: "MATCH_START",
            data: { tournamentId, matchId },
          };
          server?.publish(`match:${matchId}`, JSON.stringify(broadcastData));
          server?.publish(
            `tournament:${tournamentId}`,
            JSON.stringify(broadcastData),
          );

          return sendResponse({
            success: true,
            message: "Match started successfully",
          });
        } catch (error) {
          console.error("[match/start] failed", error);
          return sendResponse({
            success: false,
            message: "Failed to start match",
          });
        }
      },
      {
        params: t.Object({ matchId: t.String({ format: "uuid" }) }),
      },
    )
    .post(
      "/complete/:matchId",
      async ({ db, user, body, params: { matchId }, server }: any) => {
        try {
          const match = await db.query.matchTable.findFirst({
            where: { id: matchId },
            with: {
              event: {
                with: {
                  tournament: true,
                },
              },
            },
          });

          if (!match || !match.event || !match.event.tournament) {
            return sendResponse({
              success: false,
              message: "Match or related tournament not found",
            });
          }

          const isScorer = match.scorer === user.id;
          const member = await db.query.organizationMemberTable.findFirst({
            where: ((table: any, { eq, and }: any) =>
              and(
                eq(
                  table.organizationId,
                  match.event!.tournament!.organizationId,
                ),
                eq(table.userId, user.id),
              )) as any,
          });

          if (!isScorer && !member) {
            return sendResponse({
              success: false,
              message: "You are not authorized to complete this match",
            });
          }

          const loserId =
            body.winnerId === match.teamA ? match.teamB : match.teamA;

          await db.transaction(async (tx: any) => {
            // 1. Update match state and winner
            await tx
              .update(matchTable)
              .set({
                matchState: "completed",
                winnerId: body.winnerId,
              })
              .where(eq(matchTable.id, matchId));

            // 2. Update losing team status to eliminated
            await tx
              .update(teamTable)
              .set({ teamStatus: "eliminated" })
              .where(eq(teamTable.id, loserId));

            // 3. Check if it's the last match of the round
            const remainingMatches = await tx
              .select()
              .from(matchTable)
              .where(
                and(
                  eq(matchTable.eventId, match.event!.id),
                  eq(matchTable.roundNumber, match.roundNumber),
                  notInArray(matchTable.matchState, [
                    "completed",
                    "abandoned",
                    "walkover",
                  ]),
                  notInArray(matchTable.id, [matchId]),
                ),
              );

            if (remainingMatches.length === 0) {
              // Round is over
              // 4. Check if it was the final round (only one match in this round)
              const totalMatchesInRound = await tx
                .select()
                .from(matchTable)
                .where(
                  and(
                    eq(matchTable.eventId, match.event!.id),
                    eq(matchTable.roundNumber, match.roundNumber),
                  ),
                );

              if (totalMatchesInRound.length === 1) {
                await tx
                  .update(eventTable)
                  .set({
                    eventState: "completed",
                  })
                  .where(eq(eventTable.id, match.event!.id));
              } else {
                await tx
                  .update(eventTable)
                  .set({
                    eventState: "round_over",
                    activeRound: match.roundNumber + 1,
                  })
                  .where(eq(eventTable.id, match.event!.id));
              }
            }
          });

          // Broadcast match completion
          const tournamentId = match.event!.tournament!.id;
          const broadcastData = {
            type: "MATCH_COMPLETE",
            data: {
              tournamentId,
              matchId,
              winnerId: body.winnerId,
            },
          };
          server?.publish(`match:${matchId}`, JSON.stringify(broadcastData));
          server?.publish(
            `tournament:${tournamentId}`,
            JSON.stringify(broadcastData),
          );

          return sendResponse({
            success: true,
            message: "Match completed and states updated successfully",
          });
        } catch (error) {
          console.error("[match/complete] failed", error);
          return sendResponse({
            success: false,
            message: "Failed to complete match",
          });
        }
      },
      {
        params: t.Object({ matchId: t.String() }),
        body: t.Object({
          winnerId: t.String({ format: "uuid" }),
        }),
      },
    )
    .post(
      "/set/initialize",
      async ({ db, user, body, server }: any) => {
        try {
          const match = await db.query.matchTable.findFirst({
            where: { id: body.matchId },
            with: {
              event: {
                with: {
                  tournament: true,
                },
              },
            },
          });

          if (!match || !match.event || !match.event.tournament) {
            return sendResponse({
              success: false,
              message: "Match or related tournament not found",
            });
          }

          const isScorer = match.scorer === user.id;
          const member = await db.query.organizationMemberTable.findFirst({
            where: ((table: any, { eq, and }: any) =>
              and(
                eq(
                  table.organizationId,
                  match.event!.tournament!.organizationId,
                ),
                eq(table.userId, user.id),
              )) as any,
          });

          if (!isScorer && !member) {
            return sendResponse({
              success: false,
              message:
                "You are not authorized to initialize sets for this match",
            });
          }

          const existingSet = await db.query.setTable.findFirst({
            where: ((table: any, { eq, and }: any) =>
              and(
                eq(table.matchId, body.matchId),
                eq(table.setNumber, body.setNumber),
              )) as any,
          });

          if (existingSet) {
            return sendResponse({
              success: true,
              message: "Set already exists",
              data: { setId: existingSet.id },
            });
          }

          const insertedSet = await db
            .insert(setTable)
            .values({
              matchId: body.matchId,
              setNumber: body.setNumber,
              teamAScore: 0,
              teamBScore: 0,
              setStatus: "not_started",
            })
            .returning({ id: setTable.id });

          const setId = insertedSet[0]!.id;

          // Broadcast set initialization
          const tournamentId = match.event!.tournament!.id;
          const broadcastData = {
            type: "SET_INITIALIZED",
            data: {
              tournamentId,
              matchId: body.matchId,
              setId: setId,
              setNumber: body.setNumber,
            },
          };
          server?.publish(
            `match:${body.matchId}`,
            JSON.stringify(broadcastData),
          );
          server?.publish(
            `tournament:${tournamentId}`,
            JSON.stringify(broadcastData),
          );

          return sendResponse({
            success: true,
            message: "Set initialized successfully",
            data: { setId },
          });
        } catch (error) {
          console.error("[match/set/initialize] failed", error);
          return sendResponse({
            success: false,
            message: "Failed to initialize set",
          });
        }
      },
      {
        body: t.Object({
          matchId: t.String({ format: "uuid" }),
          setNumber: t.Number(),
        }),
      },
    ),
);
