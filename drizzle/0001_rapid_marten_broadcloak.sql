CREATE TYPE "public"."payment_method" AS ENUM('ONLINE', 'OFFLINE');--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_method" "payment_method" DEFAULT 'ONLINE' NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD COLUMN "offline_price_paise" integer;