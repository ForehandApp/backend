import { protectedApi } from "@/routes/v1/controller";
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
  teamTable,
  matchTable,
  teamParticipantTable,
  teamTypesTable,
  setTable,
} from "@/services/db/schema";
import { getDate } from "@/utils/helpers";
import { sendResponse } from "@/utils/response";
import { eq, and, ne, desc, asc, or, inArray, notInArray, sql } from "drizzle-orm";
import { t } from "elysia";

function getDateOnly(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function getDbErrorDetails(error: unknown) {
  const dbError = error as any;
  const cause = dbError?.cause ?? dbError;

  return {
    name: dbError?.name,
    message: dbError?.message,
    code: cause?.code ?? dbError?.code,
    detail: cause?.detail ?? dbError?.detail,
    constraint: cause?.constraint ?? dbError?.constraint,
    table: cause?.table ?? dbError?.table,
    column: cause?.column ?? dbError?.column,
  };
}

function normalizeSetRows(sets: any[] = []) {
  const statusRank: Record<string, number> = {
    in_progress: 3,
    completed: 2,
    not_started: 1,
  };
  const byNumber = new Map<number, any>();

  sets.forEach((set) => {
    const setNumber = Number(set?.setNumber);
    if (!Number.isFinite(setNumber)) return;

    const existing = byNumber.get(setNumber);
    const setRank = statusRank[set?.setStatus] ?? 0;
    const existingRank = existing ? statusRank[existing?.setStatus] ?? 0 : -1;
    const setScore = Number(set?.teamAScore || 0) + Number(set?.teamBScore || 0);
    const existingScore = existing
      ? Number(existing?.teamAScore || 0) + Number(existing?.teamBScore || 0)
      : -1;
    const setTime = new Date(set?.updatedAt || set?.createdAt || 0).getTime();
    const existingTime = existing
      ? new Date(existing?.updatedAt || existing?.createdAt || 0).getTime()
      : -1;

    if (
      !existing ||
      setRank > existingRank ||
      (setRank === existingRank &&
        (setScore > existingScore ||
          (setScore === existingScore && setTime >= existingTime)))
    ) {
      byNumber.set(setNumber, set);
    }
  });

  return [...byNumber.values()].sort(
    (a: any, b: any) => a.setNumber - b.setNumber,
  );
}

export const userRoutes = protectedApi.group("/user", (app) =>
  app
    .get("/profile", async ({ user, db }) => {
      const userProfile = await db.query.profileTable.findFirst({
        where: { id: user.id },
      });

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

        // 2. Fetch active candidate matches where the user is a player or scorer.
        const matchCandidates = await db.query.matchTable.findMany({
          where: ((table: any, { and, or, eq }: any) =>
            and(
              notInArray(table.matchState, [
                "completed",
                "abandoned",
                "walkover",
              ]),
              or(
                eq(table.scorer, user.id),
                ...teamIds.map((id) => eq(table.teamA, id)),
                ...teamIds.map((id) => eq(table.teamB, id)),
              ),
            )) as any,
          with: {
            event: {
              with: {
                tournament: true,
                teamType: true,
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

        const match = (matchCandidates as any[]).find((candidate: any) => {
          const hasLiveSet = (candidate.sets || []).some(
            (set: any) => set.setStatus === "in_progress",
          );
          return candidate.matchState === "in_progress" || hasLiveSet;
        });

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
            else if (s.teamAScore > s.teamBScore) teamASets++;
            else if (s.teamBScore > s.teamAScore) teamBSets++;
          }
        });

        const teamAPlayers = match.teamAData.participants.map((p: any) =>
          p.user.id === user.id ? "You" : p.user.name,
        );
        const teamBPlayers = match.teamBData.participants.map((p: any) =>
          p.user.id === user.id ? "You" : p.user.name,
        );

        const sortedSets = [...(match.sets || [])].sort(
          (a: any, b: any) => a.setNumber - b.setNumber,
        );
        const data = {
          id: match.id,
          tournamentId: match.event!.tournament.id,
          tournamentName: match.event!.tournament.name,
          matchTitle: `${match.event!.name} · Match #${String(match.id).split("-")[0]}`,
          type: match.teamAData.teamType.label,
          leagueTitle: match.event!.tournament.name,
          teamA: {
            players: teamAPlayers,
            images: match.teamAData.participants
              .map((p: any) => p.user.profilePicUrl)
              .filter(Boolean),
          },
          teamB: {
            players: teamBPlayers,
            images: match.teamBData.participants
              .map((p: any) => p.user.profilePicUrl)
              .filter(Boolean),
          },
          leftTeamName: teamAPlayers.join(" & "),
          rightTeamName: teamBPlayers.join(" & "),
          leftTeamPlayers: teamAPlayers,
          rightTeamPlayers: teamBPlayers,
          score: {
            teamA: teamASets,
            teamB: teamBSets,
            currentSet: currentSet ? currentSet.setNumber : 1,
          },
          scoreLabel: currentSet ? `Set ${currentSet.setNumber}` : "Warm up",
          matchScore: `${teamASets} - ${teamBSets}`,
          sets: sortedSets.map((s: any) => ({
            setNumber: s.setNumber,
            teamAScore: s.teamAScore,
            teamBScore: s.teamBScore,
            setStatus: s.setStatus,
            winnerId: s.winnerId,
          })),
          court: match.courtName || null,
          isLive: true,
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
    .get("/matches/upcoming", async ({ user, db }) => {
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
            message: "No upcoming matches found",
            data: [],
          });
        }

        // 2. Fetch scheduled matches with detailed relations
        const matchesResult = await db.query.matchTable.findMany({
          where: ((table: any, { and, or, eq }: any) =>
            and(
              eq(table.matchState, "scheduled"),
              or(
                ...teamIds.map((id) => eq(table.teamA, id)),
                ...teamIds.map((id) => eq(table.teamB, id)),
              ),
            )) as any,
          with: {
            event: {
              with: {
                tournament: true,
                teamType: true,
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
          },
        });

        // 3. Format response
        const formattedMatches = matchesResult.map((match: any) => {
          const teamAPlayers = match.teamAData?.participants?.map((p: any) =>
            p.user.id === user.id ? "You" : p.user.name,
          ) || [];
          const teamBPlayers = match.teamBData?.participants?.map((p: any) =>
            p.user.id === user.id ? "You" : p.user.name,
          ) || [];

          return {
            id: match.id,
            eventId: match.eventId,
            tournamentId: match.event?.tournamentId,
            type:
              match.event?.teamType?.label ||
              match.teamAData?.teamType?.label ||
              "Match",
            matchState: match.matchState,
            leagueTitle: match.event?.tournament?.name || "Tournament",
            eventName: match.event?.name || "Event",
            leftTeamName: teamAPlayers.join(" & ") || match.teamAData?.name,
            rightTeamName: teamBPlayers.join(" & ") || match.teamBData?.name,
            leftTeamPlayers: teamAPlayers,
            rightTeamPlayers: teamBPlayers,
            scheduledAt: match.startTime || match.createdAt,
            venue: match.event?.tournament?.venueName || "TBD",
            court: match.courtName || null,
          };
        });

        return sendResponse({
          success: true,
          message: "Upcoming matches fetched successfully",
          data: formattedMatches,
        });
      } catch (error) {
        console.error("[user/matches/upcoming] failed", error);
        return sendResponse({
          success: false,
          message: "Failed to fetch upcoming matches",
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
                teamType: true,
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

          const setRows = normalizeSetRows(match.sets || []);
          const completedSets = setRows.filter(
            (set: any) => set.setStatus === "completed",
          );
          const matchScore = completedSets.reduce(
            (score: { teamA: number; teamB: number }, set: any) => {
              if (set.winnerId === match.teamA) score.teamA += 1;
              else if (set.winnerId === match.teamB) score.teamB += 1;
              else if (Number(set.teamAScore) > Number(set.teamBScore)) {
                score.teamA += 1;
              } else if (Number(set.teamBScore) > Number(set.teamAScore)) {
                score.teamB += 1;
              }
              return score;
            },
            { teamA: 0, teamB: 0 },
          );

          return {
            id: match.id,
            type:
              match.event?.teamType?.label ||
              match.teamAData?.teamType?.label ||
              "Match",
            endedAt: match.updatedAt,
            status,
            leagueTitle: match.event!.tournament.name,
            leftTeamName: teamAPlayers.join(" & "),
            rightTeamName: teamBPlayers.join(" & "),
            leftTeamPlayers: teamAPlayers,
            rightTeamPlayers: teamBPlayers,
            score: matchScore,
            scoreLabel: "Final Score",
            matchState: match.matchState,
            sets: setRows.map((set: any) => ({
              setNumber: set.setNumber,
              teamAScore: set.teamAScore,
              teamBScore: set.teamBScore,
              setStatus: set.setStatus,
              winnerId: set.winnerId,
            })),
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
        // 1. Get tournaments the user has joined through any event team.
        const joinedTournamentRows = await db
          .select({ tournamentId: eventTable.tournamentId })
          .from(teamParticipantTable)
          .innerJoin(teamTable, eq(teamParticipantTable.teamId, teamTable.id))
          .innerJoin(eventTable, eq(teamTable.eventId, eventTable.id))
          .where(eq(teamParticipantTable.userId, user.id));

        const joinedTournamentIds = [
          ...new Set(joinedTournamentRows.map((row) => row.tournamentId)),
        ];

        const scorerTournamentRows = await db
          .select({ tournamentId: eventTable.tournamentId })
          .from(matchTable)
          .innerJoin(eventTable, eq(matchTable.eventId, eventTable.id))
          .where(eq(matchTable.scorer, user.id));

        const liveFeedTournamentIds = [
          ...new Set([
            ...joinedTournamentIds,
            ...scorerTournamentRows.map((row) => row.tournamentId),
          ]),
        ];

        if (liveFeedTournamentIds.length === 0) {
          return sendResponse({
            success: true,
            message: "No live matches found",
            data: [],
          });
        }

        const joinedTournamentEvents = await db
          .select({ eventId: eventTable.id })
          .from(eventTable)
          .where(inArray(eventTable.tournamentId, liveFeedTournamentIds));

        const joinedTournamentEventIds = joinedTournamentEvents.map(
          (row) => row.eventId,
        );

        if (joinedTournamentEventIds.length === 0) {
          return sendResponse({
            success: true,
            message: "No live matches found",
            data: [],
          });
        }

        // 2. Fetch live candidates from those tournaments, including matches
        // where the current user is just a spectator.
        const liveMatchCandidates = await db.query.matchTable.findMany({
          where: ((match: any, { and, inArray, notInArray }: any) =>
            and(
              notInArray(match.matchState, [
                "completed",
                "abandoned",
                "walkover",
              ]),
              inArray(match.eventId, joinedTournamentEventIds),
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
          orderBy: (table: any, { desc }: any) => [desc(table.updatedAt)],
        });
        const getActiveSets = (sets: any[] = []) => {
          const statusRank: Record<string, number> = {
            in_progress: 3,
            completed: 2,
            not_started: 1,
          };
          const byNumber = new Map<number, any>();

          sets.forEach((set: any) => {
            const existing = byNumber.get(set.setNumber);
            const setRank = statusRank[set.setStatus] ?? 0;
            const existingRank = existing
              ? statusRank[existing.setStatus] ?? 0
              : -1;

            if (!existing || setRank > existingRank) {
              byNumber.set(set.setNumber, set);
            }
          });

          return [...byNumber.values()].sort(
            (a: any, b: any) => a.setNumber - b.setNumber,
          );
        };

        const hasLiveSetActivity = (sets: any[] = []) =>
          getActiveSets(sets).some(
            (set: any) =>
              set.setStatus === "in_progress" ||
              set.setStatus === "completed" ||
              set.teamAScore > 0 ||
              set.teamBScore > 0,
          );

        const liveMatches = (liveMatchCandidates as any[]).filter(
          (match: any) =>
            match.matchState === "in_progress" ||
            hasLiveSetActivity(match.sets || []),
        );

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

          const activeSets = getActiveSets(match.sets || []);
          const currentSet =
            activeSets.find((s: any) => s.setStatus === "in_progress") ||
            [...activeSets]
              .filter(
                (s: any) =>
                  s.setStatus !== "not_started" ||
                  s.teamAScore > 0 ||
                  s.teamBScore > 0,
              )
              .sort((a: any, b: any) => b.setNumber - a.setNumber)[0] ||
            activeSets[0];
          const setsWon = activeSets.reduce(
            (score: { teamA: number; teamB: number }, set: any) => {
              if (set.setStatus !== "completed") return score;
              if (set.winnerId === match.teamA) score.teamA += 1;
              else if (set.winnerId === match.teamB) score.teamB += 1;
              else if (set.teamAScore > set.teamBScore) score.teamA += 1;
              else if (set.teamBScore > set.teamAScore) score.teamB += 1;
              return score;
            },
            { teamA: 0, teamB: 0 },
          );

          groupedData[tournamentId].matches.push({
            id: match.id,
            matchTitle: `${match.event.name} · Match #${match.id.split("-")[0]}`,
            matchState: match.matchState,
            teamA: {
              players: match.teamAData.participants.map((p: any) =>
                p.user.id === user.id ? "You" : p.user.name,
              ),
              images: match.teamAData.participants
                .map((p: any) => p.user.profilePicUrl)
                .filter(Boolean),
            },
            teamB: {
              players: match.teamBData.participants.map((p: any) =>
                p.user.id === user.id ? "You" : p.user.name,
              ),
              images: match.teamBData.participants
                .map((p: any) => p.user.profilePicUrl)
                .filter(Boolean),
            },
            score: {
              teamA: setsWon.teamA,
              teamB: setsWon.teamB,
              currentSet: currentSet ? currentSet.setNumber : 1,
            },
            sets: activeSets.map((s: any) => ({
              id: s.id,
              setNumber: s.setNumber,
              teamAScore: s.teamAScore,
              teamBScore: s.teamBScore,
              setStatus: s.setStatus,
              winnerId: s.winnerId,
            })),
            court: match.courtName || null,
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
        const dob = getDateOnly(body.dob);
        if (!dob) {
          return sendResponse({
            success: false,
            message: "Invalid date of birth.",
          });
        }

        console.info("[user/register] requested", {
          userId: user.id,
          phone: body.phone,
          gender: body.gender,
          dob,
          hasPlayingHand: Boolean(body.playingHand),
          hasPrimarySport: Boolean(body.primarySport),
        });

        try {
          const dobValue = sql`${dob}::date`;
          const existingProfile = await db.query.profileTable.findFirst({
            where: { id: user.id },
            columns: { id: true },
          });

          if (existingProfile) {
            await db
              .update(profileTable)
              .set({
                name: body.name,
                phone: body.phone,
                gender: body.gender,
                dob: dobValue,
                playingHand: body.playingHand,
                primarySport: body.primarySport,
              })
              .where(eq(profileTable.id, user.id));

            console.info("[user/register] updated existing profile", {
              userId: user.id,
            });

            return sendResponse({
              message: "Profile already existed and was updated",
              success: true,
            });
          }

          await db.insert(profileTable).values({
            id: user.id,
            name: body.name,
            phone: body.phone,
            gender: body.gender,
            dob: dobValue,
            playingHand: body.playingHand,
            primarySport: body.primarySport,
          });

          console.info("[user/register] created profile", {
            userId: user.id,
          });

          return sendResponse({
            message: "Created Profile",
            success: true,
          });
        } catch (error) {
          const details = getDbErrorDetails(error);
          console.error("[user/register] failed", {
            userId: user.id,
            phone: body.phone,
            dob,
            details,
          });

          if (details.code === "23505") {
            return sendResponse({
              success: false,
              message:
                details.constraint === "profile_table_pkey"
                  ? "A profile already exists for this account. Please refresh and continue."
                  : "This profile information is already in use.",
            });
          }

          return sendResponse({
            success: false,
            message: "Failed to create profile. Please try again.",
          });
        }
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
