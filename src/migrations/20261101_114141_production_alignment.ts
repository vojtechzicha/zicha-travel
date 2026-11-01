import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Hand-written, idempotent. Brings the schema that the old hand-maintained DDL
 * built (production, preview) and the schema the baseline migration builds
 * (any fresh database) to the same shape, and keeps what Payload's config
 * cannot express:
 *
 * - Two objects whose production names differ from the names Payload
 *   generates. Renamed to Payload's names, so later generated migrations that
 *   touch them find them.
 * - ON DELETE CASCADE on three NOT NULL references. Payload generates
 *   SET NULL, which PostgreSQL can never satisfy on a NOT NULL column: the
 *   delete of a user or participant would fail outright (see CLAUDE.md,
 *   ClaimRequests / pending votes). The app still cleans up in hooks; this is
 *   the backstop for every other delete path.
 * - Three partial / compound unique indexes the app relies on (one vote per
 *   participant, one pending vote per account and chata, one private
 *   settlement mark per member).
 *
 * Payload's snapshot (the baseline .json) does not know about the CASCADEs or
 * the extra indexes, so generated migrations leave them alone. If a future
 * generated migration recreates one of these foreign keys or drops one of
 * these indexes, re-assert it in that migration.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chatas_public_transport_options_riders_participant_id_fk')
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chatas_public_transport_options_riders_participant_id_participa') THEN
      ALTER TABLE "chatas_public_transport_options_riders"
        RENAME CONSTRAINT "chatas_public_transport_options_riders_participant_id_fk"
        TO "chatas_public_transport_options_riders_participant_id_participa";
    END IF;
  END $$;

  ALTER INDEX IF EXISTS "payload_locked_documents_rels_trip_accommodation_options_id_idx"
    RENAME TO "payload_locked_documents_rels_trip_accommodation_options_idx";

  ALTER TABLE "claim_requests" DROP CONSTRAINT IF EXISTS "claim_requests_user_id_users_id_fk";
  ALTER TABLE "claim_requests" ADD CONSTRAINT "claim_requests_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  ALTER TABLE "claim_requests" DROP CONSTRAINT IF EXISTS "claim_requests_participant_id_participants_id_fk";
  ALTER TABLE "claim_requests" ADD CONSTRAINT "claim_requests_participant_id_participants_id_fk"
    FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  ALTER TABLE "trip_votes" DROP CONSTRAINT IF EXISTS "trip_votes_participant_id_participants_id_fk";
  ALTER TABLE "trip_votes" ADD CONSTRAINT "trip_votes_participant_id_participants_id_fk"
    FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

  CREATE UNIQUE INDEX IF NOT EXISTS "trip_votes_participant_uq"
    ON "trip_votes" USING btree ("participant_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "pending_votes_user_chata_pending_uq"
    ON "pending_votes" USING btree ("user_id", "chata_id") WHERE "status" = 'pending';
  CREATE UNIQUE INDEX IF NOT EXISTS "expenses_private_settlements_parent_participant_uq"
    ON "expenses_private_settlements" USING btree ("_parent_id", "participant_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Back to exactly what the baseline builds (Payload's own shape).
  await db.execute(sql`
  DROP INDEX IF EXISTS "expenses_private_settlements_parent_participant_uq";
  DROP INDEX IF EXISTS "pending_votes_user_chata_pending_uq";
  DROP INDEX IF EXISTS "trip_votes_participant_uq";

  ALTER TABLE "trip_votes" DROP CONSTRAINT IF EXISTS "trip_votes_participant_id_participants_id_fk";
  ALTER TABLE "trip_votes" ADD CONSTRAINT "trip_votes_participant_id_participants_id_fk"
    FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  ALTER TABLE "claim_requests" DROP CONSTRAINT IF EXISTS "claim_requests_participant_id_participants_id_fk";
  ALTER TABLE "claim_requests" ADD CONSTRAINT "claim_requests_participant_id_participants_id_fk"
    FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  ALTER TABLE "claim_requests" DROP CONSTRAINT IF EXISTS "claim_requests_user_id_users_id_fk";
  ALTER TABLE "claim_requests" ADD CONSTRAINT "claim_requests_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;`)
}
