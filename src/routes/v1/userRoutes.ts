import { protectedApi } from "@/controller";
import {
  profileTable,
  invitesTable,
  inviteTypeTable,
  organizationInvitesTable,
  organizationTable,
  eventInvitesTable,
  eventTable,
  tournamentInvitesTable,
  tournamentTable,
  matchTable,
  teamParticipantTable,
  teamTypesTable,
  setTable,
} from "@/services/db/schema";
import { getDate } from "@/utils/helpers";
import { sendResponse } from "@/utils/response";
import { eq, and, ne, desc, or, inArray } from "drizzle-orm";
import { t } from "elysia";

export const userRoutes = protectedApi.group("/user", (app) =>
  app
    .get("/profile", async ({ user, db }) => {
      const userProfile = await db.query.profileTable.findFirst({
        where: { id: user.id },
      });

      console.log(userProfile?.dob);

      return sendResponse({
        success: true,
        message: "User found",
        data: userProfile,
      });
    })
    .get("/stats", async ({ user, db }) => {
      try {
        // 1. Get all teams the user is part of
        const userTeams = await db
          .select({ teamId: teamParticipantTable.teamId })
          .from(teamParticipantTable)
          .where(eq(teamParticipantTable.userId, user.id));

        const teamIds = userTeams.map((t) => t.teamId);

        if (teamIds.length === 0) {
          return sendResponse({
            success: true,
            message: "User statistics fetched successfully (no matches)",
            data: {
              matchesPlayed: 0,
              matchesWon: 0,
              matchesLost: 0,
            },
          });
        }

        // 2. Get all completed matches for these teams
        const matches = await db
          .select()
          .from(matchTable)
          .where(
            and(
              eq(matchTable.matchState, "completed"),
              or(
                ...teamIds.map((id) => eq(matchTable.teamA, id)),
                ...teamIds.map((id) => eq(matchTable.teamB, id)),
              ),
            ),
          );

        let matchesWon = 0;
        let matchesLost = 0;

        matches.forEach((match) => {
          const isUserInTeamA = teamIds.includes(match.teamA);
          // If the user is in teamA, their team ID is match.teamA, else it's match.teamB
          const userTeamId = isUserInTeamA ? match.teamA : match.teamB;

          if (match.winnerId === userTeamId) {
            matchesWon++;
          } else {
            matchesLost++;
          }
        });

        return sendResponse({
          success: true,
          message: "User statistics fetched successfully",
          data: {
            matchesPlayed: matches.length,
            matchesWon,
            matchesLost,
          },
        });
      } catch (error) {
        console.error("[user/stats] failed", error);
        return sendResponse({
          success: false,
          message: "Failed to fetch user statistics",
        });
      }
    })
    .get("/matches/live", async ({ user, db }) => {
      try {
        // 1. Get all team IDs the user is part of
        const userTeams = await db
          .select({ teamId: teamParticipantTable.teamId })
          .from(teamParticipantTable)
          .where(eq(teamParticipantTable.userId, user.id));

        const teamIds = userTeams.map((t) => t.teamId);

        if (teamIds.length === 0) {
          return sendResponse({
            success: true,
            message: "No live match found",
            data: null,
          });
        }

        // 2. Fetch the most recent in_progress match
        const matchResult = await db.query.matchTable.findFirst({
          where: ((table: any, { and, or, eq }: any) =>
            and(
              eq(table.matchState, "in_progress"),
              or(
                ...teamIds.map((id) => eq(table.teamA, id)),
                ...teamIds.map((id) => eq(table.teamB, id)),
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
                teamType: true,
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
          orderBy: (table: any, { desc }: any) => [desc(table.updatedAt)],
        });

        const match = matchResult as any;

        if (!match) {
          return sendResponse({
            success: true,
            message: "No live match found",
            data: null,
          });
        }

        // 3. Determine current set and scores
        const currentSet =
          match.sets.find((s: any) => s.setStatus === "in_progress") ||
          match.sets[match.sets.length - 1];

        // Calculate match score (sets won)
        let teamASets = 0;
        let teamBSets = 0;
        match.sets.forEach((s: any) => {
          if (s.setStatus === "completed") {
            if (s.winnerId === match.teamA) teamASets++;
            else if (s.winnerId === match.teamB) teamBSets++;
          }
        });

        const teamAPlayers = match.teamAData.participants.map((p: any) =>
          p.user.id === user.id ? "You" : p.user.name,
        );
        const teamBPlayers = match.teamBData.participants.map((p: any) =>
          p.user.id === user.id ? "You" : p.user.name,
        );

        const data = {
          id: match.id,
          type: match.teamAData.teamType.label,
          leagueTitle: match.event!.tournament.name,
          leftTeamName: teamAPlayers.join(" & "),
          rightTeamName: teamBPlayers.join(" & "),
          leftTeamPlayers: teamAPlayers,
          rightTeamPlayers: teamBPlayers,
          score: currentSet
            ? `${currentSet.teamAScore} - ${currentSet.teamBScore}`
            : "0 - 0",
          scoreLabel: currentSet ? `Set ${currentSet.setNumber}` : "Warm up",
          matchScore: `${teamASets} - ${teamBSets}`,
        };

        return sendResponse({
          success: true,
          message: "Live match fetched successfully",
          data,
        });
      } catch (error) {
        console.error("[user/matches/live] failed", error);
        return sendResponse({
          success: false,
          message: "Failed to fetch live match",
        });
      }
    })
    .get("/matches/past", async ({ user, db }) => {
      try {
        // 1. Get all team IDs the user is part of
        const userTeams = await db
          .select({ teamId: teamParticipantTable.teamId })
          .from(teamParticipantTable)
          .where(eq(teamParticipantTable.userId, user.id));

        const teamIds = userTeams.map((t) => t.teamId);

        if (teamIds.length === 0) {
          return sendResponse({
            success: true,
            message: "No past matches found",
            data: [],
          });
        }

        // 2. Fetch completed matches with detailed relations
        // Using explicit types for callback parameters to avoid implicit any
        const matchesResult = await db.query.matchTable.findMany({
          where: ((table: any, { and, or, eq }: any) =>
            and(
              eq(table.matchState, "completed"),
              or(
                ...teamIds.map((id) => eq(table.teamA, id)),
                ...teamIds.map((id) => eq(table.teamB, id)),
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
                teamType: true,
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
          orderBy: (table: any, { desc }: any) => [desc(table.updatedAt)],
          limit: 4,
        });

        const matches = matchesResult as any[];

        // 3. Map to the expected frontend structure
        const data = matches.map((match: any) => {
          const isUserInTeamA = teamIds.includes(match.teamA);
          const userTeamId = isUserInTeamA ? match.teamA : match.teamB;
          const status = match.winnerId === userTeamId ? "WIN" : "LOSS";

          const teamAPlayers = match.teamAData.participants.map((p: any) =>
            p.user.id === user.id ? "You" : p.user.name,
          );
          const teamBPlayers = match.teamBData.participants.map((p: any) =>
            p.user.id === user.id ? "You" : p.user.name,
          );

          // Get final score from sets
          let teamAScore = 0;
          let teamBScore = 0;
          match.sets.forEach((set: any) => {
            if (set.winnerId === match.teamA) teamAScore++;
            if (set.winnerId === match.teamB) teamBScore++;
          });

          return {
            id: match.id,
            type: match.teamAData.teamType.label,
            endedAt: match.updatedAt,
            status,
            leagueTitle: match.event!.tournament.name,
            leftTeamName: teamAPlayers.join(" & "),
            rightTeamName: teamBPlayers.join(" & "),
            leftTeamPlayers: teamAPlayers,
            rightTeamPlayers: teamBPlayers,
            score: `${teamAScore} - ${teamBScore}`,
            scoreLabel: "Final Score",
          };
        });

        return sendResponse({
          success: true,
          message: "Past matches fetched successfully",
          data,
        });
      } catch (error) {
        console.error("[user/matches/past] failed", error);
        return sendResponse({
          success: false,
          message: "Failed to fetch past matches",
        });
      }
    })
    .get("/matches/live-feed", async ({ user, db }) => {
      try {
        // 1. Get all tournament IDs the user has joined
        // First find all teams the user is part of
        const userTeams = await db.query.teamParticipantTable.findMany({
          where: { userId: user.id },
          with: {
            team: {
              with: {
                event: true,
              },
            },
          },
        });

        const tournamentIds = Array.from(
          new Set(
            userTeams
              .map((ut: any) => ut.team?.event?.tournamentId)
              .filter(Boolean),
          ),
        );

        if (tournamentIds.length === 0) {
          return sendResponse({
            success: true,
            message: "No live matches found",
            data: [],
          });
        }

        // 2. Fetch all in_progress matches for these tournaments
        const liveMatches = await db.query.matchTable.findMany({
          where: ((match: any, { eq, and, inArray }: any) =>
            and(
              eq(match.matchState, "in_progress"),
              inArray(
                match.eventId,
                db
                  .select({ id: eventTable.id })
                  .from(eventTable)
                  .where(
                    inArray(eventTable.tournamentId, tournamentIds as string[]),
                  ),
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

        // 3. Group by tournament
        const groupedData: Record<string, any> = {};

        liveMatches.forEach((match: any) => {
          const tournamentId = match.event.tournament.id;
          if (!groupedData[tournamentId]) {
            groupedData[tournamentId] = {
              tournamentId: tournamentId,
              tournamentName: match.event.tournament.name,
              matches: [],
            };
          }

          const currentSet =
            match.sets.find((s: any) => s.setStatus === "in_progress") ||
            match.sets[match.sets.length - 1];

          groupedData[tournamentId].matches.push({
            id: match.id,
            matchTitle: `${match.event.name} · Match #${match.id.split("-")[0]}`,
            teamA: {
              players: match.teamAData.participants.map((p: any) =>
                p.user.id === user.id ? "You" : p.user.name,
              ),
            },
            teamB: {
              players: match.teamBData.participants.map((p: any) =>
                p.user.id === user.id ? "You" : p.user.name,
              ),
            },
            score: {
              teamA: currentSet ? currentSet.teamAScore : 0,
              teamB: currentSet ? currentSet.teamBScore : 0,
              currentSet: currentSet ? currentSet.setNumber : 1,
            },
            court: "Court TBD", // Court is not in schema yet
            isLive: true,
          });
        });

        return sendResponse({
          success: true,
          message: "Live feed fetched successfully",
          data: Object.values(groupedData),
        });
      } catch (error) {
        console.error("[user/matches/live-feed] failed", error);
        return sendResponse({
          success: false,
          message: "Failed to fetch live feed",
        });
      }
    })
    .get("/notifications", async ({ user, db }) => {
      try {
        const rows = await db
          .select({
            id: invitesTable.id,
            inviteState: invitesTable.inviteState,
            createdAt: invitesTable.createdAt,
            senderName: profileTable.name,
            type: inviteTypeTable.code,
            orgName: organizationTable.name,
            eventName: eventTable.name,
            tournamentName: tournamentTable.name,
          })
          .from(invitesTable)
          .innerJoin(profileTable, eq(invitesTable.senderId, profileTable.id))
          .innerJoin(
            inviteTypeTable,
            eq(invitesTable.invteTypeId, inviteTypeTable.id),
          )
          .leftJoin(
            organizationInvitesTable,
            eq(invitesTable.id, organizationInvitesTable.inviteId),
          )
          .leftJoin(
            organizationTable,
            eq(organizationInvitesTable.organizationId, organizationTable.id),
          )
          .leftJoin(
            eventInvitesTable,
            eq(invitesTable.id, eventInvitesTable.inviteId),
          )
          .leftJoin(eventTable, eq(eventInvitesTable.eventId, eventTable.id))
          .leftJoin(
            tournamentInvitesTable,
            eq(invitesTable.id, tournamentInvitesTable.inviteId),
          )
          .leftJoin(
            tournamentTable,
            eq(tournamentInvitesTable.tournamentId, tournamentTable.id),
          )
          .where(
            and(
              eq(invitesTable.receiverId, user.id),
              eq(invitesTable.inviteState, "pending"),
            ),
          )
          .orderBy(desc(invitesTable.createdAt));

        const data = rows.map((row) => ({
          id: row.id,
          inviteId: row.id,
          type: "invite",
          title:
            row.type === "organization"
              ? "Organization Invite"
              : row.type === "event"
                ? "Team Invitation"
                : "Tournament Crew Invite",
          body: `${row.senderName} has invited you.`,
          source: row.orgName || row.eventName || row.tournamentName || "",
          createdAt: row.createdAt,
          unread: true,
        }));

        return sendResponse({
          success: true,
          message: "Notifications fetched successfully",
          data,
        });
      } catch (error) {
        console.error("[user/notifications] failed", error);
        return sendResponse({
          success: false,
          message: "Failed to fetch notifications",
        });
      }
    })
    .post(
      "/validate-contact",
      async ({ db, body, user }) => {
        const result = await db
          .select()
          .from(profileTable)
          .where(
            and(
              ne(profileTable.id, user.id),
              eq(profileTable.phone, body.data),
            ),
          )
          .limit(1);

        const duplicateContact = result[0];

        const response = sendResponse(
          duplicateContact
            ? {
                success: true,
                data: false,
                message: "Contact is already used!",
              }
            : {
                success: true,
                data: true,
                message: "Contact is valid!",
              },
        );

        console.log(response);
        return response;
      },
      {
        body: t.Object({
          data: t.String({ pattern: "^[6-9]\\d{9}$" }),
        }),
      },
    )
    .get(
      "/userProfile/info/:identifier",
      async ({ db, params: { identifier } }) => {
        const isPhone = /^[6-9]\d{9}$/.test(identifier);

        const profile = await db.query.profileTable.findFirst({
          where: isPhone ? { phone: identifier } : { id: identifier },
          columns: {
            id: true,
            name: true,
            profilePicUrl: true,
            profilePicPath: true,
            gender: true,
            primarySport: true,
          },
        });

        if (!profile) {
          return sendResponse({
            success: false,
            message: "User not found",
          });
        }

        return sendResponse({
          success: true,
          message: "User profile found",
          data: profile,
        });
      },
      {
        params: t.Object({
          identifier: t.String(),
        }),
      },
    )
    .post(
      "/register",
      async ({ user, db, body }) => {
        // TDOD: Added duplicate check
        await db.insert(profileTable).values({
          id: user.id,
          name: body.name,
          phone: body.phone,
          gender: body.gender,
          dob: getDate(body.dob),
          playingHand: body.playingHand,
          primarySport: body.primarySport,
        });

        return sendResponse({
          message: "Created Profile",
          success: true,
        });
      },
      {
        body: t.Object({
          name: t.String(),
          phone: t.String({ pattern: "^[6-9]\\d{9}$" }),
          gender: t.UnionEnum(["male", "female"]),
          dob: t.String(),
          playingHand: t.Nullable(t.UnionEnum(["left", "right"])),
          primarySport: t.Nullable(t.String()),
        }),
      },
    )

    .put(
      "/update",
      async ({ user, db, body }) => {
        const utcDob = new Date(body.dob);
        const systemDob = new Date(
          utcDob.getTime() - utcDob.getTimezoneOffset() * 60000,
        );

        await db
          .update(profileTable)
          .set({
            name: body.name,
            phone: body.phone,
            gender: body.gender,
            dob: systemDob,
            playingHand: body.playingHand,
            primarySport: body.primarySport,
          })
          .where(eq(profileTable.id, user.id));

        console.log(new Date(body.dob));
        return sendResponse({
          message: "Profile Updated",
          success: true,
        });
      },
      {
        body: t.Object({
          name: t.String(),
          phone: t.String({ pattern: "^[6-9]\\d{9}$" }),
          gender: t.UnionEnum(["male", "female"]),
          dob: t.String(),
          playingHand: t.Nullable(t.UnionEnum(["left", "right"])),
          primarySport: t.Nullable(t.String()),
        }),
      },
    ),
);
