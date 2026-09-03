import {
  matchTable,
  organizationMemberTable,
  setTable,
  teamParticipantTable,
  teamTable,
  tournamentTable,
  tournamentVolunteerTable,
} from "@/services/db/schema";
import { and, eq, inArray } from "drizzle-orm";

type TournamentLike = {
  id: string;
  organizationId: string;
  tournamentState?: string | null;
};

export const publicProfileColumns = {
  id: true,
  name: true,
  profilePicUrl: true,
} as const;

async function getTournamentById(db: any, tournamentId: string) {
  return db.query.tournamentTable.findFirst({
    where: { id: tournamentId },
  }) as Promise<TournamentLike | undefined>;
}

export async function isTournamentManager(
  db: any,
  userId: string,
  tournamentOrId: TournamentLike | string,
) {
  const tournament =
    typeof tournamentOrId === "string"
      ? await getTournamentById(db, tournamentOrId)
      : tournamentOrId;

  if (!tournament) return false;

  const [memberRows, adminRows] = await Promise.all([
    db
      .select({ userId: organizationMemberTable.userId })
      .from(organizationMemberTable)
      .where(
        and(
          eq(organizationMemberTable.organizationId, tournament.organizationId),
          eq(organizationMemberTable.userId, userId),
        ),
      )
      .limit(1),
    db
      .select({ userId: tournamentVolunteerTable.userId })
      .from(tournamentVolunteerTable)
      .where(
        and(
          eq(tournamentVolunteerTable.tournamentId, tournament.id),
          eq(tournamentVolunteerTable.userId, userId),
          eq(tournamentVolunteerTable.role, "admin"),
        ),
      )
      .limit(1),
  ]);

  return memberRows.length > 0 || adminRows.length > 0;
}

export async function canViewTournament(
  db: any,
  userId: string,
  tournamentOrId: TournamentLike | string,
) {
  const tournament =
    typeof tournamentOrId === "string"
      ? await getTournamentById(db, tournamentOrId)
      : tournamentOrId;

  if (!tournament) return false;
  if (tournament.tournamentState !== "drafted") return true;

  const [memberRows, volunteerRows] = await Promise.all([
    db
      .select({ userId: organizationMemberTable.userId })
      .from(organizationMemberTable)
      .where(
        and(
          eq(organizationMemberTable.organizationId, tournament.organizationId),
          eq(organizationMemberTable.userId, userId),
        ),
      )
      .limit(1),
    db
      .select({ userId: tournamentVolunteerTable.userId })
      .from(tournamentVolunteerTable)
      .where(
        and(
          eq(tournamentVolunteerTable.tournamentId, tournament.id),
          eq(tournamentVolunteerTable.userId, userId),
        ),
      )
      .limit(1),
  ]);

  return memberRows.length > 0 || volunteerRows.length > 0;
}

export async function canViewEvent(db: any, userId: string, eventId: string) {
  const event = await db.query.eventTable.findFirst({
    where: { id: eventId },
    with: { tournament: true },
  });

  if (!event?.tournament) return false;
  if (await canViewTournament(db, userId, event.tournament)) return true;

  const participantRows = await db
    .select({ userId: teamParticipantTable.userId })
    .from(teamParticipantTable)
    .innerJoin(teamTable, eq(teamParticipantTable.teamId, teamTable.id))
    .where(
      and(
        eq(teamTable.eventId, eventId),
        eq(teamParticipantTable.userId, userId),
      ),
    )
    .limit(1);

  return participantRows.length > 0;
}

export async function canViewTeam(db: any, userId: string, teamId: string) {
  const team = await db.query.teamTable.findFirst({
    where: { id: teamId },
    with: { event: { with: { tournament: true } } },
  });

  if (!team?.event?.tournament) return false;
  if (await canViewTournament(db, userId, team.event.tournament)) return true;

  const participantRows = await db
    .select({ userId: teamParticipantTable.userId })
    .from(teamParticipantTable)
    .where(
      and(
        eq(teamParticipantTable.teamId, teamId),
        eq(teamParticipantTable.userId, userId),
      ),
    )
    .limit(1);

  return participantRows.length > 0;
}

export async function canViewMatch(db: any, userId: string, matchId: string) {
  const match = await db.query.matchTable.findFirst({
    where: { id: matchId },
    with: { event: { with: { tournament: true } } },
  });

  if (!match?.event?.tournament) return false;
  if (match.scorer === userId) return true;
  if (await canViewTournament(db, userId, match.event.tournament)) return true;

  const teamIds = [match.teamA, match.teamB].filter(Boolean) as string[];
  if (teamIds.length === 0) return false;

  const participantRows = await db
    .select({ userId: teamParticipantTable.userId })
    .from(teamParticipantTable)
    .where(
      and(
        inArray(teamParticipantTable.teamId, teamIds),
        eq(teamParticipantTable.userId, userId),
      ),
    )
    .limit(1);

  return participantRows.length > 0;
}

export async function canViewSet(db: any, userId: string, setId: string) {
  const row = await db
    .select({ matchId: setTable.matchId })
    .from(setTable)
    .where(eq(setTable.id, setId))
    .limit(1);

  return row.length > 0 && canViewMatch(db, userId, row[0].matchId);
}
