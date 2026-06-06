import { protectedApi } from "@/controller";
import {
  eventInvitesTable,
  eventTable,
  invitesTable,
  matchTable,
  setTable,
  teamActionLogsTable,
  teamParticipantTable,
  teamTable,
  tournamentInvitesTable,
  tournamentTable,
  tournamentVolunteerTable,
  profileTable,
} from "@/services/db/schema";
import { inArray, eq, notInArray, or, and } from "drizzle-orm";
import { getDate } from "@/utils/helpers";
import { sendResponse } from "@/utils/response";
import { t } from "elysia";

export const tournamentRoutes = protectedApi.group("/tournament", (app) =>
  app
    .get(
      "/info/:tournamentId",
      async ({ db, params: { tournamentId } }) => {
        const tournament = await db.query.tournamentTable.findFirst({
          with: {
            events: {
              with: {
                paymentMode: true,
                sportsOption: true,
                eventFormat: true,
                teamType: true,
                teams: true,
              },
            },
            organization: true,
          },
          where: { id: tournamentId },
        });

        return sendResponse({
          success: true,
          message: "Tournament retrieved successfully",
          data: tournament,
        });
      },
      {
        params: t.Object({ tournamentId: t.String({ format: "uuid" }) }),
      },
    )
    .get(
      "/participants/:tournamentId",
      async ({ db, params: { tournamentId } }) => {
        const participants = await db
          .select({
            user: profileTable,
            team: teamTable,
            event: eventTable,
          })
          .from(teamParticipantTable)
          .innerJoin(teamTable, eq(teamParticipantTable.teamId, teamTable.id))
          .innerJoin(eventTable, eq(teamTable.eventId, eventTable.id))
          .innerJoin(
            profileTable,
            eq(teamParticipantTable.userId, profileTable.id),
          )
          .where(eq(eventTable.tournamentId, tournamentId));

        return sendResponse({
          success: true,
          message: "Tournament participants fetched successfully",
          data: participants,
        });
      },
      {
        params: t.Object({ tournamentId: t.String({ format: "uuid" }) }),
      },
    )
    .get(
      "/summary/:tournamentId",
      async ({ db, user, params: { tournamentId } }) => {
        try {
          const tournament = await db.query.tournamentTable.findFirst({
            where: ((table: any, { eq }: any) =>
              eq(table.id, tournamentId)) as any,
            with: {
              events: {
                with: {
                  teams: {
                    with: {
                      participants: true,
                    },
                  },
                  matches: true,
                },
              },
            },
          });

          if (!tournament) {
            return sendResponse({
              success: false,
              message: "Tournament not found",
            });
          }

          const member = await db.query.organizationMemberTable.findFirst({
            where: ((table: any, { eq, and }: any) =>
              and(
                eq(table.organizationId, tournament.organizationId),
                eq(table.userId, user.id),
              )) as any,
          });

          if (!member) {
            return sendResponse({
              success: false,
              message: "You are not eligible to view this tournament summary",
            });
          }

          const eventSummaries = (tournament.events ?? []).map((event: any) => {
            const teams = event.teams ?? [];
            const matches = event.matches ?? [];

            const enrolledParticipants = teams.reduce(
              (sum: number, team: any) => sum + (team.participants?.length ?? 0),
              0,
            );

            const totalTeams = teams.length;
            const amount = Number(event.amount ?? 0);
            const totalCollected = amount * totalTeams;

            const totalMatches = matches.length;
            const completedMatches = matches.filter(
              (m: any) => m.matchState === "completed",
            ).length;
            const liveMatches = matches.filter(
              (m: any) => m.matchState === "in_progress",
            ).length;
            const remainingMatches = Math.max(totalMatches - completedMatches, 0);

            let stageText = "Registrations Open";
            if (event.eventState === "scheduled") {
              stageText = "Fixtures Scheduled";
            } else if (event.eventState === "in_progress") {
              stageText =
                remainingMatches > 0
                  ? `${remainingMatches} matches left`
                  : "Matches in progress";
            } else if (event.eventState === "completed") {
              stageText = "Event Completed";
            } else if (event.eventState === "cancelled") {
              stageText = "Event Cancelled";
            } else if (event.eventState === "participants_finalized") {
              stageText = "Participants Finalized";
            } else if (event.eventState === "registration_closed") {
              stageText = "Registration Closed";
            }

            return {
              eventId: event.id,
              eventName: event.name,
              eventState: event.eventState,
              amount,
              totalCollected,
              totalTeams,
              enrolledParticipants,
              confirmedParticipants: enrolledParticipants,
              totalMatches,
              completedMatches,
              liveMatches,
              remainingMatches,
              activeRound: event.activeRound,
              dueDate: event.dueDate,
              startDate: event.startDate,
              stageText,
            };
          });

          return sendResponse({
            success: true,
            message: "Tournament summary fetched successfully",
            data: {
              tournamentId,
              updatedAt: new Date().toISOString(),
              events: eventSummaries,
            },
          });
        } catch (error) {
          console.error("[tournament/summary] failed", error);
          return sendResponse({
            success: false,
            message: "Failed to fetch tournament summary",
          });
        }
      },
      {
        params: t.Object({ tournamentId: t.String({ format: "uuid" }) }),
      },
    )
    .post(
      "/publish/:tournamentId",
      async ({ db, user, params: { tournamentId } }) => {
        const tournament = await db.query.tournamentTable.findFirst({
          where: { id: tournamentId },
        });

        if (!tournament) {
          return sendResponse({
            success: false,
            message: "Tournament not found",
          });
        }

        const member = await db.query.organizationMemberTable.findFirst({
          where: ((table: any, { eq, and }: any) =>
            and(
              eq(table.organizationId, tournament.organizationId),
              eq(table.userId, user.id),
            )) as any,
        });

        if (!member) {
          return sendResponse({
            success: false,
            message: "You are not eligible to publish this tournament",
          });
        }

        if (tournament.tournamentState !== "drafted") {
          return sendResponse({
            success: false,
            message: `Tournament cannot be published from its current state: ${tournament.tournamentState}`,
          });
        }

        await db
          .update(tournamentTable)
          .set({ tournamentState: "published" })
          .where(eq(tournamentTable.id, tournamentId));

        return sendResponse({
          success: true,
          message: "Tournament published successfully",
        });
      },
      {
        params: t.Object({ tournamentId: t.String({ format: "uuid" }) }),
      },
    )
    .post(
      "/update-state/:tournamentId",
      async ({ db, user, body, params: { tournamentId } }) => {
        const tournament = await db.query.tournamentTable.findFirst({
          where: { id: tournamentId },
        });

        if (!tournament) {
          return sendResponse({
            success: false,
            message: "Tournament not found",
          });
        }

        const member = await db.query.organizationMemberTable.findFirst({
          where: ((table: any, { eq, and }: any) =>
            and(
              eq(table.organizationId, tournament.organizationId),
              eq(table.userId, user.id),
            )) as any,
        });

        if (!member) {
          return sendResponse({
            success: false,
            message: "You are not eligible to update this tournament state",
          });
        }

        await db
          .update(tournamentTable)
          .set({ tournamentState: body.state })
          .where(eq(tournamentTable.id, tournamentId));

        return sendResponse({
          success: true,
          message: `Tournament state updated to ${body.state} successfully`,
        });
      },
      {
        params: t.Object({ tournamentId: t.String() }),
        body: t.Object({
          state: t.Union([
            t.Literal("drafted"),
            t.Literal("published"),
            t.Literal("in_progress"),
            t.Literal("completed"),
            t.Literal("cancelled"),
          ]),
        }),
      },
    )
    .post(
      "/sync-status/:tournamentId",
      async ({ db, user, params: { tournamentId } }) => {
        try {
          const tournament = await db.query.tournamentTable.findFirst({
            where: ((table: any, { eq }: any) =>
              eq(table.id, tournamentId)) as any,
            with: {
              organization: true,
              events: true,
            },
          });

          if (!tournament) {
            return sendResponse({
              success: false,
              message: "Tournament not found",
            });
          }

          const member = await db.query.organizationMemberTable.findFirst({
            where: ((table: any, { eq, and }: any) =>
              and(
                eq(table.organizationId, tournament.organizationId),
                eq(table.userId, user.id),
              )) as any,
          });

          if (!member) {
            return sendResponse({
              success: false,
              message: "You are not authorized to sync this tournament status",
            });
          }

          const events = tournament.events;
          if (events.length === 0) {
            return sendResponse({
              success: true,
              message: "Tournament has no events to sync",
            });
          }

          let newState:
            | "drafted"
            | "published"
            | "in_progress"
            | "completed"
            | "cancelled" = tournament.tournamentState;

          const anyInProgress = events.some(
            (e: any) =>
              !["created", "cancelled", "completed"].includes(e.eventState),
          );
          const allFinished = events.every((e: any) =>
            ["completed", "cancelled"].includes(e.eventState),
          );

          if (anyInProgress) {
            newState = "in_progress";
          } else if (allFinished) {
            newState = "completed";
          }

          if (newState !== tournament.tournamentState) {
            await db
              .update(tournamentTable)
              .set({ tournamentState: newState })
              .where(eq(tournamentTable.id, tournamentId));
          }

          return sendResponse({
            success: true,
            message: `Tournament status synced to ${newState} successfully`,
          });
        } catch (error) {
          console.error("[tournament/sync-status] failed", error);
          return sendResponse({
            success: false,
            message: "Failed to sync tournament status",
          });
        }
      },
      {
        params: t.Object({ tournamentId: t.String({ format: "uuid" }) }),
      },
    )

    .delete(
      "delete/:tournamentId",
      async ({ db, user, params: { tournamentId } }) => {
        // Check if user is eligible (member of the organization that owns the tournament)
        const tournament = await db.query.tournamentTable.findFirst({
          where: ((table: any, { eq }: any) =>
            eq(table.id, tournamentId)) as any,
          with: {
            organization: true,
          },
        });

        if (!tournament) {
          return sendResponse({
            success: false,
            message: "Tournament not found",
          });
        }

        const member = await db.query.organizationMemberTable.findFirst({
          where: ((table: any, { eq, and }: any) =>
            and(
              eq(table.organizationId, tournament.organizationId),
              eq(table.userId, user.id),
            )) as any,
        });

        if (!member) {
          return sendResponse({
            success: false,
            message: "You are not eligible to delete this tournament",
          });
        }

        await db.transaction(async (tx) => {
          const events = await tx
            .select({ id: eventTable.id })
            .from(eventTable)
            .where(eq(eventTable.tournamentId, tournamentId));

          const eventIds = events.map((e) => e.id);

          if (eventIds.length > 0) {
            // Delete event invites
            const eventInvites = await tx
              .select({ inviteId: eventInvitesTable.inviteId })
              .from(eventInvitesTable)
              .where(inArray(eventInvitesTable.eventId, eventIds));

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
              .where(inArray(matchTable.eventId, eventIds));

            const matchIds = matches.map((m) => m.id);

            if (matchIds.length > 0) {
              await tx
                .delete(setTable)
                .where(inArray(setTable.matchId, matchIds));
              await tx
                .delete(matchTable)
                .where(inArray(matchTable.id, matchIds));
            }

            const teams = await tx
              .select({ id: teamTable.id })
              .from(teamTable)
              .where(inArray(teamTable.eventId, eventIds));

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

            await tx.delete(eventTable).where(inArray(eventTable.id, eventIds));
          }

          // Delete tournament invites
          const tournamentInvites = await tx
            .select({ inviteId: tournamentInvitesTable.inviteId })
            .from(tournamentInvitesTable)
            .where(eq(tournamentInvitesTable.tournamentId, tournamentId));

          const tournamentInviteIds = tournamentInvites.map(
            (ti) => ti.inviteId,
          );

          if (tournamentInviteIds.length > 0) {
            await tx
              .delete(tournamentInvitesTable)
              .where(
                inArray(tournamentInvitesTable.inviteId, tournamentInviteIds),
              );
            await tx
              .delete(invitesTable)
              .where(inArray(invitesTable.id, tournamentInviteIds));
          }

          await tx
            .delete(tournamentVolunteerTable)
            .where(eq(tournamentVolunteerTable.tournamentId, tournamentId));
          await tx
            .delete(tournamentTable)
            .where(eq(tournamentTable.id, tournamentId));
        });

        return sendResponse({
          success: true,
          message: "Tournament and all related data deleted successfully",
        });
      },
      {
        params: t.Object({ tournamentId: t.String({ format: "uuid" }) }),
      },
    )
    .post(
      "/create",
      async ({ user, db, body }) => {
        const member = await db.query.organizationMemberTable.findFirst({
          where: { organizationId: body.organizationId, userId: user.id },
        });

        if (!member)
          return sendResponse({
            success: false,
            message: "You are not eligible to create this tournament",
          });

        const tournamentInsert = await db
          .insert(tournamentTable)
          .values({
            organizationId: body.organizationId,
            name: body.name,
            description: body.description,
            startDate: getDate(body.startDate),
            endDate: body.endDate !== undefined ? getDate(body.endDate) : null,

            venueName: body.venueName,
            venueAddress: body.venueAddress,
            venueCity: body.venueCity,
            venueState: body.venueState,
            venuePostalCode: body.venuePostalCode,
            venueCourts: body.venueCourts,

            contactName: body.contactName,
            contactEmail: body.contactEmail,
            contactPhone: body.contactPhone,
            upiId: body.upiId,
          })
          .returning({ id: tournamentTable.id });

        const tournamentId = tournamentInsert[0]!.id;

        return sendResponse({
          success: true,
          message: "Tournament created successfully",
          data: tournamentId,
        });
      },
      {
        body: t.Object({
          organizationId: t.String({ format: "uuid" }),
          name: t.String(),
          description: t.String(),
          startDate: t.String(),
          endDate: t.Optional(t.String()),

          venueName: t.String(),
          venueAddress: t.String(),
          venueCity: t.String(),
          venueState: t.String(),
          venuePostalCode: t.String(),
          venueCourts: t.Number(),

          contactName: t.String(),
          contactEmail: t.String(),
          contactPhone: t.String({ pattern: "^[6-9]\\d{9}$" }),
          upiId: t.Nullable(t.String()),
        }),
      },
    )
    .group("/list", (listApp) =>
      listApp
        .get(
          "/org/:orgId",
          async ({ user, db, params: { orgId } }) => {
            const member = await db.query.organizationMemberTable.findFirst({
              where: {
                userId: user.id,
                organizationId: orgId,
              },
            });

            if (!member) {
              return sendResponse({
                success: false,
                message: "You are not a member of this organization",
              });
            }

            const tournaments = await db.query.tournamentTable.findMany({
              where: {
                organizationId: orgId,
              },
              with: {
                events: {
                  with: {
                    sportsOption: true,
                  },
                },
              },
            });

            return sendResponse({
              success: true,
              message: "Tournaments retrieved successfully",
              data: tournaments,
            });
          },
          {
            params: t.Object({
              orgId: t.String({ format: "uuid" }),
            }),
          },
        )
        .group("/user", (userApp) =>
          userApp
            .get("/browse", async ({ db, user }) => {
              const userProfile = await db.query.profileTable.findFirst({
                where: { id: user.id },
                columns: { gender: true },
              });

              if (!userProfile) {
                return sendResponse({
                  success: false,
                  message: "User profile not found",
                });
              }

              const userGender = userProfile.gender;

              const joinedTournamentsQuery = await db
                .select({ id: eventTable.tournamentId })
                .from(teamParticipantTable)
                .innerJoin(
                  teamTable,
                  eq(teamParticipantTable.teamId, teamTable.id),
                )
                .innerJoin(eventTable, eq(teamTable.eventId, eventTable.id))
                .where(eq(teamParticipantTable.userId, user.id));

              const joinedTournamentIds = new Set(
                joinedTournamentsQuery.map((r) => r.id),
              );

              const tournaments = await db.query.tournamentTable.findMany({
                where: { tournamentState: "published" },
                with: {
                  events: {
                    with: {
                      sportsOption: true,
                    },
                  },
                  organization: {
                    with: {
                      orgType: true,
                    },
                  },
                },
              });

              console.log(
                "Tournaments: ",
                tournaments.map((t) => t.id),
              );
              console.log("Joined tournament IDs: ", joinedTournamentIds);

              const filtered = tournaments.filter((t) => {
                if (joinedTournamentIds.has(t.id)) return false;

                // Check if any event is eligible for the user's gender
                return t.events.some(
                  (event: any) =>
                    event.gender === null || event.gender === userGender,
                );
              });

              return sendResponse({
                success: true,
                message: "Tournaments for browsing retrieved successfully",
                data: filtered,
              });
            })
            .get("/joined", async ({ db, user }) => {
              const joinedTournamentsQuery = await db
                .select({
                  tournamentId: eventTable.tournamentId,
                  eventId: eventTable.id,
                })
                .from(teamParticipantTable)
                .innerJoin(
                  teamTable,
                  eq(teamParticipantTable.teamId, teamTable.id),
                )
                .innerJoin(eventTable, eq(teamTable.eventId, eventTable.id))
                .where(eq(teamParticipantTable.userId, user.id));

              const joinedTournamentIds = [
                ...new Set(joinedTournamentsQuery.map((r) => r.tournamentId)),
              ];
              const joinedEventIds = new Set(
                joinedTournamentsQuery.map((r) => r.eventId),
              );

              if (joinedTournamentIds.length === 0) {
                return sendResponse({
                  success: true,
                  message: "No joined tournaments found",
                  data: [],
                });
              }

              const tournaments = await db.query.tournamentTable.findMany({
                with: {
                  events: {
                    with: {
                      sportsOption: true,
                    },
                  },
                  organization: {
                    with: {
                      orgType: true,
                    },
                  },
                },
              });

              // Filter events within each tournament to only include those the user joined
              const filtered = (tournaments as any[])
                .filter(
                  (t) =>
                    joinedTournamentIds.includes(t.id) &&
                    (t.tournamentState === "published" ||
                      t.tournamentState === "in_progress"),
                )
                .map((t) => ({
                  ...t,
                  events: t.events.filter((e: any) => joinedEventIds.has(e.id)),
                }));

              return sendResponse({
                success: true,
                message: "Joined tournaments retrieved successfully",
                data: filtered,
              });
            })
            .get("/history", async ({ db, user }) => {
              const joinedTournamentsQuery = await db
                .select({
                  tournamentId: eventTable.tournamentId,
                  eventId: eventTable.id,
                })
                .from(teamParticipantTable)
                .innerJoin(
                  teamTable,
                  eq(teamParticipantTable.teamId, teamTable.id),
                )
                .innerJoin(eventTable, eq(teamTable.eventId, eventTable.id))
                .where(eq(teamParticipantTable.userId, user.id));

              const joinedTournamentIds = [
                ...new Set(joinedTournamentsQuery.map((r) => r.tournamentId)),
              ];
              const joinedEventIds = new Set(
                joinedTournamentsQuery.map((r) => r.eventId),
              );

              if (joinedTournamentIds.length === 0) {
                return sendResponse({
                  success: true,
                  message: "No historical tournaments found",
                  data: [],
                });
              }

              const tournaments = await db.query.tournamentTable.findMany({
                where: { tournamentState: "completed" },
                with: {
                  events: {
                    with: {
                      sportsOption: true,
                    },
                  },
                  organization: {
                    with: {
                      orgType: true,
                    },
                  },
                },
              });

              const filtered = (tournaments as any[])
                .filter((t) => joinedTournamentIds.includes(t.id))
                .map((t) => ({
                  ...t,
                  events: t.events.filter((e: any) => joinedEventIds.has(e.id)),
                }));

              return sendResponse({
                success: true,
                message: "Tournament history retrieved successfully",
                data: filtered,
              });
            }),
        ),
    ),
);
