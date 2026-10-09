CREATE TYPE "public"."sponsor_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "sponsor_tiers" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"benefits" text,
	"price_paise" integer,
	"slots" integer,
	"show_in_hero" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsors" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"tier_id" text NOT NULL,
	"user_id" text,
	"company_name" text NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"website" text,
	"logo_url" text,
	"message" text,
	"status" "sponsor_status" DEFAULT 'PENDING' NOT NULL,
	"paid" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sponsor_tiers" ADD CONSTRAINT "sponsor_tiers_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_tier_id_sponsor_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."sponsor_tiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sponsor_tiers_event_idx" ON "sponsor_tiers" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "sponsors_event_status_idx" ON "sponsors" USING btree ("event_id","status");