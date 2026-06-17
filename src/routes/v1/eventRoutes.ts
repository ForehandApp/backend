import { protectedApi } from "@/routes/v1/controller";
import {
  eventInvitesTable,
  eventTable,
  invitesTable,
  matchTable,
  setTable,
  teamActionLogsTable,
  teamParticipantTable,
  teamTable,
} from "@/services/db/schema";
import { inArray, eq, and, notInArray } from "drizzle-orm";
import { getDate } from "@/utils/helpers";
import { sendResponse } from "@/utils/response";
import { t } from "elysia";

export const eventRoutes = protectedApi.group("/event", (app) =>
  app
    .post(
      "/create",
      async ({ user, db, body }) => {
        for (const event of body) {
          const tournament = await db.query.tournamentTable.findFirst({
            where: ((table: any, { eq }: any) =>
              eq(table.id, event.tournamentId)) as any,
            with: {
              organization: {
                with: {
                  members: {
                    where: ((table: any, { eq }: any) =>
                      eq(table.userId, user.id)) as any,
                  },
                },
              },
            },
          });

          if (
            !tournament ||
            !tournament.organization ||
            tournament.organization.members.length === 0
          ) {
            return sendResponse({
              success: false,
              message: "You are not eligible to create these event",
            });
          }

          const sport = await db.query.sportsOptionsTable.findFirst({
            where: {
              code: event.sportsOptionCode,
            },
            columns: {
              id: true,
            },
          });

          const eventFormat = await db.query.eventFormatsTable.findFirst({
            where: {
              code: event.eventFormatCode,
            },
            columns: {
              id: true,
            },
          });

          const teamType = await db.query.teamTypesTable.findFirst({
            where: {
              code: event.teamTypeCode,
            },
            columns: {
              id: true,
            },
          });
          console.log(teamType);
          console.log(event.teamTypeCode);
          console.log(event.name);

          const paymentMode =
            event.paymentModeCode !== null
              ? await db.query.paymentModesTable.findFirst({
                  where: {
                    code: event.paymentModeCode,
                  },
                  columns: {
                    id: true,
                  },
                })
              : null;

          if (
            !sport ||
            !eventFormat ||
            !teamType ||
            (event.paymentModeCode && !paymentMode)
          ) {
            return sendResponse({
              success: false,
              message: "Invalid event details",
            });
          }

          await db.insert(eventTable).values({
            tournamentId: event.tournamentId,
            name: event.name,
            sportId: sport.id,
            formatId: eventFormat.id,
            gender: event.gender,

            dueDate: getDate(event.dueDate),
            startDate: getDate(event.startDate),

            teamTypeId: teamType.id,

            pointsPerSet: event.pointsPerSet,
            setsPerMatch: event.setsPerMatch,

            paymentModeId: paymentMode?.id,
            amount: event.amount,
            playerBornAfter:
              event.playerBornAfter !== null
                ? getDate(event.playerBornAfter!)
                : null,
          });
        }
        return sendResponse({
          success: true,
          message: "Event created successfully",
        });
      },
      {
        body: t.Array(
          t.Object({
            tournamentId: t.String({ format: "uuid" }),
            name: t.String(),
            sportsOptionCode: t.String(),
            eventFormatCode: t.String(),
            dueDate: t.String(),
            startDate: t.String(),
            gender: t.Nullable(t.UnionEnum(["male", "female"])),
            teamTypeCode: t.String(),
            setsPerMatch: t.Number(),
            pointsPerSet: t.Number(),
            playerBornAfter: t.Nullable(t.String()),
            paymentModeCode: t.Nullable(t.String()),
            amount: t.Number(),
          }),
        ),
      },
    )
    .delete(
      "/:eventId",
      async ({ db, user, params: { eventId } }) => {
        const event = await db.query.eventTable.findFirst({
          where: { id: eventId },
          with: {
            tournament: {
              columns: { organizationId: true },
            },
          },
        });

        if (!event || !event.tournament) {
          return sendResponse({
            success: false,
            message: "Event or related tournament not found",
          });
        }

        const member = await db.query.organizationMemberTable.findFirst({
          where: {
            organizationId: event.tournament.organizationId,
            userId: user.id,
          },
        });
        if (!member) {
          return sendResponse({
            success: false,
            message: "You are not eligible to delete this event",
          });
        }

        await db.transaction(async (tx) => {
          // Delete event invites
          const eventInvites = await tx
            .select({ inviteId: eventInvitesTable.inviteId })
            .from(eventInvitesTable)
            .where(eq(eventInvitesTable.eventId, eventId));

          const eventInviteIds = eventInvites.map((ei) => ei.inviteId);

          if (eventInviteIds.length > 0) {
            await tx
              .delete(eventInvitesTable)
              .where(inArray(eventInvitesTable.inviteId, eventInviteIds));
            await tx
              .delete(invitesTable)
              .where(inArray(invitesTable.id, eventInviteIds));
          }

          const matches = await tx
            .select({ id: matchTable.id })
            .from(matchTable)
            .where(eq(matchTable.eventId, eventId));

          const matchIds = matches.map((m) => m.id);

          if (matchIds.length > 0) {
            await tx
              .delete(setTable)
              .where(inArray(setTable.matchId, matchIds));
            await tx.delete(matchTable).where(inArray(matchTable.id, matchIds));
          }

          const teams = await tx
            .select({ id: teamTable.id })
            .from(teamTable)
            .where(eq(teamTable.eventId, eventId));

          const teamIds = teams.map((t) => t.id);

          if (teamIds.length > 0) {
            await tx
              .delete(teamParticipantTable)
              .where(inArray(teamParticipantTable.teamId, teamIds));
            await tx
              .delete(teamActionLogsTable)
              .where(inArray(teamActionLogsTable.teamId, teamIds));
            await tx.delete(teamTable).where(inArray(teamTable.id, teamIds));
          }

          await tx.delete(eventTable).where(eq(eventTable.id, eventId));
        });
        return sendResponse({
          success: true,
          message: "Event and all related data deleted successfully",
        });
      },
      {
        params: t.Object({ eventId: t.String({ format: "uuid" }) }),
      },
    )
    .post(
      "/update-due-date/:eventId",
      async ({ db, user, body, params: { eventId } }) => {
        const event = await db.query.eventTable.findFirst({
          where: ((table: any, { eq }: any) => eq(table.id, eventId)) as any,
          with: {
            tournament: true,
          },
        });

        if (!event || !event.tournament) {
          return sendResponse({
            success: false,
            message: "Event or related tournament not found",
          });
        }

        const member = await db.query.organizationMemberTable.findFirst({
          where: ((table: any, { eq, and }: any) =>
            and(
              eq(table.organizationId, event.tournament!.organizationId),
              eq(table.userId, user.id),
            )) as any,
        });

        if (!member) {
          return sendResponse({
            success: false,
            message: "You are not eligible to update this event",
          });
        }

        const newDueDate = getDate(body.dueDate);
        const eventStartDate = getDate(String(event.startDate));
        if (newDueDate.getTime() > eventStartDate.getTime()) {
          return sendResponse({
            success: false,
            message: "Due date cannot be after event start date",
          });
        }

        await db
          .update(eventTable)
          .set({ dueDate: newDueDate })
          .where(eq(eventTable.id, eventId));

        return sendResponse({
          success: true,
          message: "Event due date updated successfully",
          data: {
            eventId,
            dueDate: body.dueDate,
          },
        });
      },
      {
        params: t.Object({ eventId: t.String({ format: "uuid" }) }),
        body: t.Object({
          dueDate: t.String(),
        }),
      },
    )
    .post(
      "/update-state/:eventId",
      async ({ db, user, body, params: { eventId } }) => {
        const event = await db.query.eventTable.findFirst({
          where: ((table: any, { eq }: any) => eq(table.id, eventId)) as any,
          with: {
            tournament: true,
          },
        });

        if (!event || !event.tournament) {
          return sendResponse({
            success: false,
            message: "Event or related tournament not found",
          });
        }

        const member = await db.query.organizationMemberTable.findFirst({
          where: ((table: any, { eq, and }: any) =>
            and(
              eq(table.organizationId, event.tournament!.organizationId),
              eq(table.userId, user.id),
            )) as any,
        });

        if (!member) {
          return sendResponse({
            success: false,
            message: "You are not eligible to update this event state",
          });
        }

        await db
          .update(eventTable)
          .set({ eventState: body.state })
          .where(eq(eventTable.id, eventId));

        return sendResponse({
          success: true,
          message: `Event state updated to ${body.state} successfully`,
        });
      },
      {
        params: t.Object({ eventId: t.String({ format: "uuid" }) }),
        body: t.Object({
          state: t.Union([
            t.Literal("created"),
            t.Literal("registration_closed"),
            t.Literal("participants_finalized"),
            t.Literal("scheduled"),
            t.Literal("in_progress"),
            t.Literal("round_over"),
            t.Literal("completed"),
            t.Literal("cancelled"),
          ]),
        }),
      },
    )
    .get(
      "/participants/:eventId",
      async ({ db, params: { eventId } }) => {
        const participants = await db.query.teamTable.findMany({
          where: ((table: any, { eq }: any) =>
            eq(table.eventId, eventId)) as any,
          with: {
            participants: {
              with: {
                user: true,
              },
            },
          },
        });

        return sendResponse({
          success: true,
          message: "Event participants fetched successfully",
          data: participants,
        });
      },
      {
        params: t.Object({ eventId: t.String({ format: "uuid" }) }),
      },
    )
    .get(
      "/results/:eventId",
      async ({ db, params: { eventId } }) => {
        try {
          const event = await db.query.eventTable.findFirst({
            where: ((table: any, { eq }: any) => eq(table.id, eventId)) as any,
            with: {
              tournament: true,
              teams: {
                with: {
                  participants: {
                    with: {
                      user: true,
                    },
                  },
                },
              },
              winner: {
                with: {
                  participants: {
                    with: {
                      user: true,
                    },
                  },
                },
              },
              matches: {
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
              },
            },
          });

          if (!event) {
            return sendResponse({
              success: false,
              message: "Event not found",
            });
          }

          const getTeamMeta = (team: any) => {
            const participants = team?.participants ?? [];
            const names = participants
              .map((p: any) => p?.user?.name)
              .filter(Boolean) as string[];
            const avatarUrl =
              participants.find((p: any) => p?.user?.profilePicUrl)?.user
                ?.profilePicUrl ?? null;

            return {
              id: team?.id,
              name: names.length > 0 ? names.join(" / ") : "Unknown Team",
              avatarUrl,
              players: participants
                .map((p: any) => ({
                  id: p?.user?.id ?? null,
                  name: p?.user?.name ?? "Unknown Player",
                  avatarUrl: p?.user?.profilePicUrl ?? null,
                }))
                .filter((p: any) => p.id !== null),
            };
          };

          const statsByTeam = new Map<string, any>();

          for (const team of event.teams ?? []) {
            const meta = getTeamMeta(team);
            if (!meta.id) continue;
            statsByTeam.set(meta.id, {
              teamId: meta.id,
              teamName: meta.name,
              avatarUrl: meta.avatarUrl,
              players: meta.players,
              played: 0,
              wins: 0,
              losses: 0,
              setsWon: 0,
              setsLost: 0,
              pointsFor: 0,
              pointsAgainst: 0,
            });
          }

          for (const match of event.matches ?? []) {
            const teamAId = match.teamA;
            const teamBId = match.teamB;
            if (!teamAId || !teamBId) continue;

            if (!statsByTeam.has(teamAId)) {
              const meta = getTeamMeta(match.teamAData);
              statsByTeam.set(teamAId, {
                teamId: teamAId,
                teamName: meta.name,
                avatarUrl: meta.avatarUrl,
                players: meta.players,
                played: 0,
                wins: 0,
                losses: 0,
                setsWon: 0,
                setsLost: 0,
                pointsFor: 0,
                pointsAgainst: 0,
              });
            }
            if (!statsByTeam.has(teamBId)) {
              const meta = getTeamMeta(match.teamBData);
              statsByTeam.set(teamBId, {
                teamId: teamBId,
                teamName: meta.name,
                avatarUrl: meta.avatarUrl,
                players: meta.players,
                played: 0,
                wins: 0,
                losses: 0,
                setsWon: 0,
                setsLost: 0,
                pointsFor: 0,
                pointsAgainst: 0,
              });
            }

            const a = statsByTeam.get(teamAId);
            const b = statsByTeam.get(teamBId);
            if (!a || !b) continue;

            const isPlayed = ["completed", "walkover", "abandoned"].includes(
              match.matchState,
            );
            if (isPlayed) {
              a.played += 1;
              b.played += 1;
            }

            for (const set of match.sets ?? []) {
              const aScore = set.teamAScore ?? 0;
              const bScore = set.teamBScore ?? 0;
              a.pointsFor += aScore;
              a.pointsAgainst += bScore;
              b.pointsFor += bScore;
              b.pointsAgainst += aScore;

              if ((set.setStatus ?? "") !== "completed") continue;
              if (aScore > bScore) {
                a.setsWon += 1;
                b.setsLost += 1;
              } else if (bScore > aScore) {
                b.setsWon += 1;
                a.setsLost += 1;
              }
            }

            if (match.winnerId && statsByTeam.has(match.winnerId)) {
              const winner = statsByTeam.get(match.winnerId);
              const loser = match.winnerId === teamAId ? b : a;
              winner.wins += 1;
              loser.losses += 1;
            }
          }

          const standings = Array.from(statsByTeam.values())
            .map((row) => ({
              ...row,
              setDiff: row.setsWon - row.setsLost,
              pointDiff: row.pointsFor - row.pointsAgainst,
            }))
            .sort((x, y) => {
              if (y.wins !== x.wins) return y.wins - x.wins;
              if (y.setDiff !== x.setDiff) return y.setDiff - x.setDiff;
              if (y.pointDiff !== x.pointDiff) return y.pointDiff - x.pointDiff;
              return x.teamName.localeCompare(y.teamName);
            })
            .map((row, index) => ({
              ...row,
              rank: index + 1,
              label:
                index === 0
                  ? "Winner"
                  : index === 1
                    ? "Runner Up"
                    : index === 2
                      ? "Third Place"
                      : null,
            }));

          const championTeamId = event.winnerId || standings[0]?.teamId || null;
          const champion =
            standings.find((s) => s.teamId === championTeamId) ||
            standings[0] ||
            null;

          return sendResponse({
            success: true,
            message: "Event results fetched successfully",
            data: {
              event: {
                id: event.id,
                name: event.name,
                eventState: event.eventState,
                tournamentId: event.tournamentId,
              },
              champion,
              standings,
              totalTeams: standings.length,
              totalMatches: (event.matches ?? []).length,
            },
          });
        } catch (error) {
          console.error("[event/results] failed", error);
          return sendResponse({
            success: false,
            message: "Failed to fetch event results",
          });
        }
      },
      {
        params: t.Object({ eventId: t.String({ format: "uuid" }) }),
      },
    )
    .post(
      "/finalize-participants/:eventId",
      async ({ db, user, params: { eventId } }) => {
        try {
          const event = await db.query.eventTable.findFirst({
            where: ((table: any, { eq }: any) => eq(table.id, eventId)) as any,
            with: {
              tournament: true,
            },
          });

          if (!event || !event.tournament) {
            return sendResponse({
              success: false,
              message: "Event or related tournament not found",
            });
          }

          const member = await db.query.organizationMemberTable.findFirst({
            where: ((table: any, { eq, and }: any) =>
              and(
                eq(table.organizationId, event.tournament!.organizationId),
                eq(table.userId, user.id),
              )) as any,
          });
          if (!member) {
            return sendResponse({
              success: false,
              message: "You are not eligible to finalize participants",
            });
          }

          await db.transaction(async (tx) => {
            // Update event state and active round
            await tx
              .update(eventTable)
              .set({
                eventState: "participants_finalized",
                activeRound: 1,
              })
              .where(eq(eventTable.id, eventId));

            // Update all teams that are not rejected or disqualified to participating
            await tx
              .update(teamTable)
              .set({ teamStatus: "participating" })
              .where(
                and(
                  eq(teamTable.eventId, eventId),
                  notInArray(teamTable.teamStatus, [
                    "rejected",
                    "disqualified",
                  ]),
                ),
              );
          });

          return sendResponse({
            success: true,
            message: "Participants finalized successfully",
          });
        } catch (error) {
          console.error("[event/finalize-participants] failed", error);
          return sendResponse({
            success: false,
            message: "Failed to finalize participants",
          });
        }
      },
      {
        params: t.Object({ eventId: t.String({ format: "uuid" }) }),
      },
    )
    .post(
      "/finalize-schedule/:eventId",
      async ({ db, user, body, params: { eventId } }) => {
        try {
          const event = await db.query.eventTable.findFirst({
            where: ((table: any, { eq }: any) => eq(table.id, eventId)) as any,
            with: {
              tournament: true,
            },
          });

          if (!event || !event.tournament) {
            return sendResponse({
              success: false,
              message: "Event or related tournament not found",
            });
          }

          const member = await db.query.organizationMemberTable.findFirst({
            where: ((table: any, { eq, and }: any) =>
              and(
                eq(table.organizationId, event.tournament!.organizationId),
                eq(table.userId, user.id),
              )) as any,
          });
          if (!member) {
            return sendResponse({
              success: false,
              message: "You are not eligible to finalize the schedule",
            });
          }

          await db.transaction(async (tx) => {
            // Update event state
            await tx
              .update(eventTable)
              .set({ eventState: "scheduled" })
              .where(eq(eventTable.id, eventId));

            // Create matches
            for (const match of body.matches) {
              await tx.insert(matchTable).values({
                eventId: eventId,
                roundNumber: match.roundNumber,
                teamA: match.teamA,
                teamB: match.teamB,
                scorer: match.scorer || user.id,
                matchState: "scheduled",
                setsPerMatchId: match.setsPerMatch || event.setsPerMatch,
                pointsPerSet: match.pointsPerSet || event.pointsPerSet,
                sideSwitching: match.sideSwitching || "per_set",
              });
            }
          });

          return sendResponse({
            success: true,
            message: "Schedule finalized and matches created successfully",
          });
        } catch (error) {
          console.error("[event/finalize-schedule] failed", error);
          return sendResponse({
            success: false,
            message: "Failed to finalize schedule",
          });
        }
      },
      {
        params: t.Object({ eventId: t.String({ format: "uuid" }) }),
        body: t.Object({
          matches: t.Array(
            t.Object({
              roundNumber: t.Number(),
              teamA: t.String(),
              teamB: t.String(),
              scorer: t.Optional(t.String()),
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
        }),
      },
    )
    .post(
      "/complete/:eventId",
      async ({ db, user, body, params: { eventId } }) => {
        try {
          const event = await db.query.eventTable.findFirst({
            where: ((table: any, { eq }: any) => eq(table.id, eventId)) as any,
            with: {
              tournament: true,
            },
          });

          if (!event || !event.tournament) {
            return sendResponse({
              success: false,
              message: "Event or related tournament not found",
            });
          }

          const member = await db.query.organizationMemberTable.findFirst({
            where: ((table: any, { eq, and }: any) =>
              and(
                eq(table.organizationId, event.tournament!.organizationId),
                eq(table.userId, user.id),
              )) as any,
          });
          if (!member) {
            return sendResponse({
              success: false,
              message: "You are not eligible to complete this event",
            });
          }

          await db
            .update(eventTable)
            .set({
              eventState: "completed",
              winnerId: body.winnerId,
            })
            .where(eq(eventTable.id, eventId));

          return sendResponse({
            success: true,
            message: "Event completed successfully",
          });
        } catch (error) {
          console.error("[event/complete] failed", error);
          return sendResponse({
            success: false,
            message: "Failed to complete event",
          });
        }
      },
      {
        params: t.Object({ eventId: t.String({ format: "uuid" }) }),
        body: t.Object({
          winnerId: t.String(),
          runnerUpId: t.String(),
        }),
      },
    ),
);
