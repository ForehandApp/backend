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
  tournamentInvitesTable,
  tournamentTable,
  tournamentVolunteerTable,
  organizationMemberTable,
  profileTable,
} from "@/services/db/schema";
import { inArray, eq, notInArray, or, and } from "drizzle-orm";
import { getDate } from "@/utils/helpers";
import { sendResponse } from "@/utils/response";
import { t } from "elysia";

function sanitizeTournamentTree(tournament: any) {
  if (!tournament) return tournament;
  return tournament;
}

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

        const sanitizedTournament = sanitizeTournamentTree(tournament);

        return sendResponse({
          success: true,
          message: "Tournament retrieved successfully",
          data: sanitizedTournament,
        });
      },
      {
        params: t.Object({ tournamentId: t.String({ format: "uuid" }) }),
      },
    )
    .patch(
      "/:tournamentId",
      async ({ db, user, params: { tournamentId }, body }) => {
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
            message: "You are not eligible to update this tournament",
          });
        }

        const updateValues: Record<string, any> = {};
        if (body.name !== undefined) updateValues.name = body.name;
        if (body.description !== undefined) updateValues.description = body.description;
        if (body.startDate !== undefined) updateValues.startDate = getDate(body.startDate);
        if (body.endDate !== undefined) {
          updateValues.endDate = body.endDate !== null ? getDate(body.endDate) : null;
        }
        if (body.venueName !== undefined) updateValues.venueName = body.venueName;
        if (body.venueAddress !== undefined) updateValues.venueAddress = body.venueAddress;
        if (body.venueCity !== undefined) updateValues.venueCity = body.venueCity;
        if (body.venueState !== undefined) updateValues.venueState = body.venueState;
        if (body.venuePostalCode !== undefined) updateValues.venuePostalCode = body.venuePostalCode;
        if (body.venueCourts !== undefined) updateValues.venueCourts = body.venueCourts;
        if (body.contactName !== undefined) updateValues.contactName = body.contactName;
        if (body.contactEmail !== undefined) updateValues.contactEmail = body.contactEmail;
        if (body.contactPhone !== undefined) updateValues.contactPhone = body.contactPhone;
        if (body.upiId !== undefined) updateValues.upiId = body.upiId;
        if (body.logoUrl !== undefined) updateValues.logoUrl = body.logoUrl;
        if (body.logoPath !== undefined) updateValues.logoPath = body.logoPath;

        if (Object.keys(updateValues).length === 0) {
          return sendResponse({
            success: false,
            message: "No fields to update",
          });
        }

        await db
          .update(tournamentTable)
          .set(updateValues)
          .where(eq(tournamentTable.id, tournamentId));

        return sendResponse({
          success: true,
          message: "Tournament updated successfully",
        });
      },
      {
        params: t.Object({ tournamentId: t.String({ format: "uuid" }) }),
        body: t.Object({
          name: t.Optional(t.String()),
          description: t.Optional(t.String()),
          startDate: t.Optional(t.String()),
          endDate: t.Optional(t.Nullable(t.String())),
          venueName: t.Optional(t.String()),
          venueAddress: t.Optional(t.Nullable(t.String())),
          venueCity: t.Optional(t.String()),
          venueState: t.Optional(t.String()),
          venuePostalCode: t.Optional(t.String()),
          venueCourts: t.Optional(t.Number()),
          contactName: t.Optional(t.String()),
          contactEmail: t.Optional(t.String()),
          contactPhone: t.Optional(t.String({ pattern: "^[6-9]\\d{9}$" })),
          upiId: t.Optional(t.Nullable(t.String())),
          logoUrl: t.Optional(t.Nullable(t.String())),
          logoPath: t.Optional(t.Nullable(t.String())),
        }),
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

          const eventSummaries = (sanitizeTournamentTree(tournament).events ?? []).map(
            (event: any) => {
              const teams = event.teams ?? [];
              const matches = event.matches ?? [];

              const enrolledParticipants = teams.reduce(
                (sum: number, team: any) =>
                  sum + (team.participants?.length ?? 0),
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
              const remainingMatches = Math.max(
                totalMatches - completedMatches,
                0,
              );

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
            },
          );

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
                      teamType: true,
                      eventFormat: true,
                    },
                  },
                  organization: {
                    with: {
                      orgType: true,
                    },
                  },
                },
              });

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
                where: ((table: any, { inArray }: any) =>
                  inArray(table.id, joinedTournamentIds)) as any,
                with: {
                  events: {
                    with: {
                      sportsOption: true,
                      teamType: true,
                      eventFormat: true,
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
                .filter(
                  (t) =>
                    t.tournamentState === "published" ||
                    t.tournamentState === "in_progress",
                )
                .map((t) => ({
                  ...t,
                  events: t.events.filter((e: any) => joinedEventIds.has(e.id)),
                }))
                .filter((t) => t.events.length > 0);

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
                      teamType: true,
                      eventFormat: true,
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
            })
            .get("/managed", async ({ db, user }) => {
              console.info("[tournamentRoutes.managed] loading", {
                userId: user.id,
                role: "admin",
                source: "accepted_admin_invite_and_admin_volunteer_role",
              });

              const [acceptedAdminCrewInvites, allCrewInviteRows, allVolunteerRows] =
                await Promise.all([
                  db
                    .select({
                      inviteId: invitesTable.id,
                      tournamentId: tournamentInvitesTable.tournamentId,
                      inviteState: invitesTable.inviteState,
                      role: tournamentInvitesTable.role,
                    })
                    .from(tournamentInvitesTable)
                    .innerJoin(
                      invitesTable,
                      eq(tournamentInvitesTable.inviteId, invitesTable.id),
                    )
                    .where(
                      and(
                        eq(invitesTable.receiverId, user.id),
                        eq(invitesTable.inviteState, "accepted"),
                        eq(tournamentInvitesTable.role, "admin"),
                      ),
                    ),
                  db
                    .select({
                      inviteId: invitesTable.id,
                      tournamentId: tournamentInvitesTable.tournamentId,
                      inviteState: invitesTable.inviteState,
                      role: tournamentInvitesTable.role,
                    })
                    .from(tournamentInvitesTable)
                    .innerJoin(
                      invitesTable,
                      eq(tournamentInvitesTable.inviteId, invitesTable.id),
                    )
                    .where(eq(invitesTable.receiverId, user.id)),
                  db
                    .select({
                      tournamentId: tournamentVolunteerTable.tournamentId,
                      role: tournamentVolunteerTable.role,
                    })
                    .from(tournamentVolunteerTable)
                    .where(eq(tournamentVolunteerTable.userId, user.id)),
                ]);

              const acceptedAdminInviteTournamentIds = new Set(
                acceptedAdminCrewInvites
                  .map((row) => row.tournamentId)
                  .filter(Boolean),
              );
              const adminVolunteerTournamentIds = new Set(
                allVolunteerRows
                  .filter((row) => row.role === "admin")
                  .map((row) => row.tournamentId)
                  .filter(Boolean),
              );
              const scorerVolunteerTournamentIds = new Set(
                allVolunteerRows
                  .filter((row) => row.role === "scorer")
                  .map((row) => row.tournamentId)
                  .filter(Boolean),
              );

              const managedTournamentIds = [
                ...new Set(
                  [...acceptedAdminInviteTournamentIds].filter((tournamentId) =>
                    adminVolunteerTournamentIds.has(tournamentId),
                  ),
                ),
              ];
              const managedTournamentIdSet = new Set(managedTournamentIds);
              const inviteOnlyTournamentIds = [
                ...acceptedAdminInviteTournamentIds,
              ].filter(
                (tournamentId) => !adminVolunteerTournamentIds.has(tournamentId),
              );
              const volunteerOnlyTournamentIds = [
                ...adminVolunteerTournamentIds,
              ].filter(
                (tournamentId) =>
                  !acceptedAdminInviteTournamentIds.has(tournamentId),
              );
              const scorerOnlyTournamentIds = [
                ...scorerVolunteerTournamentIds,
              ].filter(
                (tournamentId) => !adminVolunteerTournamentIds.has(tournamentId),
              );

              console.info("[tournamentRoutes.managed] accepted crew invites", {
                userId: user.id,
                inviteCount: acceptedAdminCrewInvites.length,
                inviteIds: acceptedAdminCrewInvites.map((row) => row.inviteId),
                acceptedAdminInviteTournamentIds: [
                  ...acceptedAdminInviteTournamentIds,
                ],
                adminVolunteerTournamentIds: [...adminVolunteerTournamentIds],
                scorerVolunteerTournamentIds: [...scorerVolunteerTournamentIds],
                managedTournamentIds,
                excludedPotentialCauses: {
                  inviteOnlyTournamentIds,
                  volunteerOnlyTournamentIds,
                  scorerOnlyTournamentIds,
                },
              });

              console.info("[tournamentRoutes.managed] user role audit", {
                userId: user.id,
                acceptedAdminCrewInvites: acceptedAdminCrewInvites.map((row) => ({
                  inviteId: row.inviteId,
                  tournamentId: row.tournamentId,
                  inviteState: row.inviteState,
                  role: row.role,
                  hasAdminVolunteerRole: adminVolunteerTournamentIds.has(
                    row.tournamentId,
                  ),
                  hasScorerVolunteerRole: scorerVolunteerTournamentIds.has(
                    row.tournamentId,
                  ),
                  qualifiesAsAdmin: adminVolunteerTournamentIds.has(
                    row.tournamentId,
                  ),
                })),
                allCrewInvitesForUser: allCrewInviteRows.map((row) => ({
                  inviteId: row.inviteId,
                  tournamentId: row.tournamentId,
                  inviteState: row.inviteState,
                  role: row.role,
                  hasAdminVolunteerRole: adminVolunteerTournamentIds.has(
                    row.tournamentId,
                  ),
                  hasScorerVolunteerRole: scorerVolunteerTournamentIds.has(
                    row.tournamentId,
                  ),
                  qualifiesAsAdmin:
                    row.inviteState === "accepted" &&
                    row.role === "admin" &&
                    adminVolunteerTournamentIds.has(row.tournamentId),
                })),
                allVolunteerRowsForUser: allVolunteerRows.map((row) => ({
                  tournamentId: row.tournamentId,
                  role: row.role,
                  hasAcceptedAdminInvite: acceptedAdminInviteTournamentIds.has(
                    row.tournamentId,
                  ),
                  qualifiesAsAdmin:
                    row.role === "admin" &&
                    acceptedAdminInviteTournamentIds.has(row.tournamentId),
                })),
              });
              console.info("[tournamentRoutes.managed] strict assignment filter", {
                userId: user.id,
                acceptedAdminInviteCount: acceptedAdminInviteTournamentIds.size,
                adminVolunteerCount: adminVolunteerTournamentIds.size,
                scorerVolunteerCount: scorerVolunteerTournamentIds.size,
                returnedTournamentIds: managedTournamentIds,
                excludedInviteOnlyCount: inviteOnlyTournamentIds.length,
                excludedVolunteerOnlyCount: volunteerOnlyTournamentIds.length,
                excludedScorerOnlyCount: scorerOnlyTournamentIds.length,
              });

              if (managedTournamentIds.length === 0) {
                console.info("[tournamentRoutes.managed] no tournaments", {
                  userId: user.id,
                  acceptedAdminInviteCount: acceptedAdminCrewInvites.length,
                  crewInviteCount: allCrewInviteRows.length,
                  volunteerRowCount: allVolunteerRows.length,
                  adminVolunteerCount: adminVolunteerTournamentIds.size,
                  scorerVolunteerCount: scorerVolunteerTournamentIds.size,
                });

                return sendResponse({
                  success: true,
                  message: "No managed tournaments found",
                  data: [],
                });
              }

              const tournaments = await db.query.tournamentTable.findMany({
                where: ((table: any, { inArray }: any) =>
                  inArray(table.id, managedTournamentIds)) as any,
                with: {
                  events: {
                    with: {
                      sportsOption: true,
                      teamType: true,
                      eventFormat: true,
                    },
                  },
                  organization: true,
                },
                orderBy: (table: any, { desc }: any) => [desc(table.createdAt)],
              });
              const filteredTournaments = (tournaments as any[]).filter(
                (tournament) => managedTournamentIdSet.has(tournament.id),
              );
              const blockedTournamentIds = (tournaments as any[])
                .filter((tournament) => !managedTournamentIdSet.has(tournament.id))
                .map((tournament) => tournament.id);

              if (blockedTournamentIds.length > 0) {
                console.warn("[tournamentRoutes.managed] blocked out-of-scope rows", {
                  userId: user.id,
                  blockedTournamentIds,
                  managedTournamentIds,
                });
              }

              console.info("[tournamentRoutes.managed] returning", {
                userId: user.id,
                tournamentCount: filteredTournaments.length,
                tournaments: filteredTournaments.map((tournament: any) => ({
                  id: tournament.id,
                  name: tournament.name,
                  organizationId: tournament.organizationId,
                  acceptedAdminInviteIds: acceptedAdminCrewInvites
                    .filter((row) => row.tournamentId === tournament.id)
                    .map((row) => row.inviteId),
                  hasAcceptedAdminInvite: acceptedAdminCrewInvites.some(
                    (row) => row.tournamentId === tournament.id,
                  ),
                  hasAdminVolunteerRole: adminVolunteerTournamentIds.has(
                    tournament.id,
                  ),
                  hasScorerVolunteerRole: scorerVolunteerTournamentIds.has(
                    tournament.id,
                  ),
                  volunteerRoles: allVolunteerRows
                    .filter((row) => row.tournamentId === tournament.id)
                    .map((row) => row.role),
                })),
              });

              return sendResponse({
                success: true,
                message: "Managed tournaments retrieved successfully",
                data: filteredTournaments,
              });
            })
            .get("/scorer", async ({ db, user }) => {
              const scorerAssignments = await db
                .select({
                  tournamentId: tournamentVolunteerTable.tournamentId,
                })
                .from(tournamentVolunteerTable)
                .where(
                  and(
                    eq(tournamentVolunteerTable.userId, user.id),
                    eq(tournamentVolunteerTable.role, "scorer"),
                  ),
                );

              const scorerTournamentIds = [
                ...new Set(scorerAssignments.map((row) => row.tournamentId)),
              ];

              if (scorerTournamentIds.length === 0) {
                return sendResponse({
                  success: true,
                  message: "No scorer tournaments found",
                  data: [],
                });
              }

              const tournaments = await db.query.tournamentTable.findMany({
                where: ((table: any, { inArray }: any) =>
                  inArray(table.id, scorerTournamentIds)) as any,
                with: {
                  events: {
                    with: {
                      sportsOption: true,
                      teamType: true,
                      eventFormat: true,
                    },
                  },
                  organization: true,
                },
                orderBy: (table: any, { desc }: any) => [desc(table.createdAt)],
              });

              return sendResponse({
                success: true,
                message: "Scorer tournaments retrieved successfully",
                data: tournaments,
              });
            }),
        ),
    ),
);
