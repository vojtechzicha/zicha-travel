import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_chatas_surroundings_category" AS ENUM('place', 'trip');
  CREATE TYPE "public"."enum_chatas_custom_tabs_icon" AS ENUM('file-text', 'mountain', 'map', 'utensils', 'sparkles', 'book-open', 'calendar', 'info');
  CREATE TYPE "public"."enum_chatas_public_transport_options_connections_type" AS ENUM('vlak', 'autobus', 'metro', 'tramvaj');
  CREATE TYPE "public"."enum_chatas_public_transport_options_direction" AS ENUM('tam', 'zpet');
  CREATE TYPE "public"."enum_expenses_split_type" AS ENUM('equal', 'weighted');
  CREATE TYPE "public"."enum_expenses_approval_status" AS ENUM('approved', 'pending', 'rejected');
  CREATE TYPE "public"."enum_expenses_source_list" AS ENUM('shopping', 'beer');
  CREATE TYPE "public"."enum_prepayments_type" AS ENUM('advance', 'supplement', 'refund', 'distribution');
  CREATE TYPE "public"."enum_claim_requests_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');
  CREATE TYPE "public"."enum_pending_votes_status" AS ENUM('pending', 'confirmed', 'discarded');
  CREATE TYPE "public"."enum_pending_votes_issue" AS ENUM('name-taken', 'planning-closed', 'invalid-selection');
  CREATE TYPE "public"."enum_pending_votes_source" AS ENUM('email', 'microsoft', 'google', 'apple');
  CREATE TYPE "public"."enum_keg_items_unit" AS ENUM('keg', 'day');
  CREATE TYPE "public"."enum_list_opt_outs_list" AS ENUM('shopping', 'beer');
  CREATE TYPE "public"."enum_backgrounds_type" AS ENUM('url', 'upload');
  CREATE TYPE "public"."enum_users_role" AS ENUM('superadmin', 'admin', 'user');
  CREATE TYPE "public"."enum_data_requests_type" AS ENUM('access', 'rectification', 'erasure', 'restriction', 'portability', 'objection', 'other');
  CREATE TYPE "public"."enum_data_requests_status" AS ENUM('received', 'in-progress', 'done', 'refused');
  CREATE TABLE "chatas_domains" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"domain" varchar NOT NULL
  );
  
  CREATE TABLE "chatas_destination_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "chatas_photos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"photo_id" integer NOT NULL
  );
  
  CREATE TABLE "chatas_basic_info" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"info" varchar NOT NULL
  );
  
  CREATE TABLE "chatas_amenities" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"available" boolean DEFAULT true
  );
  
  CREATE TABLE "chatas_packing_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"item" varchar NOT NULL
  );
  
  CREATE TABLE "chatas_program" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"description" varchar NOT NULL
  );
  
  CREATE TABLE "chatas_surroundings" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"note" varchar,
  	"category" "enum_chatas_surroundings_category" DEFAULT 'place'
  );
  
  CREATE TABLE "chatas_contact_rules" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"value" varchar NOT NULL
  );
  
  CREATE TABLE "chatas_private_info" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"value" varchar NOT NULL
  );
  
  CREATE TABLE "chatas_custom_tabs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"icon" "enum_chatas_custom_tabs_icon" DEFAULT 'file-text',
  	"content" jsonb NOT NULL
  );
  
  CREATE TABLE "chatas_car_routes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"from" varchar NOT NULL,
  	"duration" varchar NOT NULL,
  	"distance" varchar NOT NULL,
  	"route" varchar NOT NULL
  );
  
  CREATE TABLE "chatas_public_transport_options_riders" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"participant_id" integer NOT NULL
  );
  
  CREATE TABLE "chatas_public_transport_options_connections" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "enum_chatas_public_transport_options_connections_type" NOT NULL,
  	"number" varchar NOT NULL,
  	"from" varchar NOT NULL,
  	"to" varchar NOT NULL,
  	"departure" varchar NOT NULL,
  	"arrival" varchar NOT NULL
  );
  
  CREATE TABLE "chatas_public_transport_options" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"direction" "enum_chatas_public_transport_options_direction" DEFAULT 'tam',
  	"travel_date" timestamp(3) with time zone,
  	"total_duration" varchar,
  	"notes" varchar
  );
  
  CREATE TABLE "chatas_rooms_beds_occupants" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"participant_id" integer,
  	"nights" jsonb
  );
  
  CREATE TABLE "chatas_rooms_beds" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar
  );
  
  CREATE TABLE "chatas_rooms" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"description" varchar,
  	"image_id" integer,
  	"max_sleeping_spaces" numeric DEFAULT 2
  );
  
  CREATE TABLE "chatas_shared_cars_passengers" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"participant_id" integer
  );
  
  CREATE TABLE "chatas_shared_cars_equipment" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar
  );
  
  CREATE TABLE "chatas_shared_cars" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"description" varchar,
  	"seats" numeric,
  	"driver_id" integer,
  	"front_passenger_id" integer
  );
  
  CREATE TABLE "chatas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"settled_at" timestamp(3) with time zone,
  	"name" varchar NOT NULL,
  	"short_name" varchar NOT NULL,
  	"location" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"planning_enabled" boolean DEFAULT false,
  	"planning_intro" varchar,
  	"banker_id" integer,
  	"background_id" integer,
  	"icon_id" integer,
  	"theme_color" varchar DEFAULT '#d97706',
  	"information_enabled" boolean DEFAULT false,
  	"trip_date_from" timestamp(3) with time zone,
  	"trip_date_to" timestamp(3) with time zone,
  	"trip_dates_tentative" boolean DEFAULT false,
  	"trip_planned_nights" numeric,
  	"check_in_time" varchar,
  	"check_out_time" varchar,
  	"destination_name" varchar,
  	"destination_location" varchar,
  	"destination_description" varchar,
  	"destination_lat" numeric,
  	"destination_lng" numeric,
  	"shared_album_url" varchar,
  	"shopping_list_enabled" boolean DEFAULT false,
  	"shopping_closed_at" timestamp(3) with time zone,
  	"beer_list_enabled" boolean DEFAULT false,
  	"beer_tap_days" numeric,
  	"beer_summary_sent_at" timestamp(3) with time zone,
  	"beer_summary_signature" varchar,
  	"beer_closed_tap_days" numeric,
  	"beer_closed_tap_weekend" boolean,
  	"beer_closed_at" timestamp(3) with time zone,
  	"parking" varchar,
  	"bedroom_organization_enabled" boolean DEFAULT false,
  	"advanced_bedroom_mode" boolean DEFAULT false,
  	"shared_cars_enabled" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "participants" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"akuzativ" varchar,
  	"vokativ" varchar,
  	"chata_id" integer NOT NULL,
  	"has_pet" boolean DEFAULT false,
  	"paid_by_id" integer,
  	"account_number" varchar,
  	"iban" varchar,
  	"account_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "expenses_weights" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"participant_id" integer,
  	"weight" numeric
  );
  
  CREATE TABLE "expenses_invitations" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"host_id" integer,
  	"guest_id" integer,
  	"auto" boolean DEFAULT false
  );
  
  CREATE TABLE "expenses_private_settlements" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"participant_id" integer,
  	"settled_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "expenses" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"chata_id" integer NOT NULL,
  	"title" varchar NOT NULL,
  	"amount" numeric NOT NULL,
  	"split_type" "enum_expenses_split_type" DEFAULT 'equal' NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"note" varchar,
  	"authored_by_id" integer,
  	"payer_account_id" integer,
  	"approval_status" "enum_expenses_approval_status" DEFAULT 'approved',
  	"approval_note" varchar,
  	"approval_decided_by_id" integer,
  	"approval_decided_at" timestamp(3) with time zone,
  	"source_list" "enum_expenses_source_list",
  	"is_planned" boolean DEFAULT false,
  	"is_private" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "expenses_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"participants_id" integer,
  	"joint_accounts_id" integer,
  	"expense_attachments_id" integer
  );
  
  CREATE TABLE "prepayments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"chata_id" integer NOT NULL,
  	"amount" numeric NOT NULL,
  	"note" varchar,
  	"type" "enum_prepayments_type" NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "prepayments_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"participants_id" integer,
  	"joint_accounts_id" integer
  );
  
  CREATE TABLE "joint_accounts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"chata_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "joint_accounts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"participants_id" integer
  );
  
  CREATE TABLE "claim_requests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"participant_id" integer NOT NULL,
  	"chata_id" integer,
  	"user_id" integer NOT NULL,
  	"status" "enum_claim_requests_status" DEFAULT 'pending' NOT NULL,
  	"reason" varchar,
  	"decided_by_id" integer,
  	"decided_at" timestamp(3) with time zone,
  	"auto_approved" boolean DEFAULT false,
  	"reminder_sent_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "trip_date_options" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"chata_id" integer NOT NULL,
  	"label" varchar,
  	"date_from" timestamp(3) with time zone NOT NULL,
  	"date_to" timestamp(3) with time zone NOT NULL,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "trip_accommodation_options" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"chata_id" integer NOT NULL,
  	"name" varchar NOT NULL,
  	"location_note" varchar,
  	"url" varchar,
  	"description" varchar,
  	"image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "trip_accommodation_options_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"trip_date_options_id" integer
  );
  
  CREATE TABLE "trip_votes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"participant_id" integer NOT NULL,
  	"chata_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "trip_votes_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"trip_date_options_id" integer,
  	"trip_accommodation_options_id" integer
  );
  
  CREATE TABLE "pending_votes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"chata_id" integer NOT NULL,
  	"user_id" integer NOT NULL,
  	"status" "enum_pending_votes_status" DEFAULT 'pending' NOT NULL,
  	"issue" "enum_pending_votes_issue",
  	"source" "enum_pending_votes_source",
  	"auto_confirm" boolean DEFAULT false,
  	"submission_key" varchar,
  	"confirmed_at" timestamp(3) with time zone,
  	"link_expires_at" timestamp(3) with time zone,
  	"link_used_at" timestamp(3) with time zone,
  	"vote_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "pending_votes_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"trip_date_options_id" integer,
  	"trip_accommodation_options_id" integer
  );
  
  CREATE TABLE "shopping_items" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"chata_id" integer NOT NULL,
  	"title" varchar NOT NULL,
  	"quantity" numeric DEFAULT 1 NOT NULL,
  	"note" varchar,
  	"participant_id" integer,
  	"rohlik_product_id" varchar,
  	"rohlik_name" varchar,
  	"rohlik_price" numeric,
  	"rohlik_amount" varchar,
  	"rohlik_image_url" varchar,
  	"rohlik_url" varchar,
  	"rohlik_in_stock" boolean,
  	"rohlik_checked_at" timestamp(3) with time zone,
  	"authored_by_id" integer,
  	"sent_to_cart_at" timestamp(3) with time zone,
  	"sent_quantity" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "keg_items" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"chata_id" integer NOT NULL,
  	"code" varchar NOT NULL,
  	"quantity" numeric DEFAULT 1 NOT NULL,
  	"note" varchar,
  	"participant_id" integer,
  	"name" varchar,
  	"liters" numeric,
  	"price" numeric,
  	"unit" "enum_keg_items_unit",
  	"kind" varchar,
  	"authored_by_id" integer,
  	"summary_sent_at" timestamp(3) with time zone,
  	"summary_quantity" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "list_opt_outs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"chata_id" integer NOT NULL,
  	"list" "enum_list_opt_outs_list" NOT NULL,
  	"item_id" numeric,
  	"participant_id" integer NOT NULL,
  	"set_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "expense_attachments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar,
  	"prefix" varchar DEFAULT 'expense-attachments',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "backgrounds" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"is_default" boolean DEFAULT false,
  	"type" "enum_backgrounds_type" DEFAULT 'url' NOT NULL,
  	"url" varchar,
  	"image_id" integer,
  	"attribution" varchar,
  	"attribution_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "icons" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"is_default" boolean DEFAULT false,
  	"svg_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"vokativ" varchar,
  	"role" "enum_users_role" DEFAULT 'user' NOT NULL,
  	"last_login_at" timestamp(3) with time zone,
  	"login_token" varchar,
  	"login_token_expires" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "users_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"chatas_id" integer
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "rohlik_connections" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"client_id" varchar,
  	"redirect_uri" varchar,
  	"access_token" varchar,
  	"refresh_token" varchar,
  	"expires_at" timestamp(3) with time zone,
  	"connected_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "data_requests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"subject" varchar NOT NULL,
  	"type" "enum_data_requests_type" NOT NULL,
  	"received_at" timestamp(3) with time zone NOT NULL,
  	"status" "enum_data_requests_status" DEFAULT 'received' NOT NULL,
  	"resolved_at" timestamp(3) with time zone,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"chatas_id" integer,
  	"participants_id" integer,
  	"expenses_id" integer,
  	"prepayments_id" integer,
  	"joint_accounts_id" integer,
  	"claim_requests_id" integer,
  	"trip_date_options_id" integer,
  	"trip_accommodation_options_id" integer,
  	"trip_votes_id" integer,
  	"pending_votes_id" integer,
  	"shopping_items_id" integer,
  	"keg_items_id" integer,
  	"list_opt_outs_id" integer,
  	"expense_attachments_id" integer,
  	"backgrounds_id" integer,
  	"icons_id" integer,
  	"users_id" integer,
  	"media_id" integer,
  	"rohlik_connections_id" integer,
  	"data_requests_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "chatas_domains" ADD CONSTRAINT "chatas_domains_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chatas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chatas_destination_links" ADD CONSTRAINT "chatas_destination_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chatas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chatas_photos" ADD CONSTRAINT "chatas_photos_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "chatas_photos" ADD CONSTRAINT "chatas_photos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chatas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chatas_basic_info" ADD CONSTRAINT "chatas_basic_info_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chatas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chatas_amenities" ADD CONSTRAINT "chatas_amenities_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chatas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chatas_packing_items" ADD CONSTRAINT "chatas_packing_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chatas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chatas_program" ADD CONSTRAINT "chatas_program_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chatas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chatas_surroundings" ADD CONSTRAINT "chatas_surroundings_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chatas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chatas_contact_rules" ADD CONSTRAINT "chatas_contact_rules_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chatas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chatas_private_info" ADD CONSTRAINT "chatas_private_info_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chatas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chatas_custom_tabs" ADD CONSTRAINT "chatas_custom_tabs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chatas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chatas_car_routes" ADD CONSTRAINT "chatas_car_routes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chatas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chatas_public_transport_options_riders" ADD CONSTRAINT "chatas_public_transport_options_riders_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "chatas_public_transport_options_riders" ADD CONSTRAINT "chatas_public_transport_options_riders_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chatas_public_transport_options"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chatas_public_transport_options_connections" ADD CONSTRAINT "chatas_public_transport_options_connections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chatas_public_transport_options"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chatas_public_transport_options" ADD CONSTRAINT "chatas_public_transport_options_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chatas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chatas_rooms_beds_occupants" ADD CONSTRAINT "chatas_rooms_beds_occupants_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "chatas_rooms_beds_occupants" ADD CONSTRAINT "chatas_rooms_beds_occupants_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chatas_rooms_beds"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chatas_rooms_beds" ADD CONSTRAINT "chatas_rooms_beds_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chatas_rooms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chatas_rooms" ADD CONSTRAINT "chatas_rooms_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "chatas_rooms" ADD CONSTRAINT "chatas_rooms_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chatas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chatas_shared_cars_passengers" ADD CONSTRAINT "chatas_shared_cars_passengers_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "chatas_shared_cars_passengers" ADD CONSTRAINT "chatas_shared_cars_passengers_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chatas_shared_cars"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chatas_shared_cars_equipment" ADD CONSTRAINT "chatas_shared_cars_equipment_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chatas_shared_cars"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chatas_shared_cars" ADD CONSTRAINT "chatas_shared_cars_driver_id_participants_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "chatas_shared_cars" ADD CONSTRAINT "chatas_shared_cars_front_passenger_id_participants_id_fk" FOREIGN KEY ("front_passenger_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "chatas_shared_cars" ADD CONSTRAINT "chatas_shared_cars_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."chatas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "chatas" ADD CONSTRAINT "chatas_banker_id_participants_id_fk" FOREIGN KEY ("banker_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "chatas" ADD CONSTRAINT "chatas_background_id_backgrounds_id_fk" FOREIGN KEY ("background_id") REFERENCES "public"."backgrounds"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "chatas" ADD CONSTRAINT "chatas_icon_id_icons_id_fk" FOREIGN KEY ("icon_id") REFERENCES "public"."icons"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "participants" ADD CONSTRAINT "participants_chata_id_chatas_id_fk" FOREIGN KEY ("chata_id") REFERENCES "public"."chatas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "participants" ADD CONSTRAINT "participants_paid_by_id_participants_id_fk" FOREIGN KEY ("paid_by_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "participants" ADD CONSTRAINT "participants_account_id_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "expenses_weights" ADD CONSTRAINT "expenses_weights_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "expenses_weights" ADD CONSTRAINT "expenses_weights_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "expenses_invitations" ADD CONSTRAINT "expenses_invitations_host_id_participants_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "expenses_invitations" ADD CONSTRAINT "expenses_invitations_guest_id_participants_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "expenses_invitations" ADD CONSTRAINT "expenses_invitations_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "expenses_private_settlements" ADD CONSTRAINT "expenses_private_settlements_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "expenses_private_settlements" ADD CONSTRAINT "expenses_private_settlements_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_chata_id_chatas_id_fk" FOREIGN KEY ("chata_id") REFERENCES "public"."chatas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_authored_by_id_users_id_fk" FOREIGN KEY ("authored_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payer_account_id_users_id_fk" FOREIGN KEY ("payer_account_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approval_decided_by_id_users_id_fk" FOREIGN KEY ("approval_decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "expenses_rels" ADD CONSTRAINT "expenses_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "expenses_rels" ADD CONSTRAINT "expenses_rels_participants_fk" FOREIGN KEY ("participants_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "expenses_rels" ADD CONSTRAINT "expenses_rels_joint_accounts_fk" FOREIGN KEY ("joint_accounts_id") REFERENCES "public"."joint_accounts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "expenses_rels" ADD CONSTRAINT "expenses_rels_expense_attachments_fk" FOREIGN KEY ("expense_attachments_id") REFERENCES "public"."expense_attachments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "prepayments" ADD CONSTRAINT "prepayments_chata_id_chatas_id_fk" FOREIGN KEY ("chata_id") REFERENCES "public"."chatas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "prepayments_rels" ADD CONSTRAINT "prepayments_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."prepayments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "prepayments_rels" ADD CONSTRAINT "prepayments_rels_participants_fk" FOREIGN KEY ("participants_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "prepayments_rels" ADD CONSTRAINT "prepayments_rels_joint_accounts_fk" FOREIGN KEY ("joint_accounts_id") REFERENCES "public"."joint_accounts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "joint_accounts" ADD CONSTRAINT "joint_accounts_chata_id_chatas_id_fk" FOREIGN KEY ("chata_id") REFERENCES "public"."chatas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "joint_accounts_rels" ADD CONSTRAINT "joint_accounts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."joint_accounts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "joint_accounts_rels" ADD CONSTRAINT "joint_accounts_rels_participants_fk" FOREIGN KEY ("participants_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "claim_requests" ADD CONSTRAINT "claim_requests_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "claim_requests" ADD CONSTRAINT "claim_requests_chata_id_chatas_id_fk" FOREIGN KEY ("chata_id") REFERENCES "public"."chatas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "claim_requests" ADD CONSTRAINT "claim_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "claim_requests" ADD CONSTRAINT "claim_requests_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "trip_date_options" ADD CONSTRAINT "trip_date_options_chata_id_chatas_id_fk" FOREIGN KEY ("chata_id") REFERENCES "public"."chatas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "trip_accommodation_options" ADD CONSTRAINT "trip_accommodation_options_chata_id_chatas_id_fk" FOREIGN KEY ("chata_id") REFERENCES "public"."chatas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "trip_accommodation_options" ADD CONSTRAINT "trip_accommodation_options_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "trip_accommodation_options_rels" ADD CONSTRAINT "trip_accommodation_options_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."trip_accommodation_options"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "trip_accommodation_options_rels" ADD CONSTRAINT "trip_accommodation_options_rels_trip_date_options_fk" FOREIGN KEY ("trip_date_options_id") REFERENCES "public"."trip_date_options"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "trip_votes" ADD CONSTRAINT "trip_votes_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "trip_votes" ADD CONSTRAINT "trip_votes_chata_id_chatas_id_fk" FOREIGN KEY ("chata_id") REFERENCES "public"."chatas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "trip_votes_rels" ADD CONSTRAINT "trip_votes_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."trip_votes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "trip_votes_rels" ADD CONSTRAINT "trip_votes_rels_trip_date_options_fk" FOREIGN KEY ("trip_date_options_id") REFERENCES "public"."trip_date_options"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "trip_votes_rels" ADD CONSTRAINT "trip_votes_rels_trip_accommodation_options_fk" FOREIGN KEY ("trip_accommodation_options_id") REFERENCES "public"."trip_accommodation_options"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pending_votes" ADD CONSTRAINT "pending_votes_chata_id_chatas_id_fk" FOREIGN KEY ("chata_id") REFERENCES "public"."chatas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pending_votes" ADD CONSTRAINT "pending_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pending_votes" ADD CONSTRAINT "pending_votes_vote_id_trip_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "public"."trip_votes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pending_votes_rels" ADD CONSTRAINT "pending_votes_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pending_votes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pending_votes_rels" ADD CONSTRAINT "pending_votes_rels_trip_date_options_fk" FOREIGN KEY ("trip_date_options_id") REFERENCES "public"."trip_date_options"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pending_votes_rels" ADD CONSTRAINT "pending_votes_rels_trip_accommodation_options_fk" FOREIGN KEY ("trip_accommodation_options_id") REFERENCES "public"."trip_accommodation_options"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_chata_id_chatas_id_fk" FOREIGN KEY ("chata_id") REFERENCES "public"."chatas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_authored_by_id_users_id_fk" FOREIGN KEY ("authored_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "keg_items" ADD CONSTRAINT "keg_items_chata_id_chatas_id_fk" FOREIGN KEY ("chata_id") REFERENCES "public"."chatas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "keg_items" ADD CONSTRAINT "keg_items_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "keg_items" ADD CONSTRAINT "keg_items_authored_by_id_users_id_fk" FOREIGN KEY ("authored_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "list_opt_outs" ADD CONSTRAINT "list_opt_outs_chata_id_chatas_id_fk" FOREIGN KEY ("chata_id") REFERENCES "public"."chatas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "list_opt_outs" ADD CONSTRAINT "list_opt_outs_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "list_opt_outs" ADD CONSTRAINT "list_opt_outs_set_by_id_users_id_fk" FOREIGN KEY ("set_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "backgrounds" ADD CONSTRAINT "backgrounds_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "icons" ADD CONSTRAINT "icons_svg_id_media_id_fk" FOREIGN KEY ("svg_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_chatas_fk" FOREIGN KEY ("chatas_id") REFERENCES "public"."chatas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "rohlik_connections" ADD CONSTRAINT "rohlik_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_chatas_fk" FOREIGN KEY ("chatas_id") REFERENCES "public"."chatas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_participants_fk" FOREIGN KEY ("participants_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_expenses_fk" FOREIGN KEY ("expenses_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_prepayments_fk" FOREIGN KEY ("prepayments_id") REFERENCES "public"."prepayments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_joint_accounts_fk" FOREIGN KEY ("joint_accounts_id") REFERENCES "public"."joint_accounts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_claim_requests_fk" FOREIGN KEY ("claim_requests_id") REFERENCES "public"."claim_requests"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trip_date_options_fk" FOREIGN KEY ("trip_date_options_id") REFERENCES "public"."trip_date_options"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trip_accommodation_options_fk" FOREIGN KEY ("trip_accommodation_options_id") REFERENCES "public"."trip_accommodation_options"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trip_votes_fk" FOREIGN KEY ("trip_votes_id") REFERENCES "public"."trip_votes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pending_votes_fk" FOREIGN KEY ("pending_votes_id") REFERENCES "public"."pending_votes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_shopping_items_fk" FOREIGN KEY ("shopping_items_id") REFERENCES "public"."shopping_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_keg_items_fk" FOREIGN KEY ("keg_items_id") REFERENCES "public"."keg_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_list_opt_outs_fk" FOREIGN KEY ("list_opt_outs_id") REFERENCES "public"."list_opt_outs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_expense_attachments_fk" FOREIGN KEY ("expense_attachments_id") REFERENCES "public"."expense_attachments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_backgrounds_fk" FOREIGN KEY ("backgrounds_id") REFERENCES "public"."backgrounds"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_icons_fk" FOREIGN KEY ("icons_id") REFERENCES "public"."icons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_rohlik_connections_fk" FOREIGN KEY ("rohlik_connections_id") REFERENCES "public"."rohlik_connections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_data_requests_fk" FOREIGN KEY ("data_requests_id") REFERENCES "public"."data_requests"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "chatas_domains_order_idx" ON "chatas_domains" USING btree ("_order");
  CREATE INDEX "chatas_domains_parent_id_idx" ON "chatas_domains" USING btree ("_parent_id");
  CREATE INDEX "chatas_destination_links_order_idx" ON "chatas_destination_links" USING btree ("_order");
  CREATE INDEX "chatas_destination_links_parent_id_idx" ON "chatas_destination_links" USING btree ("_parent_id");
  CREATE INDEX "chatas_photos_order_idx" ON "chatas_photos" USING btree ("_order");
  CREATE INDEX "chatas_photos_parent_id_idx" ON "chatas_photos" USING btree ("_parent_id");
  CREATE INDEX "chatas_photos_photo_idx" ON "chatas_photos" USING btree ("photo_id");
  CREATE INDEX "chatas_basic_info_order_idx" ON "chatas_basic_info" USING btree ("_order");
  CREATE INDEX "chatas_basic_info_parent_id_idx" ON "chatas_basic_info" USING btree ("_parent_id");
  CREATE INDEX "chatas_amenities_order_idx" ON "chatas_amenities" USING btree ("_order");
  CREATE INDEX "chatas_amenities_parent_id_idx" ON "chatas_amenities" USING btree ("_parent_id");
  CREATE INDEX "chatas_packing_items_order_idx" ON "chatas_packing_items" USING btree ("_order");
  CREATE INDEX "chatas_packing_items_parent_id_idx" ON "chatas_packing_items" USING btree ("_parent_id");
  CREATE INDEX "chatas_program_order_idx" ON "chatas_program" USING btree ("_order");
  CREATE INDEX "chatas_program_parent_id_idx" ON "chatas_program" USING btree ("_parent_id");
  CREATE INDEX "chatas_surroundings_order_idx" ON "chatas_surroundings" USING btree ("_order");
  CREATE INDEX "chatas_surroundings_parent_id_idx" ON "chatas_surroundings" USING btree ("_parent_id");
  CREATE INDEX "chatas_contact_rules_order_idx" ON "chatas_contact_rules" USING btree ("_order");
  CREATE INDEX "chatas_contact_rules_parent_id_idx" ON "chatas_contact_rules" USING btree ("_parent_id");
  CREATE INDEX "chatas_private_info_order_idx" ON "chatas_private_info" USING btree ("_order");
  CREATE INDEX "chatas_private_info_parent_id_idx" ON "chatas_private_info" USING btree ("_parent_id");
  CREATE INDEX "chatas_custom_tabs_order_idx" ON "chatas_custom_tabs" USING btree ("_order");
  CREATE INDEX "chatas_custom_tabs_parent_id_idx" ON "chatas_custom_tabs" USING btree ("_parent_id");
  CREATE INDEX "chatas_car_routes_order_idx" ON "chatas_car_routes" USING btree ("_order");
  CREATE INDEX "chatas_car_routes_parent_id_idx" ON "chatas_car_routes" USING btree ("_parent_id");
  CREATE INDEX "chatas_public_transport_options_riders_order_idx" ON "chatas_public_transport_options_riders" USING btree ("_order");
  CREATE INDEX "chatas_public_transport_options_riders_parent_id_idx" ON "chatas_public_transport_options_riders" USING btree ("_parent_id");
  CREATE INDEX "chatas_public_transport_options_riders_participant_idx" ON "chatas_public_transport_options_riders" USING btree ("participant_id");
  CREATE INDEX "chatas_public_transport_options_connections_order_idx" ON "chatas_public_transport_options_connections" USING btree ("_order");
  CREATE INDEX "chatas_public_transport_options_connections_parent_id_idx" ON "chatas_public_transport_options_connections" USING btree ("_parent_id");
  CREATE INDEX "chatas_public_transport_options_order_idx" ON "chatas_public_transport_options" USING btree ("_order");
  CREATE INDEX "chatas_public_transport_options_parent_id_idx" ON "chatas_public_transport_options" USING btree ("_parent_id");
  CREATE INDEX "chatas_rooms_beds_occupants_order_idx" ON "chatas_rooms_beds_occupants" USING btree ("_order");
  CREATE INDEX "chatas_rooms_beds_occupants_parent_id_idx" ON "chatas_rooms_beds_occupants" USING btree ("_parent_id");
  CREATE INDEX "chatas_rooms_beds_occupants_participant_idx" ON "chatas_rooms_beds_occupants" USING btree ("participant_id");
  CREATE INDEX "chatas_rooms_beds_order_idx" ON "chatas_rooms_beds" USING btree ("_order");
  CREATE INDEX "chatas_rooms_beds_parent_id_idx" ON "chatas_rooms_beds" USING btree ("_parent_id");
  CREATE INDEX "chatas_rooms_order_idx" ON "chatas_rooms" USING btree ("_order");
  CREATE INDEX "chatas_rooms_parent_id_idx" ON "chatas_rooms" USING btree ("_parent_id");
  CREATE INDEX "chatas_rooms_image_idx" ON "chatas_rooms" USING btree ("image_id");
  CREATE INDEX "chatas_shared_cars_passengers_order_idx" ON "chatas_shared_cars_passengers" USING btree ("_order");
  CREATE INDEX "chatas_shared_cars_passengers_parent_id_idx" ON "chatas_shared_cars_passengers" USING btree ("_parent_id");
  CREATE INDEX "chatas_shared_cars_passengers_participant_idx" ON "chatas_shared_cars_passengers" USING btree ("participant_id");
  CREATE INDEX "chatas_shared_cars_equipment_order_idx" ON "chatas_shared_cars_equipment" USING btree ("_order");
  CREATE INDEX "chatas_shared_cars_equipment_parent_id_idx" ON "chatas_shared_cars_equipment" USING btree ("_parent_id");
  CREATE INDEX "chatas_shared_cars_order_idx" ON "chatas_shared_cars" USING btree ("_order");
  CREATE INDEX "chatas_shared_cars_parent_id_idx" ON "chatas_shared_cars" USING btree ("_parent_id");
  CREATE INDEX "chatas_shared_cars_driver_idx" ON "chatas_shared_cars" USING btree ("driver_id");
  CREATE INDEX "chatas_shared_cars_front_passenger_idx" ON "chatas_shared_cars" USING btree ("front_passenger_id");
  CREATE UNIQUE INDEX "chatas_slug_idx" ON "chatas" USING btree ("slug");
  CREATE INDEX "chatas_banker_idx" ON "chatas" USING btree ("banker_id");
  CREATE INDEX "chatas_background_idx" ON "chatas" USING btree ("background_id");
  CREATE INDEX "chatas_icon_idx" ON "chatas" USING btree ("icon_id");
  CREATE INDEX "chatas_updated_at_idx" ON "chatas" USING btree ("updated_at");
  CREATE INDEX "chatas_created_at_idx" ON "chatas" USING btree ("created_at");
  CREATE INDEX "participants_chata_idx" ON "participants" USING btree ("chata_id");
  CREATE INDEX "participants_paid_by_idx" ON "participants" USING btree ("paid_by_id");
  CREATE INDEX "participants_account_idx" ON "participants" USING btree ("account_id");
  CREATE INDEX "participants_updated_at_idx" ON "participants" USING btree ("updated_at");
  CREATE INDEX "participants_created_at_idx" ON "participants" USING btree ("created_at");
  CREATE INDEX "expenses_weights_order_idx" ON "expenses_weights" USING btree ("_order");
  CREATE INDEX "expenses_weights_parent_id_idx" ON "expenses_weights" USING btree ("_parent_id");
  CREATE INDEX "expenses_weights_participant_idx" ON "expenses_weights" USING btree ("participant_id");
  CREATE INDEX "expenses_invitations_order_idx" ON "expenses_invitations" USING btree ("_order");
  CREATE INDEX "expenses_invitations_parent_id_idx" ON "expenses_invitations" USING btree ("_parent_id");
  CREATE INDEX "expenses_invitations_host_idx" ON "expenses_invitations" USING btree ("host_id");
  CREATE INDEX "expenses_invitations_guest_idx" ON "expenses_invitations" USING btree ("guest_id");
  CREATE INDEX "expenses_private_settlements_order_idx" ON "expenses_private_settlements" USING btree ("_order");
  CREATE INDEX "expenses_private_settlements_parent_id_idx" ON "expenses_private_settlements" USING btree ("_parent_id");
  CREATE INDEX "expenses_private_settlements_participant_idx" ON "expenses_private_settlements" USING btree ("participant_id");
  CREATE INDEX "expenses_chata_idx" ON "expenses" USING btree ("chata_id");
  CREATE INDEX "expenses_authored_by_idx" ON "expenses" USING btree ("authored_by_id");
  CREATE INDEX "expenses_payer_account_idx" ON "expenses" USING btree ("payer_account_id");
  CREATE INDEX "expenses_approval_decided_by_idx" ON "expenses" USING btree ("approval_decided_by_id");
  CREATE INDEX "expenses_is_private_idx" ON "expenses" USING btree ("is_private");
  CREATE INDEX "expenses_updated_at_idx" ON "expenses" USING btree ("updated_at");
  CREATE INDEX "expenses_rels_order_idx" ON "expenses_rels" USING btree ("order");
  CREATE INDEX "expenses_rels_parent_idx" ON "expenses_rels" USING btree ("parent_id");
  CREATE INDEX "expenses_rels_path_idx" ON "expenses_rels" USING btree ("path");
  CREATE INDEX "expenses_rels_participants_id_idx" ON "expenses_rels" USING btree ("participants_id");
  CREATE INDEX "expenses_rels_joint_accounts_id_idx" ON "expenses_rels" USING btree ("joint_accounts_id");
  CREATE INDEX "expenses_rels_expense_attachments_id_idx" ON "expenses_rels" USING btree ("expense_attachments_id");
  CREATE INDEX "prepayments_chata_idx" ON "prepayments" USING btree ("chata_id");
  CREATE INDEX "prepayments_updated_at_idx" ON "prepayments" USING btree ("updated_at");
  CREATE INDEX "prepayments_rels_order_idx" ON "prepayments_rels" USING btree ("order");
  CREATE INDEX "prepayments_rels_parent_idx" ON "prepayments_rels" USING btree ("parent_id");
  CREATE INDEX "prepayments_rels_path_idx" ON "prepayments_rels" USING btree ("path");
  CREATE INDEX "prepayments_rels_participants_id_idx" ON "prepayments_rels" USING btree ("participants_id");
  CREATE INDEX "prepayments_rels_joint_accounts_id_idx" ON "prepayments_rels" USING btree ("joint_accounts_id");
  CREATE INDEX "joint_accounts_chata_idx" ON "joint_accounts" USING btree ("chata_id");
  CREATE INDEX "joint_accounts_updated_at_idx" ON "joint_accounts" USING btree ("updated_at");
  CREATE INDEX "joint_accounts_created_at_idx" ON "joint_accounts" USING btree ("created_at");
  CREATE INDEX "joint_accounts_rels_order_idx" ON "joint_accounts_rels" USING btree ("order");
  CREATE INDEX "joint_accounts_rels_parent_idx" ON "joint_accounts_rels" USING btree ("parent_id");
  CREATE INDEX "joint_accounts_rels_path_idx" ON "joint_accounts_rels" USING btree ("path");
  CREATE INDEX "joint_accounts_rels_participants_id_idx" ON "joint_accounts_rels" USING btree ("participants_id");
  CREATE INDEX "claim_requests_participant_idx" ON "claim_requests" USING btree ("participant_id");
  CREATE INDEX "claim_requests_chata_idx" ON "claim_requests" USING btree ("chata_id");
  CREATE INDEX "claim_requests_user_idx" ON "claim_requests" USING btree ("user_id");
  CREATE INDEX "claim_requests_decided_by_idx" ON "claim_requests" USING btree ("decided_by_id");
  CREATE INDEX "claim_requests_updated_at_idx" ON "claim_requests" USING btree ("updated_at");
  CREATE INDEX "claim_requests_created_at_idx" ON "claim_requests" USING btree ("created_at");
  CREATE INDEX "trip_date_options_chata_idx" ON "trip_date_options" USING btree ("chata_id");
  CREATE INDEX "trip_date_options_updated_at_idx" ON "trip_date_options" USING btree ("updated_at");
  CREATE INDEX "trip_date_options_created_at_idx" ON "trip_date_options" USING btree ("created_at");
  CREATE INDEX "trip_accommodation_options_chata_idx" ON "trip_accommodation_options" USING btree ("chata_id");
  CREATE INDEX "trip_accommodation_options_image_idx" ON "trip_accommodation_options" USING btree ("image_id");
  CREATE INDEX "trip_accommodation_options_updated_at_idx" ON "trip_accommodation_options" USING btree ("updated_at");
  CREATE INDEX "trip_accommodation_options_created_at_idx" ON "trip_accommodation_options" USING btree ("created_at");
  CREATE INDEX "trip_accommodation_options_rels_order_idx" ON "trip_accommodation_options_rels" USING btree ("order");
  CREATE INDEX "trip_accommodation_options_rels_parent_idx" ON "trip_accommodation_options_rels" USING btree ("parent_id");
  CREATE INDEX "trip_accommodation_options_rels_path_idx" ON "trip_accommodation_options_rels" USING btree ("path");
  CREATE INDEX "trip_accommodation_options_rels_trip_date_options_id_idx" ON "trip_accommodation_options_rels" USING btree ("trip_date_options_id");
  CREATE INDEX "trip_votes_participant_idx" ON "trip_votes" USING btree ("participant_id");
  CREATE INDEX "trip_votes_chata_idx" ON "trip_votes" USING btree ("chata_id");
  CREATE INDEX "trip_votes_updated_at_idx" ON "trip_votes" USING btree ("updated_at");
  CREATE INDEX "trip_votes_created_at_idx" ON "trip_votes" USING btree ("created_at");
  CREATE INDEX "trip_votes_rels_order_idx" ON "trip_votes_rels" USING btree ("order");
  CREATE INDEX "trip_votes_rels_parent_idx" ON "trip_votes_rels" USING btree ("parent_id");
  CREATE INDEX "trip_votes_rels_path_idx" ON "trip_votes_rels" USING btree ("path");
  CREATE INDEX "trip_votes_rels_trip_date_options_id_idx" ON "trip_votes_rels" USING btree ("trip_date_options_id");
  CREATE INDEX "trip_votes_rels_trip_accommodation_options_id_idx" ON "trip_votes_rels" USING btree ("trip_accommodation_options_id");
  CREATE INDEX "pending_votes_chata_idx" ON "pending_votes" USING btree ("chata_id");
  CREATE INDEX "pending_votes_user_idx" ON "pending_votes" USING btree ("user_id");
  CREATE INDEX "pending_votes_status_idx" ON "pending_votes" USING btree ("status");
  CREATE INDEX "pending_votes_vote_idx" ON "pending_votes" USING btree ("vote_id");
  CREATE INDEX "pending_votes_updated_at_idx" ON "pending_votes" USING btree ("updated_at");
  CREATE INDEX "pending_votes_created_at_idx" ON "pending_votes" USING btree ("created_at");
  CREATE INDEX "pending_votes_rels_order_idx" ON "pending_votes_rels" USING btree ("order");
  CREATE INDEX "pending_votes_rels_parent_idx" ON "pending_votes_rels" USING btree ("parent_id");
  CREATE INDEX "pending_votes_rels_path_idx" ON "pending_votes_rels" USING btree ("path");
  CREATE INDEX "pending_votes_rels_trip_date_options_id_idx" ON "pending_votes_rels" USING btree ("trip_date_options_id");
  CREATE INDEX "pending_votes_rels_trip_accommodation_options_id_idx" ON "pending_votes_rels" USING btree ("trip_accommodation_options_id");
  CREATE INDEX "shopping_items_chata_idx" ON "shopping_items" USING btree ("chata_id");
  CREATE INDEX "shopping_items_participant_idx" ON "shopping_items" USING btree ("participant_id");
  CREATE INDEX "shopping_items_authored_by_idx" ON "shopping_items" USING btree ("authored_by_id");
  CREATE INDEX "shopping_items_updated_at_idx" ON "shopping_items" USING btree ("updated_at");
  CREATE INDEX "shopping_items_created_at_idx" ON "shopping_items" USING btree ("created_at");
  CREATE INDEX "keg_items_chata_idx" ON "keg_items" USING btree ("chata_id");
  CREATE INDEX "keg_items_participant_idx" ON "keg_items" USING btree ("participant_id");
  CREATE INDEX "keg_items_authored_by_idx" ON "keg_items" USING btree ("authored_by_id");
  CREATE INDEX "keg_items_updated_at_idx" ON "keg_items" USING btree ("updated_at");
  CREATE INDEX "keg_items_created_at_idx" ON "keg_items" USING btree ("created_at");
  CREATE INDEX "list_opt_outs_chata_idx" ON "list_opt_outs" USING btree ("chata_id");
  CREATE INDEX "list_opt_outs_participant_idx" ON "list_opt_outs" USING btree ("participant_id");
  CREATE INDEX "list_opt_outs_set_by_idx" ON "list_opt_outs" USING btree ("set_by_id");
  CREATE INDEX "list_opt_outs_updated_at_idx" ON "list_opt_outs" USING btree ("updated_at");
  CREATE INDEX "list_opt_outs_created_at_idx" ON "list_opt_outs" USING btree ("created_at");
  CREATE INDEX "expense_attachments_updated_at_idx" ON "expense_attachments" USING btree ("updated_at");
  CREATE INDEX "expense_attachments_created_at_idx" ON "expense_attachments" USING btree ("created_at");
  CREATE UNIQUE INDEX "expense_attachments_filename_idx" ON "expense_attachments" USING btree ("filename");
  CREATE INDEX "backgrounds_image_idx" ON "backgrounds" USING btree ("image_id");
  CREATE INDEX "backgrounds_updated_at_idx" ON "backgrounds" USING btree ("updated_at");
  CREATE INDEX "backgrounds_created_at_idx" ON "backgrounds" USING btree ("created_at");
  CREATE INDEX "icons_svg_idx" ON "icons" USING btree ("svg_id");
  CREATE INDEX "icons_updated_at_idx" ON "icons" USING btree ("updated_at");
  CREATE INDEX "icons_created_at_idx" ON "icons" USING btree ("created_at");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "users_rels_order_idx" ON "users_rels" USING btree ("order");
  CREATE INDEX "users_rels_parent_idx" ON "users_rels" USING btree ("parent_id");
  CREATE INDEX "users_rels_path_idx" ON "users_rels" USING btree ("path");
  CREATE INDEX "users_rels_chatas_id_idx" ON "users_rels" USING btree ("chatas_id");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE UNIQUE INDEX "rohlik_connections_user_idx" ON "rohlik_connections" USING btree ("user_id");
  CREATE INDEX "rohlik_connections_updated_at_idx" ON "rohlik_connections" USING btree ("updated_at");
  CREATE INDEX "rohlik_connections_created_at_idx" ON "rohlik_connections" USING btree ("created_at");
  CREATE INDEX "data_requests_updated_at_idx" ON "data_requests" USING btree ("updated_at");
  CREATE INDEX "data_requests_created_at_idx" ON "data_requests" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_chatas_id_idx" ON "payload_locked_documents_rels" USING btree ("chatas_id");
  CREATE INDEX "payload_locked_documents_rels_participants_id_idx" ON "payload_locked_documents_rels" USING btree ("participants_id");
  CREATE INDEX "payload_locked_documents_rels_expenses_id_idx" ON "payload_locked_documents_rels" USING btree ("expenses_id");
  CREATE INDEX "payload_locked_documents_rels_prepayments_id_idx" ON "payload_locked_documents_rels" USING btree ("prepayments_id");
  CREATE INDEX "payload_locked_documents_rels_joint_accounts_id_idx" ON "payload_locked_documents_rels" USING btree ("joint_accounts_id");
  CREATE INDEX "payload_locked_documents_rels_claim_requests_id_idx" ON "payload_locked_documents_rels" USING btree ("claim_requests_id");
  CREATE INDEX "payload_locked_documents_rels_trip_date_options_id_idx" ON "payload_locked_documents_rels" USING btree ("trip_date_options_id");
  CREATE INDEX "payload_locked_documents_rels_trip_accommodation_options_idx" ON "payload_locked_documents_rels" USING btree ("trip_accommodation_options_id");
  CREATE INDEX "payload_locked_documents_rels_trip_votes_id_idx" ON "payload_locked_documents_rels" USING btree ("trip_votes_id");
  CREATE INDEX "payload_locked_documents_rels_pending_votes_id_idx" ON "payload_locked_documents_rels" USING btree ("pending_votes_id");
  CREATE INDEX "payload_locked_documents_rels_shopping_items_id_idx" ON "payload_locked_documents_rels" USING btree ("shopping_items_id");
  CREATE INDEX "payload_locked_documents_rels_keg_items_id_idx" ON "payload_locked_documents_rels" USING btree ("keg_items_id");
  CREATE INDEX "payload_locked_documents_rels_list_opt_outs_id_idx" ON "payload_locked_documents_rels" USING btree ("list_opt_outs_id");
  CREATE INDEX "payload_locked_documents_rels_expense_attachments_id_idx" ON "payload_locked_documents_rels" USING btree ("expense_attachments_id");
  CREATE INDEX "payload_locked_documents_rels_backgrounds_id_idx" ON "payload_locked_documents_rels" USING btree ("backgrounds_id");
  CREATE INDEX "payload_locked_documents_rels_icons_id_idx" ON "payload_locked_documents_rels" USING btree ("icons_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_rohlik_connections_id_idx" ON "payload_locked_documents_rels" USING btree ("rohlik_connections_id");
  CREATE INDEX "payload_locked_documents_rels_data_requests_id_idx" ON "payload_locked_documents_rels" USING btree ("data_requests_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "chatas_domains" CASCADE;
  DROP TABLE "chatas_destination_links" CASCADE;
  DROP TABLE "chatas_photos" CASCADE;
  DROP TABLE "chatas_basic_info" CASCADE;
  DROP TABLE "chatas_amenities" CASCADE;
  DROP TABLE "chatas_packing_items" CASCADE;
  DROP TABLE "chatas_program" CASCADE;
  DROP TABLE "chatas_surroundings" CASCADE;
  DROP TABLE "chatas_contact_rules" CASCADE;
  DROP TABLE "chatas_private_info" CASCADE;
  DROP TABLE "chatas_custom_tabs" CASCADE;
  DROP TABLE "chatas_car_routes" CASCADE;
  DROP TABLE "chatas_public_transport_options_riders" CASCADE;
  DROP TABLE "chatas_public_transport_options_connections" CASCADE;
  DROP TABLE "chatas_public_transport_options" CASCADE;
  DROP TABLE "chatas_rooms_beds_occupants" CASCADE;
  DROP TABLE "chatas_rooms_beds" CASCADE;
  DROP TABLE "chatas_rooms" CASCADE;
  DROP TABLE "chatas_shared_cars_passengers" CASCADE;
  DROP TABLE "chatas_shared_cars_equipment" CASCADE;
  DROP TABLE "chatas_shared_cars" CASCADE;
  DROP TABLE "chatas" CASCADE;
  DROP TABLE "participants" CASCADE;
  DROP TABLE "expenses_weights" CASCADE;
  DROP TABLE "expenses_invitations" CASCADE;
  DROP TABLE "expenses_private_settlements" CASCADE;
  DROP TABLE "expenses" CASCADE;
  DROP TABLE "expenses_rels" CASCADE;
  DROP TABLE "prepayments" CASCADE;
  DROP TABLE "prepayments_rels" CASCADE;
  DROP TABLE "joint_accounts" CASCADE;
  DROP TABLE "joint_accounts_rels" CASCADE;
  DROP TABLE "claim_requests" CASCADE;
  DROP TABLE "trip_date_options" CASCADE;
  DROP TABLE "trip_accommodation_options" CASCADE;
  DROP TABLE "trip_accommodation_options_rels" CASCADE;
  DROP TABLE "trip_votes" CASCADE;
  DROP TABLE "trip_votes_rels" CASCADE;
  DROP TABLE "pending_votes" CASCADE;
  DROP TABLE "pending_votes_rels" CASCADE;
  DROP TABLE "shopping_items" CASCADE;
  DROP TABLE "keg_items" CASCADE;
  DROP TABLE "list_opt_outs" CASCADE;
  DROP TABLE "expense_attachments" CASCADE;
  DROP TABLE "backgrounds" CASCADE;
  DROP TABLE "icons" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "users_rels" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "rohlik_connections" CASCADE;
  DROP TABLE "data_requests" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_chatas_surroundings_category";
  DROP TYPE "public"."enum_chatas_custom_tabs_icon";
  DROP TYPE "public"."enum_chatas_public_transport_options_connections_type";
  DROP TYPE "public"."enum_chatas_public_transport_options_direction";
  DROP TYPE "public"."enum_expenses_split_type";
  DROP TYPE "public"."enum_expenses_approval_status";
  DROP TYPE "public"."enum_expenses_source_list";
  DROP TYPE "public"."enum_prepayments_type";
  DROP TYPE "public"."enum_claim_requests_status";
  DROP TYPE "public"."enum_pending_votes_status";
  DROP TYPE "public"."enum_pending_votes_issue";
  DROP TYPE "public"."enum_pending_votes_source";
  DROP TYPE "public"."enum_keg_items_unit";
  DROP TYPE "public"."enum_list_opt_outs_list";
  DROP TYPE "public"."enum_backgrounds_type";
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_data_requests_type";
  DROP TYPE "public"."enum_data_requests_status";`)
}
