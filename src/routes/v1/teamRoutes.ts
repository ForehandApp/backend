import { protectedApi } from "@/routes/v1/controller";
import {
  eventTable,
  matchTable,
  organizationMemberTable,
  teamActionLogsTable,
  teamParticipantTable,
  teamTable,
} from "@/services/db/schema";
import {
  canViewEvent,
  canViewTeam,
  isTournamentManager,
  publicProfileColumns,
} from "@/utils/access";
import { sendResponse } from "@/utils/response";
import { eq, and, inArray, or } from "drizzle-orm";
import { t } from "elysia";

function isRegistrationClosed(event: {
  dueDate: Date | string | null | undefined;
  eventState?: string | null;
}) {
  return event.eventState === "registration_closed";
}

export const teamRoutes = protectedApi.group("/team", (app) =>
  app
    .post(
      "/create",
      async ({ user, db, body }) => {
        try {
          const event = await db.query.eventTable.findFirst({
            where: ((table: any, { eq }: any) =>
              eq(table.id, body.eventId)) as any,
            with: {
              teamType: true,
              tournament: true,
            },
          });

          if (!event || !event.teamType) {
            return sendResponse({
              success: false,
              message: "Event or team type not found",
            });
          }

          if (isRegistrationClosed(event)) {
            return sendResponse({
              success: false,
              message: "Registration is closed for this event",
            });
          }

          const participantIds = body.participantIds;
          const isManager = event.tournament
            ? await isTournamentManager(db, user.id, event.tournament)
            : false;

          // Singles check
          if (
            event.teamType.code === "singles" &&
            participantIds.length !== 1
          ) {
            return sendResponse({
              success: false,
              message: "Singles event must have exactly 1 participant",
            });
          }

          // Doubles check
          if (event.teamType.code === "doubles" && participantIds.length > 2) {
            return sendResponse({
              success: false,
              message: "Doubles event can have at most 2 participants",
            });
          }

          if (!isManager && !participantIds.includes(user.id)) {
            return sendResponse({
              success: false,
              message: "You can only register a team that includes yourself",
            });
          }

          // Check if any participant is already in this event
          const existingParticipants = await db
            .select()
            .from(teamParticipantTable)
            .innerJoin(teamTable, eq(teamParticipantTable.teamId, teamTable.id))
            .where(
              and(
                eq(teamTable.eventId, body.eventId),
                inArray(teamParticipantTable.userId, participantIds),
              ),
            );

          if (existingParticipants.length > 0) {
            const existingTeamForUser = await db
              .select({ id: teamTable.id })
              .from(teamParticipantTable)
              .innerJoin(teamTable, eq(teamParticipantTable.teamId, teamTable.id))
              .where(
                and(
                  eq(teamParticipantTable.userId, user.id),
                  eq(teamTable.eventId, body.eventId),
                ),
              )
              .limit(1);

            if (existingTeamForUser.length > 0 && existingTeamForUser[0]) {
              return sendResponse({
                success: true,
                message: "Team already exists for this event",
                data: { teamId: existingTeamForUser[0].id },
              });
            }

            return sendResponse({
              success: false,
              message:
                "One or more participants are already registered for this event",
            });
          }

          const teamId = await db.transaction(async (tx) => {
            const insertedTeams = await tx
              .insert(teamTable)
              .values({
                eventId: body.eventId,
                teamTypeId: event.teamTypeId,
                teamStatus: "created",
              })
              .returning({ id: teamTable.id });

            const newTeam = insertedTeams[0];
            if (!newTeam) throw new Error("Failed to create team");

            const participantValues = participantIds.map((userId) => ({
              teamId: newTeam.id,
              userId,
            }));

            await tx.insert(teamParticipantTable).values(participantValues);

            return newTeam.id;
          });

          return sendResponse({
            success: true,
            message: "Team created successfully",
            data: { teamId },
          });
        } catch (error) {
          console.error("[team/create] failed", error);
          return sendResponse({
            success: false,
            message: "Failed to register team",
          });
        }
      },
      {
        body: t.Object({
          eventId: t.String({ format: "uuid" }),
          participantIds: t.Array(t.String({ format: "uuid" }), {
            minItems: 1,
            maxItems: 2,
          }),
        }),
      },
    )
    .post(
      "/approve",
      async ({ user, db, body }) => {
        try {
          const team = await db.query.teamTable.findFirst({
            where: ((table: any, { eq }: any) =>
              eq(table.id, body.teamId)) as any,
            with: {
              event: {
                with: {
                  tournament: true,
                },
              },
            },
          });

          if (!team || !team.event || !team.event.tournament) {
            return sendResponse({
              success: false,
              message: "Team or related tournament not found",
            });
          }

          if (!(await isTournamentManager(db, user.id, team.event.tournament))) {
            return sendResponse({
              success: false,
              message:
                "You are not eligible to approve teams for this tournament",
            });
          }

          await db.transaction(async (tx) => {
            await tx
              .update(teamTable)
              .set({ teamStatus: "participating" })
              .where(eq(teamTable.id, body.teamId));

            await tx.insert(teamActionLogsTable).values({
              teamId: body.teamId,
              actedById: user.id,
              action: "reverted", // Should probably have "approved" but enums only show rejected, disqualified, reverted
              reason: "Team approved by admin",
            });
          });

          return sendResponse({
            success: true,
            message: "Team approved successfully",
          });
        } catch (error) {
          console.error("[team/approve] failed", error);
          return sendResponse({
            success: false,
            message: "Failed to approve team",
          });
        }
      },
      {
        body: t.Object({
          teamId: t.String({ format: "uuid" }),
        }),
      },
    )
    .post(
      "/reject",
      async ({ user, db, body }) => {
        try {
          const team = await db.query.teamTable.findFirst({
            where: ((table: any, { eq }: any) =>
              eq(table.id, body.teamId)) as any,
            with: {
              event: {
                with: {
                  tournament: true,
                },
              },
            },
          });

          if (!team || !team.event || !team.event.tournament) {
            return sendResponse({
              success: false,
              message: "Team or related tournament not found",
            });
          }

          if (!(await isTournamentManager(db, user.id, team.event.tournament))) {
            return sendResponse({
              success: false,
              message:
                "You are not eligible to reject teams for this tournament",
            });
          }

          await db.transaction(async (tx) => {
            await tx
              .update(teamTable)
              .set({ teamStatus: "rejected" })
              .where(eq(teamTable.id, body.teamId));

            await tx.insert(teamActionLogsTable).values({
              teamId: body.teamId,
              actedById: user.id,
              action: "rejected",
              reason: body.reason,
            });
          });

          return sendResponse({
            success: true,
            message: "Team rejected successfully",
          });
        } catch (error) {
          console.error("[team/reject] failed", error);
          return sendResponse({
            success: false,
            message: "Failed to reject team",
          });
        }
      },
      {
        body: t.Object({
          teamId: t.String({ format: "uuid" }),
          reason: t.String(),
        }),
      },
    )
    .post(
      "/update-state/:teamId",
      async ({ db, user, body, params: { teamId } }) => {
        const team = await db.query.teamTable.findFirst({
          where: { id: teamId },
          with: {
            event: {
              with: {
                tournament: true,
              },
            },
          },
        });

        if (!team || !team.event || !team.event.tournament) {
          return sendResponse({
            success: false,
            message: "Team or related tournament not found",
          });
        }

        const isManager = await isTournamentManager(
          db,
          user.id,
          team.event.tournament,
        );
        const selfParticipantRows =
          body.state === "registered"
            ? await db
                .select({ userId: teamParticipantTable.userId })
                .from(teamParticipantTable)
                .where(
                  and(
                    eq(teamParticipantTable.teamId, teamId),
                    eq(teamParticipantTable.userId, user.id),
                  ),
                )
                .limit(1)
            : [];

        if (!isManager && selfParticipantRows.length === 0) {
          return sendResponse({
            success: false,
            message: "You are not authorized to update this team state",
          });
        }

        if (body.state === "registered" && isRegistrationClosed(team.event)) {
          return sendResponse({
            success: false,
            message: "Registration is closed for this event",
          });
        }

        await db
          .update(teamTable)
          .set({ teamStatus: body.state })
          .where(eq(teamTable.id, teamId));

        return sendResponse({
          success: true,
          message: `Team status updated to ${body.state} successfully`,
        });
      },
      {
        params: t.Object({ teamId: t.String({ format: "uuid" }) }),
        body: t.Object({
          state: t.Union([
            t.Literal("created"),
            t.Literal("registered"),
            t.Literal("participating"),
            t.Literal("rejected"),
            t.Literal("disqualified"),
          ]),
        }),
      },
    )
    .post(
      "/add-participant",
      async ({ db, user, body }) => {
        try {
          const team = await db.query.teamTable.findFirst({
            where: { id: body.teamId },
            with: {
              event: {
                with: {
                  teamType: true,
                  tournament: true,
                },
              },
              participants: true,
            },
          });

          if (!team || !team.event || !team.event.teamType) {
            return sendResponse({
              success: false,
              message: "Team or event details not found",
            });
          }

          if (
            !team.event.tournament ||
            !(await isTournamentManager(db, user.id, team.event.tournament))
          ) {
            return sendResponse({
              success: false,
              message: "You are not authorized to add participants to this team",
            });
          }

          // Check capacity
          const currentCount = team.participants.length;
          if (team.event.teamType.code === "singles" && currentCount >= 1) {
            return sendResponse({
              success: false,
              message: "Singles team is already full",
            });
          }
          if (team.event.teamType.code === "doubles" && currentCount >= 2) {
            return sendResponse({
              success: false,
              message: "Doubles team is already full",
            });
          }

          // Check if user is already in this team
          if (team.participants.some((p: any) => p.userId === body.userId)) {
            return sendResponse({
              success: false,
              message: "User is already a participant in this team",
            });
          }

          // Check if user is already in any team for this event
          const existingInEvent = await db
            .select()
            .from(teamParticipantTable)
            .innerJoin(teamTable, eq(teamParticipantTable.teamId, teamTable.id))
            .where(
              and(
                eq(teamTable.eventId, team.eventId as string),
                eq(teamParticipantTable.userId, body.userId),
              ),
            );

          if (existingInEvent.length > 0) {
            return sendResponse({
              success: false,
              message:
                "User is already registered for this event in another team",
            });
          }

          await db.insert(teamParticipantTable).values({
            teamId: body.teamId,
            userId: body.userId,
          });

          return sendResponse({
            success: true,
            message: "Participant added to team successfully",
          });
        } catch (error) {
          console.error("[team/add-participant] failed", error);
          return sendResponse({
            success: false,
            message: "Failed to add participant to team",
          });
        }
      },
      {
        body: t.Object({
          teamId: t.String({ format: "uuid" }),
          userId: t.String({ format: "uuid" }),
        }),
      },
    )
    .post(
      "/remove-participant",
      async ({ db, user, body }) => {
        try {
          const team = await db.query.teamTable.findFirst({
            where: { id: body.teamId },
            with: {
              participants: true,
              event: {
                with: {
                  tournament: true,
                },
              },
            },
          });

          if (!team || !team.event || !team.event.tournament) {
            return sendResponse({
              success: false,
              message: "Team not found",
            });
          }

          // Check if user is actually in the team
          if (!team.participants.some((p: any) => p.userId === body.userId)) {
            return sendResponse({
              success: false,
              message: "User is not a participant in this team",
            });
          }

          // Authorization:
          // 1. User is removing themselves
          // 2. User is an organization member (admin/scorer)
          const isSelf = user.id === body.userId;
          const member = await db.query.organizationMemberTable.findFirst({
            where: ((table: any, { eq, and }: any) =>
              and(
                eq(
                  table.organizationId,
                  team.event!.tournament!.organizationId,
                ),
                eq(table.userId, user.id),
              )) as any,
          });

          if (!isSelf && !member) {
            return sendResponse({
              success: false,
              message: "You are not authorized to remove this participant",
            });
          }

          // Check if team is in any matches
          const matches = await db
            .select()
            .from(matchTable)
            .where(
              or(
                eq(matchTable.teamA, body.teamId),
                eq(matchTable.teamB, body.teamId),
              ),
            )
            .limit(1);

          if (matches.length > 0) {
            return sendResponse({
              success: false,
              message:
                "Cannot remove participant as the team is already part of a match",
            });
          }

          const participantCount = team.participants.length;

          await db.transaction(async (tx) => {
            await tx
              .delete(teamParticipantTable)
              .where(
                and(
                  eq(teamParticipantTable.teamId, body.teamId),
                  eq(teamParticipantTable.userId, body.userId),
                ),
              );

            // If it was the last participant, delete the team and logs
            if (participantCount <= 1) {
              await tx
                .delete(teamActionLogsTable)
                .where(eq(teamActionLogsTable.teamId, body.teamId));
              await tx.delete(teamTable).where(eq(teamTable.id, body.teamId));
            }
          });

          return sendResponse({
            success: true,
            message: "Participant removed successfully",
          });
        } catch (error) {
          console.error("[team/remove-participant] failed", error);
          return sendResponse({
            success: false,
            message: "Failed to remove participant",
          });
        }
      },
      {
        body: t.Object({
          teamId: t.String({ format: "uuid" }),
          userId: t.String({ format: "uuid" }),
        }),
      },
    )
    .get(
      "/list/:eventId",
      async ({ db, user, params: { eventId } }) => {
        if (!(await canViewEvent(db, user.id, eventId))) {
          return sendResponse({
            success: false,
            message: "You are not authorized to view teams for this event",
          });
        }

        const teams = await db.query.teamTable.findMany({
          where: { eventId: eventId },
          with: {
            participants: {
              with: {
                user: {
                  columns: publicProfileColumns,
                },
              },
            },
            teamType: true,
          },
        });

        return sendResponse({
          success: true,
          message: "Teams fetched successfully",
          data: teams,
        });
      },
      {
        params: t.Object({ eventId: t.String({ format: "uuid" }) }),
      },
    )
    .get(
      "/my-team/:eventId",
      async ({ db, user, params: { eventId } }) => {
        const result = await db
          .select()
          .from(teamParticipantTable)
          .innerJoin(teamTable, eq(teamParticipantTable.teamId, teamTable.id))
          .where(
            and(
              eq(teamParticipantTable.userId, user.id),
              eq(teamTable.eventId, eventId),
            ),
          )
          .limit(1);

        if (result.length === 0 || !result[0]) {
          return sendResponse({
            success: true,
            message: "User is not in any team for this event",
            data: null,
          });
        }

        const teamId = result[0].team_participant_table.teamId;

        const fullTeam = await db.query.teamTable.findFirst({
          where: { id: teamId },
          with: {
            participants: {
              with: {
                user: {
                  columns: publicProfileColumns,
                },
              },
            },
            teamType: true,
          },
        });

        return sendResponse({
          success: true,
          message: "My team fetched successfully",
          data: fullTeam,
        });
      },
      {
        params: t.Object({ eventId: t.String({ format: "uuid" }) }),
      },
    )
    .get(
      "/info/:teamId",
      async ({ db, user, params: { teamId } }) => {
        if (!(await canViewTeam(db, user.id, teamId))) {
          return sendResponse({
            success: false,
            message: "You are not authorized to view this team",
          });
        }

        const team = await db.query.teamTable.findFirst({
          where: { id: teamId },
          with: {
            participants: {
              with: {
                user: {
                  columns: publicProfileColumns,
                },
              },
            },
            teamType: true,
            event: {
              with: {
                tournament: true,
              },
            },
          },
        });

        if (!team) {
          return sendResponse({
            success: false,
            message: "Team not found",
          });
        }

        return sendResponse({
          success: true,
          message: "Team fetched successfully",
          data: team,
        });
      },
      {
        params: t.Object({ teamId: t.String({ format: "uuid" }) }),
      },
    )
    .delete(
      "/delete/:teamId",
      async ({ db, user, params: { teamId } }) => {
        try {
          const team = await db.query.teamTable.findFirst({
            where: { id: teamId },
            with: {
              event: {
                with: {
                  tournament: true,
                },
              },
            },
          });

          if (!team || !team.event || !team.event.tournament) {
            return sendResponse({
              success: false,
              message: "Team or related tournament not found",
            });
          }

          // Check if user is a member of the organization that owns the tournament
          const member = await db.query.organizationMemberTable.findFirst({
            where: ((table: any, { eq, and }: any) =>
              and(
                eq(
                  table.organizationId,
                  team.event!.tournament!.organizationId,
                ),
                eq(table.userId, user.id),
              )) as any,
          });

          if (!member) {
            return sendResponse({
              success: false,
              message: "You are not eligible to delete this team",
            });
          }

          // Check if team is in any matches
          const matches = await db
            .select()
            .from(matchTable)
            .where(
              or(eq(matchTable.teamA, teamId), eq(matchTable.teamB, teamId)),
            )
            .limit(1);

          if (matches.length > 0) {
            return sendResponse({
              success: false,
              message: "Cannot delete team as it is already part of a match",
            });
          }

          await db.transaction(async (tx) => {
            await tx
              .delete(teamParticipantTable)
              .where(eq(teamParticipantTable.teamId, teamId));

            await tx
              .delete(teamActionLogsTable)
              .where(eq(teamActionLogsTable.teamId, teamId));

            await tx.delete(teamTable).where(eq(teamTable.id, teamId));
          });

          return sendResponse({
            success: true,
            message: "Team deleted successfully",
          });
        } catch (error) {
          console.error("[team/delete] failed", error);
          return sendResponse({
            success: false,
            message: "Failed to delete team",
          });
        }
      },
      {
        params: t.Object({ teamId: t.String({ format: "uuid" }) }),
      },
    ),
);
