CREATE TYPE "event_state_enum" AS ENUM('created', 'registration_closed', 'participants_finalized', 'scheduled', 'in_progress', 'round_over', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "gender_enum" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "invite_state_enum" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "match_state_enum" AS ENUM('scheduled', 'in_progress', 'completed', 'abandoned', 'walkover');--> statement-breakpoint
CREATE TYPE "playing_hand_enum" AS ENUM('left', 'right');--> statement-breakpoint
CREATE TYPE "set_state_enum" AS ENUM('not_started', 'in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "side_switch_enum" AS ENUM('per_set', 'half_set', 'no_switch');--> statement-breakpoint
CREATE TYPE "team_actions_enum" AS ENUM('rejected', 'disqualified', 'reverted');--> statement-breakpoint
CREATE TYPE "team_status_enum" AS ENUM('created', 'registered', 'participating', 'rejected', 'disqualified', 'eliminated');--> statement-breakpoint
CREATE TYPE "tournament_state_enum" AS ENUM('drafted', 'published', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "volunteer_role_enum" AS ENUM('admin', 'scorer');--> statement-breakpoint
CREATE TABLE "event_formats_table" (
	"id" serial PRIMARY KEY,
	"code" text NOT NULL UNIQUE,
	"label" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_formats_table" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invite_types_table" (
	"id" serial PRIMARY KEY,
	"code" text NOT NULL UNIQUE,
	"label" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invite_types_table" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "org_types_table" (
	"id" serial PRIMARY KEY,
	"code" text NOT NULL UNIQUE,
	"label" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_types_table" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payment_modes_table" (
	"id" serial PRIMARY KEY,
	"code" text NOT NULL UNIQUE,
	"label" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_modes_table" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sports_options_table" (
	"id" serial PRIMARY KEY,
	"code" text NOT NULL UNIQUE,
	"label" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sports_options_table" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "team_types_table" (
	"id" serial PRIMARY KEY,
	"code" text NOT NULL UNIQUE,
	"label" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_types_table" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "match_table" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"event_id" uuid NOT NULL,
	"round_number" integer NOT NULL,
	"team_a" uuid NOT NULL,
	"team_b" uuid NOT NULL,
	"scorer" uuid NOT NULL,
	"winner_id" uuid,
	"match_state" "match_state_enum" DEFAULT 'scheduled'::"match_state_enum" NOT NULL,
	"sets_per_match" integer NOT NULL,
	"points_per_set" integer NOT NULL,
	"deuce_enabled" boolean DEFAULT true NOT NULL,
	"deuce_limit" boolean DEFAULT false NOT NULL,
	"side_switching" "side_switch_enum" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_table" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "set_table" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"match_id" uuid NOT NULL,
	"set_status" "set_state_enum" DEFAULT 'not_started'::"set_state_enum" NOT NULL,
	"set_integer" integer NOT NULL,
	"team_a_score" integer NOT NULL,
	"team_b_score" integer NOT NULL,
	"winner_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "set_table" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organization_member_table" (
	"organization_id" uuid,
	"user_id" uuid,
	"is_owner" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "organization_member_table_pkey" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "organization_member_table" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organization_table" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"org_type_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"logo_url" text,
	"logo_path" text,
	"established_year" integer NOT NULL,
	"website" text,
	"contact_email" text NOT NULL,
	"contact_phone" text NOT NULL,
	"postal_code" text NOT NULL,
	"state" text NOT NULL,
	"city" text NOT NULL,
	"address" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_table" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "event_table" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tournament_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sport_id" integer NOT NULL,
	"format_id" integer NOT NULL,
	"due_date" date NOT NULL,
	"start_date" date NOT NULL,
	"gender" "gender_enum",
	"team_type_id" integer NOT NULL,
	"player_born_after" date,
	"points_per_set" integer NOT NULL,
	"sets_per_match" integer NOT NULL,
	"payment_mode_id" integer,
	"amount" integer NOT NULL,
	"winner_id" uuid,
	"event_state" "event_state_enum" DEFAULT 'created'::"event_state_enum" NOT NULL,
	"active_round" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_table" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "team_action_logs_table" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"team_id" uuid NOT NULL,
	"acted_by_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"action" "team_actions_enum" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_action_logs_table" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "team_participant_table" (
	"user_id" uuid,
	"team_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_participant_table_pkey" PRIMARY KEY("user_id","team_id")
);
--> statement-breakpoint
ALTER TABLE "team_participant_table" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "team_table_table" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"team_status" "team_status_enum" DEFAULT 'registered'::"team_status_enum" NOT NULL,
	"team_type_id" integer NOT NULL,
	"event_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_table_table" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tournament_table" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"venue_name" text NOT NULL,
	"venue_postal_code" text NOT NULL,
	"venue_state" text NOT NULL,
	"venue_city" text NOT NULL,
	"venue_address" text,
	"venue_courts" integer NOT NULL,
	"logo_url" text,
	"logo_path" text,
	"contact_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"contact_phone" text NOT NULL,
	"upi_id" text,
	"tournament_state" "tournament_state_enum" DEFAULT 'drafted'::"tournament_state_enum" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tournament_table" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tournament_volunteer_table" (
	"tournament_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "volunteer_role_enum" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tournament_volunteer_table" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "event_invites_table" (
	"invite_id" uuid,
	"event_id" uuid,
	"team_id" uuid,
	CONSTRAINT "event_invites_table_pkey" PRIMARY KEY("invite_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "event_invites_table" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invites_table" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"sender_id" uuid NOT NULL,
	"receiver_id" uuid NOT NULL,
	"token" text NOT NULL UNIQUE,
	"expires_at" timestamp NOT NULL,
	"invite_state" "invite_state_enum" DEFAULT 'pending'::"invite_state_enum" NOT NULL,
	"invite_type_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invites_table" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organization_invites_table" (
	"invite_id" uuid,
	"organization_id" uuid,
	CONSTRAINT "organization_invites_table_pkey" PRIMARY KEY("invite_id","organization_id")
);
--> statement-breakpoint
ALTER TABLE "organization_invites_table" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profile_table" (
	"id" uuid PRIMARY KEY,
	"name" text NOT NULL,
	"dob" date NOT NULL,
	"gender" "gender_enum" NOT NULL,
	"phone" text NOT NULL,
	"profile_pic_url" text,
	"profile_pic_path" text,
	"playing_hand" "playing_hand_enum",
	"primary_sport" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_table" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tournament_invites_table" (
	"invite_id" uuid,
	"tournament_id" uuid,
	CONSTRAINT "tournament_invites_table_pkey" PRIMARY KEY("invite_id","tournament_id")
);
--> statement-breakpoint
ALTER TABLE "tournament_invites_table" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "match_table" ADD CONSTRAINT "match_table_event_id_event_table_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event_table"("id");--> statement-breakpoint
ALTER TABLE "match_table" ADD CONSTRAINT "match_table_team_a_team_table_table_id_fkey" FOREIGN KEY ("team_a") REFERENCES "team_table_table"("id");--> statement-breakpoint
ALTER TABLE "match_table" ADD CONSTRAINT "match_table_team_b_team_table_table_id_fkey" FOREIGN KEY ("team_b") REFERENCES "team_table_table"("id");--> statement-breakpoint
ALTER TABLE "match_table" ADD CONSTRAINT "match_table_scorer_profile_table_id_fkey" FOREIGN KEY ("scorer") REFERENCES "profile_table"("id");--> statement-breakpoint
ALTER TABLE "match_table" ADD CONSTRAINT "match_table_winner_id_team_table_table_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "team_table_table"("id");--> statement-breakpoint
ALTER TABLE "set_table" ADD CONSTRAINT "set_table_match_id_match_table_id_fkey" FOREIGN KEY ("match_id") REFERENCES "match_table"("id");--> statement-breakpoint
ALTER TABLE "set_table" ADD CONSTRAINT "set_table_winner_id_team_table_table_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "team_table_table"("id");--> statement-breakpoint
ALTER TABLE "organization_member_table" ADD CONSTRAINT "organization_member_table_giIHp3ejq6SM_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization_table"("id");--> statement-breakpoint
ALTER TABLE "organization_member_table" ADD CONSTRAINT "organization_member_table_user_id_profile_table_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profile_table"("id");--> statement-breakpoint
ALTER TABLE "organization_table" ADD CONSTRAINT "organization_table_org_type_id_org_types_table_id_fkey" FOREIGN KEY ("org_type_id") REFERENCES "org_types_table"("id");--> statement-breakpoint
ALTER TABLE "event_table" ADD CONSTRAINT "event_table_tournament_id_tournament_table_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournament_table"("id");--> statement-breakpoint
ALTER TABLE "event_table" ADD CONSTRAINT "event_table_sport_id_sports_options_table_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports_options_table"("id");--> statement-breakpoint
ALTER TABLE "event_table" ADD CONSTRAINT "event_table_format_id_event_formats_table_id_fkey" FOREIGN KEY ("format_id") REFERENCES "event_formats_table"("id");--> statement-breakpoint
ALTER TABLE "event_table" ADD CONSTRAINT "event_table_team_type_id_team_types_table_id_fkey" FOREIGN KEY ("team_type_id") REFERENCES "team_types_table"("id");--> statement-breakpoint
ALTER TABLE "event_table" ADD CONSTRAINT "event_table_payment_mode_id_payment_modes_table_id_fkey" FOREIGN KEY ("payment_mode_id") REFERENCES "payment_modes_table"("id");--> statement-breakpoint
ALTER TABLE "event_table" ADD CONSTRAINT "event_table_winner_id_profile_table_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "profile_table"("id");--> statement-breakpoint
ALTER TABLE "team_action_logs_table" ADD CONSTRAINT "team_action_logs_table_team_id_team_table_table_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team_table_table"("id");--> statement-breakpoint
ALTER TABLE "team_action_logs_table" ADD CONSTRAINT "team_action_logs_table_acted_by_id_profile_table_id_fkey" FOREIGN KEY ("acted_by_id") REFERENCES "profile_table"("id");--> statement-breakpoint
ALTER TABLE "team_participant_table" ADD CONSTRAINT "team_participant_table_user_id_profile_table_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profile_table"("id");--> statement-breakpoint
ALTER TABLE "team_participant_table" ADD CONSTRAINT "team_participant_table_team_id_team_table_table_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team_table_table"("id");--> statement-breakpoint
ALTER TABLE "team_table_table" ADD CONSTRAINT "team_table_table_team_type_id_team_types_table_id_fkey" FOREIGN KEY ("team_type_id") REFERENCES "team_types_table"("id");--> statement-breakpoint
ALTER TABLE "team_table_table" ADD CONSTRAINT "team_table_table_event_id_event_table_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event_table"("id");--> statement-breakpoint
ALTER TABLE "tournament_table" ADD CONSTRAINT "tournament_table_organization_id_organization_table_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization_table"("id");--> statement-breakpoint
ALTER TABLE "tournament_volunteer_table" ADD CONSTRAINT "tournament_volunteer_table_Eo4jcs4ObjXm_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournament_table"("id");--> statement-breakpoint
ALTER TABLE "tournament_volunteer_table" ADD CONSTRAINT "tournament_volunteer_table_user_id_profile_table_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profile_table"("id");--> statement-breakpoint
ALTER TABLE "event_invites_table" ADD CONSTRAINT "event_invites_table_invite_id_invites_table_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "invites_table"("id");--> statement-breakpoint
ALTER TABLE "event_invites_table" ADD CONSTRAINT "event_invites_table_event_id_event_table_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event_table"("id");--> statement-breakpoint
ALTER TABLE "event_invites_table" ADD CONSTRAINT "event_invites_table_team_id_team_table_table_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team_table_table"("id");--> statement-breakpoint
ALTER TABLE "invites_table" ADD CONSTRAINT "invites_table_sender_id_profile_table_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "profile_table"("id");--> statement-breakpoint
ALTER TABLE "invites_table" ADD CONSTRAINT "invites_table_receiver_id_profile_table_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "profile_table"("id");--> statement-breakpoint
ALTER TABLE "invites_table" ADD CONSTRAINT "invites_table_invite_type_id_invite_types_table_id_fkey" FOREIGN KEY ("invite_type_id") REFERENCES "invite_types_table"("id");--> statement-breakpoint
ALTER TABLE "organization_invites_table" ADD CONSTRAINT "organization_invites_table_invite_id_invites_table_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "invites_table"("id");--> statement-breakpoint
ALTER TABLE "organization_invites_table" ADD CONSTRAINT "organization_invites_table_1FiTJyhZVf22_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization_table"("id");--> statement-breakpoint
ALTER TABLE "tournament_invites_table" ADD CONSTRAINT "tournament_invites_table_invite_id_invites_table_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "invites_table"("id");--> statement-breakpoint
ALTER TABLE "tournament_invites_table" ADD CONSTRAINT "tournament_invites_table_tournament_id_tournament_table_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournament_table"("id");