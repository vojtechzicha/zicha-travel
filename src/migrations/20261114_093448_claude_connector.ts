import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_mcp_tokens_kind" AS ENUM('code', 'access', 'refresh');
  CREATE TABLE "mcp_clients" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_name" varchar NOT NULL,
  	"redirect_uris" jsonb NOT NULL,
  	"token_endpoint_auth_method" varchar NOT NULL,
  	"grant_types" jsonb NOT NULL,
  	"client_secret_hash" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "mcp_grants" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"client_id" integer,
  	"client_name" varchar NOT NULL,
  	"scopes" jsonb NOT NULL,
  	"last_used_at" timestamp(3) with time zone,
  	"revoked_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "mcp_tokens" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"token_hash" varchar NOT NULL,
  	"kind" "enum_mcp_tokens_kind" NOT NULL,
  	"client_id" integer NOT NULL,
  	"user_id" integer,
  	"grant_id" integer,
  	"client_name" varchar,
  	"scopes" jsonb NOT NULL,
  	"resource" varchar,
  	"redirect_uri" varchar,
  	"code_challenge" varchar,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"used_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "mcp_audit" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"grant_id" integer,
  	"client_name" varchar,
  	"tool" varchar NOT NULL,
  	"action" varchar NOT NULL,
  	"chata" numeric,
  	"target_collection" varchar,
  	"document_id" varchar,
  	"request" jsonb,
  	"before" jsonb,
  	"after" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "mcp_clients_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "mcp_grants_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "mcp_tokens_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "mcp_audit_id" integer;
  ALTER TABLE "mcp_grants" ADD CONSTRAINT "mcp_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "mcp_grants" ADD CONSTRAINT "mcp_grants_client_id_mcp_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_client_id_mcp_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_grant_id_mcp_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."mcp_grants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "mcp_audit" ADD CONSTRAINT "mcp_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "mcp_audit" ADD CONSTRAINT "mcp_audit_grant_id_mcp_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."mcp_grants"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "mcp_clients_updated_at_idx" ON "mcp_clients" USING btree ("updated_at");
  CREATE INDEX "mcp_clients_created_at_idx" ON "mcp_clients" USING btree ("created_at");
  CREATE INDEX "mcp_grants_user_idx" ON "mcp_grants" USING btree ("user_id");
  CREATE INDEX "mcp_grants_client_idx" ON "mcp_grants" USING btree ("client_id");
  CREATE INDEX "mcp_grants_revoked_at_idx" ON "mcp_grants" USING btree ("revoked_at");
  CREATE INDEX "mcp_grants_updated_at_idx" ON "mcp_grants" USING btree ("updated_at");
  CREATE INDEX "mcp_grants_created_at_idx" ON "mcp_grants" USING btree ("created_at");
  CREATE UNIQUE INDEX "mcp_tokens_token_hash_idx" ON "mcp_tokens" USING btree ("token_hash");
  CREATE INDEX "mcp_tokens_client_idx" ON "mcp_tokens" USING btree ("client_id");
  CREATE INDEX "mcp_tokens_user_idx" ON "mcp_tokens" USING btree ("user_id");
  CREATE INDEX "mcp_tokens_grant_idx" ON "mcp_tokens" USING btree ("grant_id");
  CREATE INDEX "mcp_tokens_expires_at_idx" ON "mcp_tokens" USING btree ("expires_at");
  CREATE INDEX "mcp_tokens_updated_at_idx" ON "mcp_tokens" USING btree ("updated_at");
  CREATE INDEX "mcp_tokens_created_at_idx" ON "mcp_tokens" USING btree ("created_at");
  CREATE INDEX "mcp_audit_user_idx" ON "mcp_audit" USING btree ("user_id");
  CREATE INDEX "mcp_audit_grant_idx" ON "mcp_audit" USING btree ("grant_id");
  CREATE INDEX "mcp_audit_chata_idx" ON "mcp_audit" USING btree ("chata");
  CREATE INDEX "mcp_audit_updated_at_idx" ON "mcp_audit" USING btree ("updated_at");
  CREATE INDEX "mcp_audit_created_at_idx" ON "mcp_audit" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_mcp_clients_fk" FOREIGN KEY ("mcp_clients_id") REFERENCES "public"."mcp_clients"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_mcp_grants_fk" FOREIGN KEY ("mcp_grants_id") REFERENCES "public"."mcp_grants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_mcp_tokens_fk" FOREIGN KEY ("mcp_tokens_id") REFERENCES "public"."mcp_tokens"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_mcp_audit_fk" FOREIGN KEY ("mcp_audit_id") REFERENCES "public"."mcp_audit"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_mcp_clients_id_idx" ON "payload_locked_documents_rels" USING btree ("mcp_clients_id");
  CREATE INDEX "payload_locked_documents_rels_mcp_grants_id_idx" ON "payload_locked_documents_rels" USING btree ("mcp_grants_id");
  CREATE INDEX "payload_locked_documents_rels_mcp_tokens_id_idx" ON "payload_locked_documents_rels" USING btree ("mcp_tokens_id");
  CREATE INDEX "payload_locked_documents_rels_mcp_audit_id_idx" ON "payload_locked_documents_rels" USING btree ("mcp_audit_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "mcp_clients" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "mcp_grants" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "mcp_tokens" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "mcp_audit" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "mcp_clients" CASCADE;
  DROP TABLE "mcp_grants" CASCADE;
  DROP TABLE "mcp_tokens" CASCADE;
  DROP TABLE "mcp_audit" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_mcp_clients_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_mcp_grants_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_mcp_tokens_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_mcp_audit_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_mcp_clients_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_mcp_grants_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_mcp_tokens_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_mcp_audit_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "mcp_clients_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "mcp_grants_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "mcp_tokens_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "mcp_audit_id";
  DROP TYPE "public"."enum_mcp_tokens_kind";`)
}
