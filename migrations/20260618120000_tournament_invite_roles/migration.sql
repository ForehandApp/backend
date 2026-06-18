ALTER TABLE "tournament_invites_table"
ADD COLUMN "role" "volunteer_role_enum" DEFAULT 'admin' NOT NULL;
