import {
  date,
  index,
  integer,
  pgTable,
  text,
  uuid,
  primaryKey,
} from "drizzle-orm/pg-core";
import { organizationTable } from "./organization";
import {
  eventStateEnum,
  genderEnum,
  teamActionsEnum,
  teamStatusEnum,
  tournamentStateEnum,
  volunteerRoleEnum,
} from "./enums";
import { createdAt, updatedAt } from "./common";
import {
  eventFormatsTable,
  paymentModesTable,
  sportsOptionsTable,
  teamTypesTable,
} from "./lookups";
import { profileTable } from "./user";

export const tournamentTable = pgTable.withRLS(
  "tournament_table",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizationTable.id),
    name: text("name").notNull(),
    description: text("description").notNull(),
    startDate: date("start_date", { mode: "date" }).notNull(),
    endDate: date("end_date", { mode: "date" }),

    venueName: text("venue_name").notNull(),
    venuePostalCode: text("venue_postal_code").notNull(),
    venueState: text("venue_state").notNull(),
    venueCity: text("venue_city").notNull(),
    venueAddress: text("venue_address"),

    venueCourts: integer("venue_courts").notNull(),

    logoUrl: text("logo_url"),
    logoPath: text("logo_path"),

    contactName: text("contact_name").notNull(),
    contactEmail: text("contact_email").notNull(),
    contactPhone: text("contact_phone").notNull(),

    upiId: text("upi_id"),

    tournamentState: tournamentStateEnum("tournament_state")
      .notNull()
      .default("drafted"),

    createdAt,
    updatedAt,
  },
  (table) => [
    index("tournament_table_organization_id_idx").on(table.organizationId),
    index("tournament_table_state_idx").on(table.tournamentState),
  ],
);

export const eventTable = pgTable.withRLS(
  "event_table",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournamentTable.id),
    name: text("name").notNull(),
    sportId: integer("sport_id")
      .notNull()
      .references(() => sportsOptionsTable.id),
    formatId: integer("format_id")
      .notNull()
      .references(() => eventFormatsTable.id),

    dueDate: date("due_date", { mode: "date" }).notNull(),
    startDate: date("start_date", { mode: "date" }).notNull(),

    gender: genderEnum(),
    teamTypeId: integer("team_type_id")
      .notNull()
      .references(() => teamTypesTable.id),
    playerBornAfter: date("player_born_after", { mode: "date" }),

    pointsPerSet: integer("points_per_set").notNull(),
    setsPerMatch: integer("sets_per_match").notNull(),

    paymentModeId: integer("payment_mode_id").references(
      () => paymentModesTable.id,
    ),

    amount: integer("amount").notNull(),

    winnerId: uuid("winner_id").references(() => profileTable.id),

    eventState: eventStateEnum("event_state").notNull().default("created"),

    activeRound: integer("active_round"),

    createdAt,
    updatedAt,
  },
  (table) => [
    index("event_table_tournament_id_idx").on(table.tournamentId),
    index("event_table_state_idx").on(table.eventState),
  ],
);

export const tournamentVolunteerTable = pgTable.withRLS(
  "tournament_volunteer_table",
  {
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournamentTable.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => profileTable.id),
    role: volunteerRoleEnum("role").notNull(),

    createdAt,
    updatedAt,
  },
  (table) => [
    index("tournament_volunteer_table_user_id_idx").on(table.userId),
    index("tournament_volunteer_table_tournament_id_idx").on(
      table.tournamentId,
    ),
  ],
);

export const teamTable = pgTable.withRLS(
  "team_table_table",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamStatus: teamStatusEnum("team_status").notNull().default("registered"),
    teamTypeId: integer("team_type_id")
      .notNull()
      .references(() => teamTypesTable.id),
    eventId: uuid("event_id").references(() => eventTable.id),

    createdAt,
    updatedAt,
  },
  (table) => [
    index("team_table_event_id_idx").on(table.eventId),
    index("team_table_status_idx").on(table.teamStatus),
  ],
);

export const teamParticipantTable = pgTable.withRLS(
  "team_participant_table",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profileTable.id),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teamTable.id),
    createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.teamId] }),
    index("team_participant_table_team_id_idx").on(table.teamId),
  ],
);

export const teamActionLogsTable = pgTable.withRLS("team_action_logs_table", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teamTable.id),
  actedById: uuid("acted_by_id")
    .notNull()
    .references(() => profileTable.id),
  reason: text("reason").notNull(),
  action: teamActionsEnum("action").notNull(),
  createdAt,
});
