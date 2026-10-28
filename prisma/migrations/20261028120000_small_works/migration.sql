-- CreateTable
CREATE TABLE "small_works_workshops" (
    "owner_id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "maker_name" TEXT NOT NULL,
    "coin_minor" INTEGER NOT NULL,
    "bank_seconds" INTEGER NOT NULL,
    "lifetime_focus_seconds" INTEGER NOT NULL,
    "practice_seconds" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "active_session_id" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "small_works_preferences" (
    "owner_id" TEXT NOT NULL PRIMARY KEY,
    "language" TEXT NOT NULL,
    "appearance" TEXT NOT NULL,
    "time_zone" TEXT NOT NULL,
    "motion" TEXT NOT NULL,
    "sound_enabled" BOOLEAN NOT NULL,
    "ambience_volume" INTEGER NOT NULL,
    "effect_volume" INTEGER NOT NULL,
    "default_mode" TEXT NOT NULL,
    "default_minutes" INTEGER NOT NULL,
    "break_minutes" INTEGER NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "small_works_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "intention" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "time_zone" TEXT NOT NULL,
    "started_at" TEXT NOT NULL,
    "active_since" TEXT,
    "ended_at" TEXT,
    "limit_seconds" INTEGER NOT NULL,
    "candidate_closed_seconds" INTEGER NOT NULL,
    "accepted_seconds" INTEGER NOT NULL,
    "part_count" INTEGER NOT NULL,
    "current_plan" TEXT NOT NULL,
    "allocation_summary" TEXT NOT NULL,
    "settlement_operation_id" TEXT,
    "recovered" BOOLEAN NOT NULL,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "small_works_session_parts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "started_at" TEXT NOT NULL,
    "ended_at" TEXT NOT NULL,
    "candidate_seconds" INTEGER NOT NULL,
    "plan_snapshot" TEXT NOT NULL,
    "created_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "small_works_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner_id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "recipe_version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "chosen_finish" INTEGER NOT NULL,
    "completed_finish" INTEGER NOT NULL,
    "reserved_material_minor" INTEGER NOT NULL,
    "applied_seconds" INTEGER NOT NULL,
    "saleable_seconds" INTEGER NOT NULL,
    "spec_snapshot" TEXT NOT NULL,
    "progress_snapshot" TEXT NOT NULL,
    "pattern_id" TEXT NOT NULL,
    "finish_style_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "order_id" TEXT,
    "finalized_at" TEXT,
    "sale_minor" INTEGER,
    "showroom_position" INTEGER,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "small_works_allocations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner_id" TEXT NOT NULL,
    "source_kind" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "job_id" TEXT,
    "worker_id" TEXT,
    "seconds" INTEGER NOT NULL,
    "allocation_kind" TEXT NOT NULL,
    "created_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "small_works_unlocks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner_id" TEXT NOT NULL,
    "unlock_id" TEXT NOT NULL,
    "source_job_id" TEXT,
    "unlocked_at" TEXT NOT NULL,
    "created_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "small_works_crew" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "onboarding_job_id" TEXT,
    "allocated_seconds" INTEGER NOT NULL,
    "joined_at" TEXT,
    "pattern_milestone" INTEGER NOT NULL,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "small_works_commissions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "template_id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "recipe_version" INTEGER NOT NULL,
    "required_finish" INTEGER NOT NULL,
    "required_work_seconds" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "object_id" TEXT,
    "accepted_at" TEXT,
    "delivered_at" TEXT,
    "bonus_minor" INTEGER NOT NULL,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "small_works_operations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner_id" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "request_digest" TEXT NOT NULL,
    "coin_delta_minor" INTEGER NOT NULL,
    "bank_delta_seconds" INTEGER NOT NULL,
    "focus_delta_seconds" INTEGER NOT NULL,
    "result_summary" TEXT NOT NULL,
    "created_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "small_works_exports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "export_file" TEXT,
    "from_day" TEXT,
    "to_day" TEXT,
    "status" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "small_works_sessions_owner_id_status_id_idx" ON "small_works_sessions"("owner_id", "status", "id");

-- CreateIndex
CREATE INDEX "small_works_sessions_owner_id_created_at_id_idx" ON "small_works_sessions"("owner_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "small_works_session_parts_owner_id_created_at_id_idx" ON "small_works_session_parts"("owner_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "small_works_session_parts_owner_id_session_id_ordinal_key" ON "small_works_session_parts"("owner_id", "session_id", "ordinal");

-- CreateIndex
CREATE INDEX "small_works_jobs_owner_id_status_id_idx" ON "small_works_jobs"("owner_id", "status", "id");

-- CreateIndex
CREATE INDEX "small_works_jobs_owner_id_created_at_id_idx" ON "small_works_jobs"("owner_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "small_works_allocations_owner_id_created_at_id_idx" ON "small_works_allocations"("owner_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "small_works_allocations_owner_id_source_kind_source_id_ordinal_key" ON "small_works_allocations"("owner_id", "source_kind", "source_id", "ordinal");

-- CreateIndex
CREATE INDEX "small_works_unlocks_owner_id_created_at_id_idx" ON "small_works_unlocks"("owner_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "small_works_unlocks_owner_id_unlock_id_key" ON "small_works_unlocks"("owner_id", "unlock_id");

-- CreateIndex
CREATE INDEX "small_works_crew_owner_id_created_at_id_idx" ON "small_works_crew"("owner_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "small_works_crew_owner_id_staff_id_key" ON "small_works_crew"("owner_id", "staff_id");

-- CreateIndex
CREATE INDEX "small_works_commissions_owner_id_created_at_id_idx" ON "small_works_commissions"("owner_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "small_works_commissions_owner_id_sequence_key" ON "small_works_commissions"("owner_id", "sequence");

-- CreateIndex
CREATE INDEX "small_works_operations_owner_id_created_at_id_idx" ON "small_works_operations"("owner_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "small_works_operations_owner_id_operation_id_key" ON "small_works_operations"("owner_id", "operation_id");

-- CreateIndex
CREATE UNIQUE INDEX "small_works_operations_owner_id_revision_key" ON "small_works_operations"("owner_id", "revision");

-- CreateIndex
CREATE INDEX "small_works_exports_owner_id_created_at_id_idx" ON "small_works_exports"("owner_id", "created_at", "id");
