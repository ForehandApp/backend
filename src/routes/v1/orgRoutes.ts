import { protectedApi } from "@/controller";
import {
  eventTable,
  invitesTable,
  matchTable,
  organizationInvitesTable,
  organizationMemberTable,
  organizationTable,
  orgTypesTable,
  tournamentTable,
} from "@/services/db/schema";
import { sendResponse } from "@/utils/response";
import { and, eq, inArray } from "drizzle-orm";
import { t } from "elysia";

export const orgRoutes = protectedApi.group("/org", (app) =>
  app
    .get("/list", async ({ db, user }) => {
      console.log("[org/list] fetching orgs", { userId: user.id });

      const acceptedInviteOrgs = await db
        .select({ organizationId: organizationInvitesTable.organizationId })
        .from(organizationInvitesTable)
        .innerJoin(
          invitesTable,
          eq(organizationInvitesTable.inviteId, invitesTable.id),
        )
        .where(
          and(
            eq(invitesTable.receiverId, user.id),
            eq(invitesTable.inviteState, "accepted"),
          ),
        );

      if (acceptedInviteOrgs.length > 0) {
        await db
          .insert(organizationMemberTable)
          .values(
            acceptedInviteOrgs.map((row) => ({
              organizationId: row.organizationId,
              userId: user.id,
              isOwner: false,
            })),
          )
          .onConflictDoNothing();
      }

      const rows = await db
        .select({
          id: organizationTable.id,
          name: organizationTable.name,
          description: organizationTable.description,
          logoUrl: organizationTable.logoUrl,
          logoPath: organizationTable.logoPath,
          establishedYear: organizationTable.establishedYear,
          website: organizationTable.website,
          contactEmail: organizationTable.contactEmail,
          contactPhone: organizationTable.contactPhone,
          postalCode: organizationTable.postalCode,
          state: organizationTable.state,
          city: organizationTable.city,
          address: organizationTable.address,
          verified: organizationTable.verified,
          orgTypeId: orgTypesTable.id,
          orgTypeCode: orgTypesTable.code,
          orgTypeLabel: orgTypesTable.label,
        })
        .from(organizationMemberTable)
        .innerJoin(
          organizationTable,
          eq(organizationMemberTable.organizationId, organizationTable.id),
        )
        .innerJoin(
          orgTypesTable,
          eq(organizationTable.orgTypeId, orgTypesTable.id),
        )
        .where(eq(organizationMemberTable.userId, user.id));

      const orgList = rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        logoUrl: row.logoUrl,
        logoPath: row.logoPath,
        establishedYear: row.establishedYear,
        website: row.website,
        contactEmail: row.contactEmail,
        contactPhone: row.contactPhone,
        postalCode: row.postalCode,
        state: row.state,
        city: row.city,
        address: row.address,
        verified: row.verified,
        orgType: {
          id: row.orgTypeId,
          code: row.orgTypeCode,
          label: row.orgTypeLabel,
        },
      }));

      console.log("[org/list] fetched", {
        userId: user.id,
        count: orgList.length,
        orgIds: orgList.map((org) => org.id),
      });

      return sendResponse({
        success: true,
        message: "Organization list retrieved",
        data: orgList,
      });
    })
    .post(
      "/register",
      async ({ db, user, body }) => {
        const orgTypeId = await db.query.orgTypesTable.findFirst({
          where: ((table: any, { eq }: any) =>
            eq(table.code, body.orgTypeCode)) as any,
        });
        if (!orgTypeId)
          return sendResponse({
            success: false,
            message: "Invalid organization type",
          });

        const organizationInsert = await db
          .insert(organizationTable)
          .values({
            orgTypeId: orgTypeId.id,
            name: body.name,
            description: body.description,
            establishedYear: body.establishedYear,

            website: body.website,
            contactPhone: body.contactPhone,
            contactEmail: body.contactEmail,

            address: body.address,
            city: body.city,
            state: body.state,
            postalCode: body.postalCode,
          })
          .returning({
            id: organizationTable.id,
          });

        const orgId = organizationInsert[0]!.id;

        await db.insert(organizationMemberTable).values({
          organizationId: orgId,
          userId: user.id,
          isOwner: true,
        });

        return sendResponse({
          success: true,
          message: "Organization registered successfully",
          data: orgId,
        });
      },
      {
        body: t.Object({
          orgTypeCode: t.UnionEnum([
            "educationalInstitute",
            "sportsAcademy",
            "sportsClub",
            "corporate",
            "other",
          ]),
          name: t.String(),
          description: t.String(),
          establishedYear: t.Number({
            minimum: 1600,
            maximum: new Date().getFullYear(),
          }),

          website: t.Nullable(t.String({ format: "uri" })),
          contactPhone: t.String({ pattern: "^[6-9]\\d{9}$" }),
          contactEmail: t.String({ format: "email" }),

          address: t.String(),
          city: t.String(),
          state: t.String(),
          postalCode: t.String(),
        }),
      },
    )
    .put(
      "/update",
      async ({ db, body, user }) => {
        const orgTypeId = await db.query.orgTypesTable.findFirst({
          where: ((table: any, { eq }: any) =>
            eq(table.code, body.orgTypeCode)) as any,
        });
        if (!orgTypeId)
          return sendResponse({
            success: false,
            message: "Invalid organization type",
          });
        const member = await db.query.organizationMemberTable.findFirst({
          where: ((table: any, { eq, and }: any) =>
            and(
              eq(table.organizationId, body.id),
              eq(table.userId, user.id),
            )) as any,
        });

        if (!member)
          return sendResponse({
            success: false,
            message: "You are not a member of this organization",
          });

        await db
          .update(organizationTable)
          .set({
            orgTypeId: orgTypeId.id,
            name: body.name,
            description: body.description,
            establishedYear: body.establishedYear,

            website: body.website,
            contactEmail: body.contactEmail,
            contactPhone: body.contactPhone,

            address: body.address,
            city: body.city,
            state: body.state,
            postalCode: body.postalCode,
          })
          .where(eq(organizationTable.id, body.id));

        return sendResponse({
          success: true,
          message: "Organization updated successfully",
        });
      },
      {
        body: t.Object({
          id: t.String(),
          orgTypeCode: t.UnionEnum([
            "educationalInstitute",
            "sportsAcademy",
            "sportsClub",
            "corporate",
            "other",
          ]),
          name: t.String(),
          description: t.String(),
          establishedYear: t.Number({
            minimum: 1600,
            maximum: new Date().getFullYear(),
          }),

          website: t.Nullable(t.String({ format: "uri" })),
          contactPhone: t.String({ pattern: "^[6-9]\\d{9}$" }),
          contactEmail: t.String({ format: "email" }),

          address: t.String(),
          city: t.String(),
          state: t.String(),
          postalCode: t.String(),
        }),
      },
    )
    .get(
      "/info/:orgId",
      async ({ db, user, params: { orgId } }) => {
        const member = await db.query.organizationMemberTable.findFirst({
          where: ((table: any, { eq, and }: any) =>
            and(
              eq(table.organizationId, orgId),
              eq(table.userId, user.id),
            )) as any,
        });

        if (!member)
          return sendResponse({
            success: false,
            message: "You are not a member of this organization",
          });

        console.log("is member");

        const organizationData = await db.query.organizationTable.findFirst({
          where: ((table: any, { eq }: any) => eq(table.id, orgId)) as any,
          with: {
            orgType: true,
          },
        });

        const response = organizationData
          ? sendResponse({
              success: true,
              message: "Organization info retrieved",
              data: organizationData,
            })
          : sendResponse({
              success: false,
              data: null,
              message: "Organization not found",
            });

        return response;
      },
      {
        params: t.Object({
          orgId: t.String({ format: "uuid" }),
        }),
      },
    )
    .get(
      "/:orgId/matches/live",
      async ({ db, user, params: { orgId } }) => {
        try {
          // 1. Verify organization membership
          const member = await db.query.organizationMemberTable.findFirst({
            where: ((table: any, { eq, and }: any) =>
              and(
                eq(table.organizationId, orgId),
                eq(table.userId, user.id),
              )) as any,
          });

          if (!member) {
            return sendResponse({
              success: false,
              message: "You are not a member of this organization",
            });
          }

          // 2. Get all tournament IDs for this organization
          const tournaments = await db.query.tournamentTable.findMany({
            where: ((table: any, { eq }: any) =>
              eq(table.organizationId, orgId)) as any,
            columns: { id: true, name: true },
          });

          const tournamentIds = tournaments.map((t) => t.id);

          if (tournamentIds.length === 0) {
            return sendResponse({
              success: true,
              message: "No tournaments found for this organization",
              data: [],
            });
          }

          // 3. Fetch all in_progress matches for these tournaments
          const liveMatches = await db.query.matchTable.findMany({
            where: ((match: any, { eq, and, inArray }: any) =>
              and(
                eq(match.matchState, "in_progress"),
                inArray(
                  match.eventId,
                  db
                    .select({ id: eventTable.id })
                    .from(eventTable)
                    .where(inArray(eventTable.tournamentId, tournamentIds)),
                ),
              )) as any,
            with: {
              event: {
                with: {
                  tournament: true,
                },
              },
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
              sets: true,
            },
          });

          // 4. Group by tournament
          const groupedData: Record<string, any> = {};

          liveMatches.forEach((match: any) => {
            const tId = match.event.tournament.id;
            if (!groupedData[tId]) {
              groupedData[tId] = {
                tournamentId: tId,
                tournamentName: match.event.tournament.name,
                matches: [],
              };
            }

            const currentSet =
              match.sets.find((s: any) => s.setStatus === "in_progress") ||
              match.sets[match.sets.length - 1];

            const teamAPlayers = match.teamAData.participants.map(
              (p: any) => p.user.name,
            );
            const teamBPlayers = match.teamBData.participants.map(
              (p: any) => p.user.name,
            );

            groupedData[tId].matches.push({
              id: match.id,
              matchTitle: `${match.event.name} · Match #${match.id.split("-")[0]}`,
              teamA: {
                name: teamAPlayers.join(" & ") || `Team A`,
                players: teamAPlayers,
              },
              teamB: {
                name: teamBPlayers.join(" & ") || `Team B`,
                players: teamBPlayers,
              },
              score: {
                teamA: currentSet ? currentSet.teamAScore : 0,
                teamB: currentSet ? currentSet.teamBScore : 0,
                currentSet: currentSet ? currentSet.setNumber : 1,
              },
              court: "Court TBD",
              isLive: true,
            });
          });

          return sendResponse({
            success: true,
            message: "Organization live matches fetched successfully",
            data: Object.values(groupedData),
          });
        } catch (error) {
          console.error("[org/matches/live] failed", error);
          return sendResponse({
            success: false,
            message: "Failed to fetch organization live matches",
          });
        }
      },
      {
        params: t.Object({
          orgId: t.String({ format: "uuid" }),
        }),
      },
    ),
);
