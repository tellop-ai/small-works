-- CreateTable
CREATE TABLE "small_works_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "focus_seconds" INTEGER NOT NULL,
    "session_count" INTEGER NOT NULL,
    "completed_at" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "small_works_task_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "task_title" TEXT NOT NULL,
    "accepted_seconds" INTEGER NOT NULL,
    "created_at" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "small_works_tasks_owner_id_status_id_idx" ON "small_works_tasks"("owner_id", "status", "id");

-- CreateIndex
CREATE INDEX "small_works_task_sessions_owner_id_task_id_id_idx" ON "small_works_task_sessions"("owner_id", "task_id", "id");
