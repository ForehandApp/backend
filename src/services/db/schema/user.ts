import {
  date,
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

export const profileTable = pgTable.withRLS("profile_table", {
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
});

export const invitesTable = pgTable.withRLS("invites_table", {
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
});

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
  (table) => [primaryKey({ columns: [table.inviteId, table.organizationId] })],
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
  (table) => [primaryKey({ columns: [table.inviteId, table.eventId] })],
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
  (table) => [primaryKey({ columns: [table.inviteId, table.tournamentId] })],
);
