import {
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  genderEnum,
  inviteStateEnum,
  playingHandEnum,
  volunteerRoleEnum,
} from "./enums";
import { createdAt, updatedAt } from "./common";
import { inviteTypeTable } from "./lookups";
import { organizationTable } from "./organization";
import { eventTable, teamTable, tournamentTable } from "./tournament";

export const profileTable = pgTable.withRLS(
  "profile_table",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    dob: date("dob", { mode: "date" }).notNull(),
    gender: genderEnum().notNull(),
    phone: text("phone").notNull(),

    profilePicUrl: text("profile_pic_url"),
    profilePicPath: text("profile_pic_path"),

    playingHand: playingHandEnum("playing_hand"),
    primarySport: text("primary_sport"),

    createdAt,
    updatedAt,
  },
  (table) => [index("profile_table_phone_idx").on(table.phone)],
);

export const invitesTable = pgTable.withRLS(
  "invites_table",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => profileTable.id),
    receiverId: uuid("receiver_id")
      .notNull()
      .references(() => profileTable.id),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    inviteState: inviteStateEnum("invite_state").notNull().default("pending"),
    invteTypeId: integer("invite_type_id")
      .notNull()
      .references(() => inviteTypeTable.id),

    createdAt,
    updatedAt,
  },
  (table) => [
    index("invites_table_receiver_state_idx").on(
      table.receiverId,
      table.inviteState,
    ),
    index("invites_table_sender_id_idx").on(table.senderId),
  ],
);

export const organizationInvitesTable = pgTable.withRLS(
  "organization_invites_table",
  {
    inviteId: uuid("invite_id")
      .notNull()
      .references(() => invitesTable.id),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizationTable.id),
  },
  (table) => [
    primaryKey({ columns: [table.inviteId, table.organizationId] }),
    index("organization_invites_table_organization_id_idx").on(
      table.organizationId,
    ),
  ],
);

export const eventInvitesTable = pgTable.withRLS(
  "event_invites_table",
  {
    inviteId: uuid("invite_id")
      .notNull()
      .references(() => invitesTable.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => eventTable.id),
    teamId: uuid("team_id")
      .references(() => teamTable.id),
  },
  (table) => [
    primaryKey({ columns: [table.inviteId, table.eventId] }),
    index("event_invites_table_event_id_idx").on(table.eventId),
    index("event_invites_table_team_id_idx").on(table.teamId),
  ],
);

export const tournamentInvitesTable = pgTable.withRLS(
  "tournament_invites_table",
  {
    inviteId: uuid("invite_id")
      .notNull()
      .references(() => invitesTable.id),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournamentTable.id),
    role: volunteerRoleEnum("role").notNull().default("admin"),
  },
  (table) => [
    primaryKey({ columns: [table.inviteId, table.tournamentId] }),
    index("tournament_invites_table_tournament_id_idx").on(
      table.tournamentId,
    ),
  ],
);
