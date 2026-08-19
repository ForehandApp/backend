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
  organizationTable,
  tournamentTable,
} from "@/services/db/schema";
import {
  inArray,
  eq,
  and,
  notInArray,
} from "drizzle-orm";
import {
  sportsOptionsTable,
  eventFormatsTable,
  paymentModesTable,
  teamTypesTable,
} from "@/services/db/schema";
import { profileTable } from "@/services/db/schema";
import { getDate } from "@/utils/helpers";
import { sendResponse } from "@/utils/response";
import { t } from "elysia";

export const eventRoutes = protectedApi.group("/event", (app) =>
  app
    .get(
      "/:eventId",
      async ({ db, params: { eventId } }) => {
        const [event] = await db
          .select()
          .from(eventTable)
          .where(eq(eventTable.id, eventId))
          .limit(1);

        if (!event) {
          return sendResponse({
            success: false,
            message: "Event not found",
          });
        }

        const [tournament, sportsOption, eventFormat, teamType, paymentMode] =
          await Promise.all([
            db
              .select()
              .from(tournamentTable)
              .where(eq(tournamentTable.id, event.tournamentId))
              .limit(1)
              .then((rows) => rows[0] ?? null),
            event.sportId
              ? db
                  .select()
                  .from(sportsOptionsTable)
                  .where(eq(sportsOptionsTable.id, event.sportId))
                  .limit(1)
                  .then((rows) => rows[0] ?? null)
              : Promise.resolve(null),
            event.formatId
              ? db
                  .select()
                  .from(eventFormatsTable)
                  .where(eq(eventFormatsTable.id, event.formatId))
                  .limit(1)
                  .then((rows) => rows[0] ?? null)
              : Promise.resolve(null),
            event.teamTypeId
              ? db
                  .select()
                  .from(teamTypesTable)
                  .where(eq(teamTypesTable.id, event.teamTypeId))
                  .limit(1)
                  .then((rows) => rows[0] ?? null)
              : Promise.resolve(null),
            event.paymentModeId
              ? db
                  .select()
                  .from(paymentModesTable)
                  .where(eq(paymentModesTable.id, event.paymentModeId))
                  .limit(1)
                  .then((rows) => rows[0] ?? null)
              : Promise.resolve(null),
          ]);

        const organization = tournament
          ? await db
              .select()
              .from(organizationTable)
              .where(eq(organizationTable.id, tournament.organizationId))
              .limit(1)
              .then((rows) => rows[0] ?? null)
          : null;

        const teams = await db
          .select()
          .from(teamTable)
          .where(eq(teamTable.eventId, eventId));
        const teamIds = teams.map((team) => team.id).filter(Boolean) as string[];

        const participantRows = teamIds.length
          ? await db
              .select({
                teamId: teamParticipantTable.teamId,
                user: profileTable,
              })
              .from(teamParticipantTable)
              .innerJoin(
                profileTable,
                eq(teamParticipantTable.userId, profileTable.id),
              )
              .where(inArray(teamParticipantTable.teamId, teamIds))
          : [];

        const participantsByTeamId = new Map<string, any[]>();
        for (const row of participantRows as any[]) {
          const current = participantsByTeamId.get(row.teamId) || [];
          current.push({ user: row.user });
          participantsByTeamId.set(row.teamId, current);
        }

        const normalizedTeams = teams.map((team) => ({
          ...team,
          participants: participantsByTeamId.get(team.id) || [],
        }));

        const matches = await db
          .select()
          .from(matchTable)
          .where(eq(matchTable.eventId, eventId));
        const matchIds = matches.map((match) => match.id).filter(Boolean) as string[];

        const sets = matchIds.length
          ? await db
              .select()
              .from(setTable)
              .where(inArray(setTable.matchId, matchIds))
          : [];

        const scorerIds = [
          ...new Set(matches.map((match) => match.scorer).filter(Boolean)),
        ] as string[];
        const teamAIds = [
          ...new Set(matches.map((match) => match.teamA).filter(Boolean)),
        ] as string[];
        const teamBIds = [
          ...new Set(matches.map((match) => match.teamB).filter(Boolean)),
        ] as string[];
        const winnerIds = [
          ...new Set(matches.map((match) => match.winnerId).filter(Boolean)),
        ] as string[];

        const [scorers, teamAData, teamBData, winners] = await Promise.all([
          scorerIds.length
            ? db
                .select()
                .from(profileTable)
                .where(inArray(profileTable.id, scorerIds))
            : Promise.resolve([]),
          teamAIds.length
            ? db
                .select()
                .from(teamTable)
                .where(inArray(teamTable.id, teamAIds))
            : Promise.resolve([]),
          teamBIds.length
            ? db
                .select()
                .from(teamTable)
                .where(inArray(teamTable.id, teamBIds))
            : Promise.resolve([]),
          winnerIds.length
            ? db
                .select()
                .from(teamTable)
                .where(inArray(teamTable.id, winnerIds))
            : Promise.resolve([]),
        ]);

        const scorerMap = new Map<string, any>(
          (scorers as any[]).map((scorer) => [scorer.id, scorer]),
        );
        const teamMapEntries = [
          ...normalizedTeams,
          ...(teamAData as any[]),
          ...(teamBData as any[]),
          ...(winners as any[]),
        ]
          .filter((team: any) => team?.id)
          .map((team: any) => [
            team.id,
            {
              ...team,
              participants: participantsByTeamId.get(team.id) || [],
            },
          ] as const);
        const teamMap = new Map<string, any>(teamMapEntries);

        const setsByMatchId = new Map<string, any[]>();
        for (const setRow of sets as any[]) {
          const current = setsByMatchId.get(setRow.matchId) || [];
          current.push(setRow);
          setsByMatchId.set(setRow.matchId, current);
        }

        const normalizedMatches = matches.map((match) => ({
          ...match,
          sets: setsByMatchId.get(match.id) || [],
          scorerUser: match.scorer ? scorerMap.get(match.scorer) || null : null,
          teamAData: match.teamA ? teamMap.get(match.teamA) || null : null,
          teamBData: match.teamB ? teamMap.get(match.teamB) || null : null,
          winner: match.winnerId ? teamMap.get(match.winnerId) || null : null,
        }));

        return sendResponse({
          success: true,
          message: "Event retrieved successfully",
          data: {
            ...event,
            tournament: tournament
              ? {
                  ...tournament,
                  organization,
                }
              : null,
            sportsOption,
            eventFormat,
            teamType,
            paymentMode,
            teams: normalizedTeams,
            matches: normalizedMatches,
          },
        });
      },
      {
        params: t.Object({ eventId: t.String({ format: "uuid" }) }),
      },
    )
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
    .patch(
      "/:eventId",
      async ({ db, user, params: { eventId }, body }) => {
        const event = await db.query.eventTable.findFirst({
          where: {
            id: eventId
          },
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

        const updateValues: Record<string, any> = {};
        if (body.name !== undefined) updateValues.name = body.name;
        if (body.gender !== undefined) updateValues.gender = body.gender;
        if (body.pointsPerSet !== undefined) updateValues.pointsPerSet = body.pointsPerSet;
        if (body.setsPerMatch !== undefined) updateValues.setsPerMatch = body.setsPerMatch;
        if (body.amount !== undefined) updateValues.amount = body.amount;

        if (body.dueDate !== undefined) updateValues.dueDate = getDate(body.dueDate);
        if (body.startDate !== undefined) updateValues.startDate = getDate(body.startDate);
        if (body.playerBornAfter !== undefined) {
          updateValues.playerBornAfter = body.playerBornAfter !== null ? getDate(body.playerBornAfter) : null;
        }

        // Validate due date is not after start date if either is modified
        const finalDueDate = updateValues.dueDate !== undefined ? updateValues.dueDate : getDate(String(event.dueDate));
        const finalStartDate = updateValues.startDate !== undefined ? updateValues.startDate : getDate(String(event.startDate));
        if (finalDueDate.getTime() > finalStartDate.getTime()) {
          return sendResponse({
            success: false,
            message: "Due date cannot be after event start date",
          });
        }

        if (body.sportsOptionCode !== undefined) {
          const sport = await db.query.sportsOptionsTable.findFirst({
            where: { code: body.sportsOptionCode },
            columns: { id: true },
          });
          if (!sport) {
            return sendResponse({
              success: false,
              message: "Invalid sports option code",
            });
          }
          updateValues.sportId = sport.id;
        }

        if (body.eventFormatCode !== undefined) {
          const format = await db.query.eventFormatsTable.findFirst({
            where: { code: body.eventFormatCode },
            columns: { id: true },
          });
          if (!format) {
            return sendResponse({
              success: false,
              message: "Invalid event format code",
            });
          }
          updateValues.formatId = format.id;
        }

        if (body.teamTypeCode !== undefined) {
          const teamType = await db.query.teamTypesTable.findFirst({
            where: { code: body.teamTypeCode },
            columns: { id: true },
          });
          if (!teamType) {
            return sendResponse({
              success: false,
              message: "Invalid team type code",
            });
          }
          updateValues.teamTypeId = teamType.id;
        }

        if (body.paymentModeCode !== undefined) {
          if (body.paymentModeCode === null) {
            updateValues.paymentModeId = null;
          } else {
            const paymentMode = await db.query.paymentModesTable.findFirst({
              where: { code: body.paymentModeCode },
              columns: { id: true },
            });
            if (!paymentMode) {
              return sendResponse({
                success: false,
                message: "Invalid payment mode code",
              });
            }
            updateValues.paymentModeId = paymentMode.id;
          }
        }

        if (Object.keys(updateValues).length === 0) {
          return sendResponse({
            success: false,
            message: "No fields to update",
          });
        }

        await db
          .update(eventTable)
          .set(updateValues)
          .where(eq(eventTable.id, eventId));

        return sendResponse({
          success: true,
          message: "Event updated successfully",
        });
      },
      {
        params: t.Object({ eventId: t.String({ format: "uuid" }) }),
        body: t.Object({
          name: t.Optional(t.String()),
          sportsOptionCode: t.Optional(t.String()),
          eventFormatCode: t.Optional(t.String()),
          dueDate: t.Optional(t.String()),
          startDate: t.Optional(t.String()),
          gender: t.Optional(t.Nullable(t.UnionEnum(["male", "female"]))),
          teamTypeCode: t.Optional(t.String()),
          setsPerMatch: t.Optional(t.Number()),
          pointsPerSet: t.Optional(t.Number()),
          playerBornAfter: t.Optional(t.Nullable(t.String())),
          paymentModeCode: t.Optional(t.Nullable(t.String())),
          amount: t.Optional(t.Number()),
        }),
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
          const [event] = await db
            .select()
            .from(eventTable)
            .where(eq(eventTable.id, eventId))
            .limit(1);

          if (!event) {
            return sendResponse({
              success: false,
              message: "Event not found",
            });
          }

          const teamRows = await db
            .select()
            .from(teamTable)
            .where(eq(teamTable.eventId, eventId));
          const matchRows = await db
            .select()
            .from(matchTable)
            .where(eq(matchTable.eventId, eventId));
          const matchIds = matchRows.map((match) => match.id).filter(Boolean) as string[];
          const teamIds = teamRows.map((team) => team.id).filter(Boolean) as string[];

          const [participantRows, setRows] = await Promise.all([
            teamIds.length
              ? db
                  .select({
                    teamId: teamParticipantTable.teamId,
                    user: profileTable,
                  })
                  .from(teamParticipantTable)
                  .innerJoin(
                    profileTable,
                    eq(teamParticipantTable.userId, profileTable.id),
                  )
                  .where(inArray(teamParticipantTable.teamId, teamIds))
              : Promise.resolve([]),
            matchIds.length
              ? db
                  .select()
                  .from(setTable)
                  .where(inArray(setTable.matchId, matchIds))
              : Promise.resolve([]),
          ]);

          const participantsByTeamId = new Map<string, any[]>();
          for (const row of participantRows as any[]) {
            const current = participantsByTeamId.get(row.teamId) || [];
            current.push(row.user);
            participantsByTeamId.set(row.teamId, current);
          }

          const setsByMatchId = new Map<string, any[]>();
          for (const setRow of setRows as any[]) {
            const current = setsByMatchId.get(setRow.matchId) || [];
            current.push(setRow);
            setsByMatchId.set(setRow.matchId, current);
          }

          const teamMetaById = new Map<string, any>();
          for (const team of teamRows as any[]) {
            const players = (participantsByTeamId.get(team.id) || []).map(
              (user: any) => ({
                id: user.id,
                name: user.name,
                avatarUrl: user.profilePicUrl ?? null,
              }),
            );
            teamMetaById.set(team.id, {
              teamId: team.id,
              teamName:
                players.length > 0
                  ? players.map((p: any) => p.name).join(" / ")
                  : team.name || "Unknown Team",
              avatarUrl:
                players.find((p: any) => p.avatarUrl)?.avatarUrl ?? null,
              players,
              played: 0,
              wins: 0,
              losses: 0,
              setsWon: 0,
              setsLost: 0,
              pointsFor: 0,
              pointsAgainst: 0,
            });
          }

          const statsByTeam = new Map<string, any>();

          for (const [teamId, meta] of teamMetaById.entries()) {
            statsByTeam.set(teamId, meta);
          }

          for (const match of matchRows) {
            const teamAId = match.teamA;
            const teamBId = match.teamB;
            if (!teamAId || !teamBId) continue;

            if (!statsByTeam.has(teamAId)) {
              const meta = teamMetaById.get(teamAId) || {
                teamId: teamAId,
                teamName: "Unknown Team",
                avatarUrl: null,
                players: [],
              };
              statsByTeam.set(teamAId, {
                teamId: teamAId,
                teamName: meta.teamName,
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
              const meta = teamMetaById.get(teamBId) || {
                teamId: teamBId,
                teamName: "Unknown Team",
                avatarUrl: null,
                players: [],
              };
              statsByTeam.set(teamBId, {
                teamId: teamBId,
                teamName: meta.teamName,
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

            for (const set of setsByMatchId.get(match.id) || []) {
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

          const champion = standings[0] || null;

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
              totalMatches: matchRows.length,
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
                scorer: match.scorer ?? null,
                matchState: "scheduled",
                startTime: getDate(match.startTime),
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
              startTime: t.String(),
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
