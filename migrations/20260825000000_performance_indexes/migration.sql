CREATE INDEX IF NOT EXISTS "profile_table_phone_idx"
  ON "profile_table" ("phone");

CREATE INDEX IF NOT EXISTS "invites_table_receiver_state_idx"
  ON "invites_table" ("receiver_id", "invite_state");

CREATE INDEX IF NOT EXISTS "invites_table_sender_id_idx"
  ON "invites_table" ("sender_id");

CREATE INDEX IF NOT EXISTS "organization_invites_table_organization_id_idx"
  ON "organization_invites_table" ("organization_id");

CREATE INDEX IF NOT EXISTS "event_invites_table_event_id_idx"
  ON "event_invites_table" ("event_id");

CREATE INDEX IF NOT EXISTS "event_invites_table_team_id_idx"
  ON "event_invites_table" ("team_id");

CREATE INDEX IF NOT EXISTS "tournament_invites_table_tournament_id_idx"
  ON "tournament_invites_table" ("tournament_id");

CREATE INDEX IF NOT EXISTS "organization_member_table_user_id_idx"
  ON "organization_member_table" ("user_id");

CREATE INDEX IF NOT EXISTS "tournament_table_organization_id_idx"
  ON "tournament_table" ("organization_id");

CREATE INDEX IF NOT EXISTS "tournament_table_state_idx"
  ON "tournament_table" ("tournament_state");

CREATE INDEX IF NOT EXISTS "event_table_tournament_id_idx"
  ON "event_table" ("tournament_id");

CREATE INDEX IF NOT EXISTS "event_table_state_idx"
  ON "event_table" ("event_state");

CREATE INDEX IF NOT EXISTS "tournament_volunteer_table_user_id_idx"
  ON "tournament_volunteer_table" ("user_id");

CREATE INDEX IF NOT EXISTS "tournament_volunteer_table_tournament_id_idx"
  ON "tournament_volunteer_table" ("tournament_id");

CREATE INDEX IF NOT EXISTS "team_table_event_id_idx"
  ON "team_table_table" ("event_id");

CREATE INDEX IF NOT EXISTS "team_table_status_idx"
  ON "team_table_table" ("team_status");

CREATE INDEX IF NOT EXISTS "team_participant_table_team_id_idx"
  ON "team_participant_table" ("team_id");

CREATE INDEX IF NOT EXISTS "match_table_event_id_idx"
  ON "match_table" ("event_id");

CREATE INDEX IF NOT EXISTS "match_table_state_idx"
  ON "match_table" ("match_state");

CREATE INDEX IF NOT EXISTS "match_table_scorer_idx"
  ON "match_table" ("scorer");

CREATE INDEX IF NOT EXISTS "match_table_team_a_idx"
  ON "match_table" ("team_a");

CREATE INDEX IF NOT EXISTS "match_table_team_b_idx"
  ON "match_table" ("team_b");

CREATE INDEX IF NOT EXISTS "match_table_event_round_idx"
  ON "match_table" ("event_id", "round_number");

CREATE INDEX IF NOT EXISTS "match_table_event_state_idx"
  ON "match_table" ("event_id", "match_state");
