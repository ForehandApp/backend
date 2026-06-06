import { protectedApi } from "@/controller";
import {
  inviteTypeTable,
  organizationMemberTable,
  eventInvitesTable,
  eventTable,
  teamParticipantTable,
  teamTable,
  invitesTable,
  organizationInvitesTable,
  profileTable,
  tournamentInvitesTable,
} from "@/services/db/schema";
import { sendResponse } from "@/utils/response";
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { t } from "elysia";

export const inviteRoutes = protectedApi.group("/invite", (app) =>
  app
    .post(
      "/create",
      async ({ user, db, body }) => {
        try {
          const [inviteType] = await db
            .select({
              id: inviteTypeTable.id,
            })
            .from(inviteTypeTable)
            .where(eq(inviteTypeTable.code, "tournament"))
            .limit(1);
          if (!inviteType) {
            return sendResponse({
              success: false,
              message: "Invite type configuration is missing.",
            });
          }

          const [receiver] = await db
            .select({
              id: profileTable.id,
              name: profileTable.name,
              profilePicUrl: profileTable.profilePicUrl,
            })
            .from(profileTable)
            .where(eq(profileTable.phone, body.phone))
            .limit(1);

          if (!receiver) {
            return sendResponse({
              success: false,
              message: "No user found with this phone number.",
            });
          }

          const createdInvites = await db
            .insert(invitesTable)
            .values({
              senderId: user.id,
              receiverId: receiver.id,
              token: randomUUID(),
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              invteTypeId: inviteType.id,
            })
            .returning({
              id: invitesTable.id,
              inviteState: invitesTable.inviteState,
            });

          const createdInvite = createdInvites[0];
          if (!createdInvite) throw new Error("Failed to create invite");

          await db.insert(tournamentInvitesTable).values({
            inviteId: createdInvite.id,
            tournamentId: body.tournamentId,
          });

          return sendResponse({
            success: true,
            message: "Invite created successfully",
            data: {
              inviteId: createdInvite.id,
              inviteState: createdInvite.inviteState,
              receiverName: receiver.name,
              receiverProfilePicUrl: receiver.profilePicUrl,
            },
          });
        } catch (error) {
          console.error("[invite/create] failed", {
            body,
            userId: user.id,
            error,
          });
          return sendResponse({
            success: false,
            message:
              error instanceof Error
                ? error.message
                : "Failed to create invite due to server error.",
          });
        }
      },
      {
        body: t.Object({
          phone: t.String({ pattern: "^[6-9]\\d{9}$" }),
          role: t.Union([t.Literal("admin"), t.Literal("scorer")]),
          tournamentId: t.String(),
          organizationId: t.Optional(t.String()),
          contextType: t.Optional(t.String()),
          notifyReceiver: t.Optional(t.Boolean()),
        }),
      },
    )
    .post(
      "/organization/member/create",
      async ({ user, db, body }) => {
        try {
          const [inviteType] = await db
            .select({ id: inviteTypeTable.id })
            .from(inviteTypeTable)
            .where(eq(inviteTypeTable.code, "organization"))
            .limit(1);

          if (!inviteType) {
            return sendResponse({
              success: false,
              message: "Invite type configuration is missing for organization.",
            });
          }

          const member = await db.query.organizationMemberTable.findFirst({
            where: {
              organizationId: body.organizationId,
              userId: user.id,
            },
          });

          if (!member) {
            return sendResponse({
              success: false,
              message: "You are not a member of this organization.",
            });
          }

          const [receiver] = await db
            .select({
              id: profileTable.id,
              name: profileTable.name,
              profilePicUrl: profileTable.profilePicUrl,
              phone: profileTable.phone,
            })
            .from(profileTable)
            .where(eq(profileTable.phone, body.phone))
            .limit(1);

          if (!receiver) {
            return sendResponse({
              success: false,
              message: "No user found with this phone number.",
            });
          }

          const createdInvites = await db
            .insert(invitesTable)
            .values({
              senderId: user.id,
              receiverId: receiver.id,
              token: randomUUID(),
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              invteTypeId: inviteType.id,
            })
            .returning({
              id: invitesTable.id,
              inviteState: invitesTable.inviteState,
            });

          const createdInvite = createdInvites[0];
          if (!createdInvite) throw new Error("Failed to create invite");

          await db.insert(organizationInvitesTable).values({
            inviteId: createdInvite.id,
            organizationId: body.organizationId,
          });

          return sendResponse({
            success: true,
            message: "Organization member invite created successfully",
            data: {
              inviteId: createdInvite.id,
              inviteState: createdInvite.inviteState,
              receiverName: receiver.name,
              receiverPhone: receiver.phone,
              receiverProfilePicUrl: receiver.profilePicUrl,
            },
          });
        } catch (error) {
          console.error("[invite/organization/member/create] failed", {
            body,
            userId: user.id,
            error,
          });
          return sendResponse({
            success: false,
            message:
              error instanceof Error
                ? error.message
                : "Failed to create organization member invite.",
          });
        }
      },
      {
        body: t.Object({
          phone: t.String({ pattern: "^[6-9]\\d{9}$" }),
          organizationId: t.String(),
          role: t.Optional(t.Union([t.Literal("admin"), t.Literal("scorer")])),
          contextType: t.Optional(t.String()),
          notifyReceiver: t.Optional(t.Boolean()),
        }),
      },
    )
    .post(
      "/event/team/create",
      async ({ user, db, body }) => {
        try {
          const [inviteType] = await db
            .select({ id: inviteTypeTable.id })
            .from(inviteTypeTable)
            .where(eq(inviteTypeTable.code, "event"))
            .limit(1);

          if (!inviteType) {
            return sendResponse({
              success: false,
              message: "Invite type configuration is missing for events.",
            });
          }

          const [receiver] = await db
            .select({
              id: profileTable.id,
              name: profileTable.name,
              profilePicUrl: profileTable.profilePicUrl,
            })
            .from(profileTable)
            .where(eq(profileTable.phone, body.phone))
            .limit(1);

          if (!receiver) {
            return sendResponse({
              success: false,
              message: "No user found with this phone number.",
            });
          }

          if (receiver.id === user.id) {
            return sendResponse({
              success: false,
              message: "You cannot invite yourself.",
            });
          }

          const inviteId = await db.transaction(async (tx) => {
            const createdInvites = await tx
              .insert(invitesTable)
              .values({
                senderId: user.id,
                receiverId: receiver.id,
                token: randomUUID(),
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                invteTypeId: inviteType.id,
              })
              .returning({ id: invitesTable.id });

            const createdInvite = createdInvites[0];
            if (!createdInvite) throw new Error("Failed to create invite");

            await tx.insert(eventInvitesTable).values({
              inviteId: createdInvite.id,
              eventId: body.eventId,
              teamId: body.teamId ?? null,
            });

            return createdInvite.id;
          });

          return sendResponse({
            success: true,
            message: "Event team invite created successfully",
            data: { inviteId },
          });
        } catch (error) {
          console.error("[invite/event/team/create] failed", error);
          return sendResponse({
            success: false,
            message: "Failed to create event invite.",
          });
        }
      },
      {
        body: t.Object({
          phone: t.String({ pattern: "^[6-9]\\d{9}$" }),
          eventId: t.String(),
          teamId: t.Optional(t.Nullable(t.String())),
        }),
      },
    )
    .post(
      "/organization/member/list",
      async ({ user, db, body }) => {
        const member = await db.query.organizationMemberTable.findFirst({
          where: {
            organizationId: body.organizationId,
            userId: user.id,
          },
        });

        if (!member) {
          return sendResponse({
            success: false,
            message: "You are not a member of this organization.",
          });
        }

        const rows = await db
          .select({
            inviteId: invitesTable.id,
            inviteState: invitesTable.inviteState,
            createdAt: invitesTable.createdAt,
            receiverName: profileTable.name,
            receiverPhone: profileTable.phone,
            receiverProfilePicUrl: profileTable.profilePicUrl,
          })
          .from(organizationInvitesTable)
          .innerJoin(
            invitesTable,
            eq(organizationInvitesTable.inviteId, invitesTable.id),
          )
          .innerJoin(profileTable, eq(invitesTable.receiverId, profileTable.id))
          .where(
            eq(organizationInvitesTable.organizationId, body.organizationId),
          )
          .orderBy(desc(invitesTable.createdAt));

        const data = rows.map((row) => ({
          id: row.inviteId,
          name: row.receiverName,
          phone: row.receiverPhone,
          avatarUrl: row.receiverProfilePicUrl,
          role: "admin" as const,
          inviteState: row.inviteState,
          status:
            row.inviteState === "pending"
              ? "invite_sent"
              : row.inviteState === "accepted"
                ? "accepted"
                : "rejected",
        }));

        return sendResponse({
          success: true,
          message: "Organization member invites fetched successfully",
          data,
        });
      },
      {
        body: t.Object({
          organizationId: t.String(),
        }),
      },
    )
    .post(
      "/organization/member/remove",
      async ({ user, db, body }) => {
        const [row] = await db
          .select({
            inviteId: invitesTable.id,
            senderId: invitesTable.senderId,
          })
          .from(organizationInvitesTable)
          .innerJoin(
            invitesTable,
            eq(organizationInvitesTable.inviteId, invitesTable.id),
          )
          .where(
            and(
              eq(organizationInvitesTable.inviteId, body.inviteId),
              eq(organizationInvitesTable.organizationId, body.organizationId),
            ),
          )
          .limit(1);

        if (!row) {
          return sendResponse({
            success: false,
            message: "Organization member invite not found.",
          });
        }

        const member = await db.query.organizationMemberTable.findFirst({
          where: {
            organizationId: body.organizationId,
            userId: user.id,
          },
        });

        if (!member && row.senderId !== user.id) {
          return sendResponse({
            success: false,
            message:
              "You are not allowed to remove this organization member invite.",
          });
        }

        await db
          .delete(organizationInvitesTable)
          .where(
            and(
              eq(organizationInvitesTable.inviteId, body.inviteId),
              eq(organizationInvitesTable.organizationId, body.organizationId),
            ),
          );

        await db.delete(invitesTable).where(eq(invitesTable.id, body.inviteId));

        return sendResponse({
          success: true,
          message: "Organization member invite removed successfully.",
        });
      },
      {
        body: t.Object({
          inviteId: t.String(),
          organizationId: t.String(),
        }),
      },
    )
    .post(
      "/tournament/crew",
      async ({ db, body }) => {
        const rows = await db
          .select({
            inviteId: invitesTable.id,
            inviteState: invitesTable.inviteState,
            createdAt: invitesTable.createdAt,
            receiverId: profileTable.id,
            receiverName: profileTable.name,
            receiverPhone: profileTable.phone,
            receiverProfilePicUrl: profileTable.profilePicUrl,
          })
          .from(tournamentInvitesTable)
          .innerJoin(
            invitesTable,
            eq(tournamentInvitesTable.inviteId, invitesTable.id),
          )
          .innerJoin(profileTable, eq(invitesTable.receiverId, profileTable.id))
          .where(eq(tournamentInvitesTable.tournamentId, body.tournamentId))
          .orderBy(desc(invitesTable.createdAt));

        const data = rows.map((row) => ({
          id: row.inviteId,
          role: "admin" as const,
          name: row.receiverName,
          phone: row.receiverPhone,
          avatarUrl: row.receiverProfilePicUrl,
          status:
            row.inviteState === "pending"
              ? "invite_sent"
              : row.inviteState === "accepted"
                ? "accepted"
                : "rejected",
        }));

        return sendResponse({
          success: true,
          message: "Tournament crew invites fetched successfully",
          data,
        });
      },
      {
        body: t.Object({
          tournamentId: t.String(),
        }),
      },
    )
    .post(
      "/tournament/crew/remove",
      async ({ user, db, body }) => {
        const [row] = await db
          .select({
            inviteId: invitesTable.id,
            senderId: invitesTable.senderId,
          })
          .from(tournamentInvitesTable)
          .innerJoin(
            invitesTable,
            eq(tournamentInvitesTable.inviteId, invitesTable.id),
          )
          .where(
            and(
              eq(tournamentInvitesTable.inviteId, body.inviteId),
              eq(tournamentInvitesTable.tournamentId, body.tournamentId),
            ),
          )
          .limit(1);

        if (!row) {
          return sendResponse({
            success: false,
            message: "Crew invite not found.",
          });
        }

        if (row.senderId !== user.id) {
          return sendResponse({
            success: false,
            message: "You are not allowed to remove this crew invite.",
          });
        }

        await db
          .delete(tournamentInvitesTable)
          .where(
            and(
              eq(tournamentInvitesTable.inviteId, body.inviteId),
              eq(tournamentInvitesTable.tournamentId, body.tournamentId),
            ),
          );

        await db.delete(invitesTable).where(eq(invitesTable.id, body.inviteId));

        return sendResponse({
          success: true,
          message: "Crew invite removed successfully.",
        });
      },
      {
        body: t.Object({
          inviteId: t.String(),
          tournamentId: t.String(),
        }),
      },
    )
    .get(
      "/event/team/:eventId",
      async ({ user, db, params: { eventId } }) => {
        const rows = await db
          .select({
            invite: invitesTable,
            receiver: profileTable,
          })
          .from(eventInvitesTable)
          .innerJoin(
            invitesTable,
            eq(eventInvitesTable.inviteId, invitesTable.id),
          )
          .innerJoin(profileTable, eq(invitesTable.receiverId, profileTable.id))
          .where(
            and(
              eq(eventInvitesTable.eventId, eventId),
              eq(invitesTable.senderId, user.id),
            ),
          )
          .orderBy(desc(invitesTable.createdAt));

        return sendResponse({
          success: true,
          message: "Event team invites fetched successfully",
          data: rows,
        });
      },
      {
        params: t.Object({ eventId: t.String() }),
      },
    )
    .delete(
      "/delete/:inviteId",
      async ({ user, db, params: { inviteId } }) => {
        const invite = await db.query.invitesTable.findFirst({
          where: { id: inviteId },
        });

        if (!invite) {
          return sendResponse({
            success: false,
            message: "Invite not found.",
          });
        }

        if (invite.senderId !== user.id) {
          return sendResponse({
            success: false,
            message: "You are not allowed to delete this invite.",
          });
        }

        await db.transaction(async (tx) => {
          // Delete from specific join tables first
          await tx
            .delete(eventInvitesTable)
            .where(eq(eventInvitesTable.inviteId, inviteId));
          await tx
            .delete(organizationInvitesTable)
            .where(eq(organizationInvitesTable.inviteId, inviteId));
          await tx
            .delete(tournamentInvitesTable)
            .where(eq(tournamentInvitesTable.inviteId, inviteId));

          await tx.delete(invitesTable).where(eq(invitesTable.id, inviteId));
        });

        return sendResponse({
          success: true,
          message: "Invite deleted successfully.",
        });
      },
      {
        params: t.Object({ inviteId: t.String() }),
      },
    )
    .post(
      "/respond",
      async ({ user, db, body }) => {
        const invite = await db.query.invitesTable.findFirst({
          where: {
            id: body.inviteId,
            receiverId: user.id,
          },
          with: {
            invteType: true,
          },
        });

        if (!invite) {
          return sendResponse({
            success: false,
            message: "Invite not found for this user.",
          });
        }

        await db.transaction(async (tx) => {
          await tx
            .update(invitesTable)
            .set({
              inviteState: body.action === "accept" ? "accepted" : "rejected",
            })
            .where(eq(invitesTable.id, body.inviteId));

          if (body.action === "accept" && invite.invteType) {
            // Handle Organization Invite
            if (invite.invteType.code === "organization") {
              const [orgInvite] = await tx
                .select({
                  organizationId: organizationInvitesTable.organizationId,
                })
                .from(organizationInvitesTable)
                .where(eq(organizationInvitesTable.inviteId, invite.id))
                .limit(1);

              if (orgInvite?.organizationId) {
                await tx
                  .insert(organizationMemberTable)
                  .values({
                    organizationId: orgInvite.organizationId,
                    userId: user.id,
                    isOwner: false,
                  })
                  .onConflictDoNothing();
              }
            }

            // Handle Event/Team Invite
            if (invite.invteType.code === "event") {
              const [eventInvite] = await tx
                .select()
                .from(eventInvitesTable)
                .where(eq(eventInvitesTable.inviteId, invite.id))
                .limit(1);

              if (eventInvite) {
                let teamId = eventInvite.teamId;

                if (teamId) {
                  // Add user to existing team
                  await tx
                    .insert(teamParticipantTable)
                    .values({
                      teamId: teamId,
                      userId: user.id,
                    })
                    .onConflictDoNothing();
                } else {
                  // Create new team and add both sender and receiver
                  const event = await tx.query.eventTable.findFirst({
                    where: { id: eventInvite.eventId },
                  });

                  if (event) {
                    const insertedTeams = await tx
                      .insert(teamTable)
                      .values({
                        eventId: eventInvite.eventId,
                        teamTypeId: event.teamTypeId,
                        teamStatus: "registered",
                      })
                      .returning({ id: teamTable.id });

                    const newTeam = insertedTeams[0];
                    if (newTeam) {
                      await tx.insert(teamParticipantTable).values([
                        { teamId: newTeam.id, userId: invite.senderId },
                        { teamId: newTeam.id, userId: user.id },
                      ]);
                    }
                  }
                }
              }
            }
          }
        });

        return sendResponse({
          success: true,
          message:
            body.action === "accept"
              ? "Invite accepted successfully."
              : "Invite rejected successfully.",
        });
      },
      {
        body: t.Object({
          inviteId: t.String(),
          action: t.Union([t.Literal("accept"), t.Literal("reject")]),
        }),
      },
    )
    .post("/reject-all-pending", async ({ user, db }) => {
      await db
        .update(invitesTable)
        .set({ inviteState: "rejected" })
        .where(
          and(
            eq(invitesTable.receiverId, user.id),
            eq(invitesTable.inviteState, "pending"),
          ),
        );

      return sendResponse({
        success: true,
        message: "All pending invites rejected.",
      });
    }),
);
