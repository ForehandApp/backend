import {
  boolean,
  integer,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { eventTable, teamTable } from "./tournament";
import { profileTable } from "./user";
import { matchStateEnum, setStateEnum, sideSwitchEnum } from "./enums";
import { createdAt, updatedAt } from "./common";

export const matchTable = pgTable.withRLS("match_table", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => eventTable.id),
  roundNumber: integer("round_number").notNull(),

  teamA: uuid("team_a")
    .notNull()
    .references(() => teamTable.id),
  teamB: uuid("team_b")
    .notNull()
    .references(() => teamTable.id),

  scorer: uuid("scorer").references(() => profileTable.id),

  winnerId: uuid("winner_id").references(() => teamTable.id),

  matchState: matchStateEnum("match_state").notNull().default("scheduled"),

  setsPerMatchId: integer("sets_per_match").notNull(),

  pointsPerSet: integer("points_per_set").notNull(),

  deuce_enabled: boolean("deuce_enabled").notNull().default(true),

  deuce_limit: boolean("deuce_limit").notNull().default(false),

  sideSwitching: sideSwitchEnum("side_switching").notNull(),

  startTime: timestamp("start_time", { mode: "date" }),

  createdAt,
  updatedAt,
});

export const setTable = pgTable.withRLS("set_table", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: uuid("match_id")
    .notNull()
    .references(() => matchTable.id),

  setStatus: setStateEnum("set_status").notNull().default("not_started"),
  setNumber: integer("set_integer").notNull(),

  teamAScore: integer("team_a_score").notNull(),
  teamBScore: integer("team_b_score").notNull(),

  winnerId: uuid("winner_id").references(() => teamTable.id),

  createdAt,
  updatedAt,
});
