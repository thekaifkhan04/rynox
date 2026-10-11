CREATE TYPE "public"."level_outcome" AS ENUM('QUALIFIED', 'ELIMINATED');--> statement-breakpoint
CREATE TABLE "competition_levels" (
	"id" text PRIMARY KEY NOT NULL,
	"competition_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitions" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "level_results" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"level_id" text NOT NULL,
	"outcome" "level_outcome" NOT NULL,
	"result" text,
	"recorded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_types" ADD COLUMN "competition_id" text;--> statement-breakpoint
ALTER TABLE "competition_levels" ADD CONSTRAINT "competition_levels_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_results" ADD CONSTRAINT "level_results_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_results" ADD CONSTRAINT "level_results_level_id_competition_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."competition_levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_results" ADD CONSTRAINT "level_results_recorded_by_id_user_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competition_levels_competition_idx" ON "competition_levels" USING btree ("competition_id","sort_order");--> statement-breakpoint
CREATE INDEX "competitions_event_idx" ON "competitions" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "level_results_ticket_level_idx" ON "level_results" USING btree ("ticket_id","level_id");--> statement-breakpoint
CREATE INDEX "level_results_level_idx" ON "level_results" USING btree ("level_id");--> statement-breakpoint
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE set null ON UPDATE no action;