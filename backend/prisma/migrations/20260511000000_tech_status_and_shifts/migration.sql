-- ============================================================================
-- Unified technician status expansion and shift tracking
--
-- Upgrades technician_status (removes Busy, adds EnRoute / OnSite / Working /
-- Paused / WrappingUp), adds per-visit tech status, pause reasons, and
-- shift / break tracking tables.
-- ============================================================================

-- New enum types
CREATE TYPE "tech_visit_status" AS ENUM ('Assigned', 'EnRoute', 'OnSite', 'Done');
CREATE TYPE "pause_reason_type" AS ENUM ('AwaitingMaterials', 'EquipmentIssue', 'Break', 'Other');
CREATE TYPE "tech_break_reason" AS ENUM ('Lunch', 'Rest', 'EquipmentIssue', 'Other');

-- Upgrade technician_status: replace Busy with Working plus granular field statuses.
-- Cast to TEXT as an intermediate so Busy→Working can run before the new enum exists,
-- avoiding the PostgreSQL restriction that a freshly ADD VALUE'd enum member cannot
-- be used in DML within the same transaction.
ALTER TABLE "technician" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "technician" ALTER COLUMN "status" TYPE TEXT USING "status"::text;
UPDATE "technician" SET "status" = 'Working' WHERE "status" = 'Busy';
CREATE TYPE "technician_status_new" AS ENUM (
    'Offline', 'Available', 'Break', 'EnRoute', 'OnSite', 'Working', 'Paused', 'WrappingUp'
);
ALTER TABLE "technician"
    ALTER COLUMN "status" TYPE "technician_status_new"
    USING "status"::"technician_status_new";
ALTER TYPE "technician_status" RENAME TO "technician_status_old";
ALTER TYPE "technician_status_new" RENAME TO "technician_status";
DROP TYPE "technician_status_old";
ALTER TABLE "technician" ALTER COLUMN "status" SET DEFAULT 'Offline';

-- Configurable WrappingUp window per organisation
ALTER TABLE "organization" ADD COLUMN "wrapping_up_minutes" INTEGER NOT NULL DEFAULT 15;

-- Per-visit technician progress status
ALTER TABLE "job_visit_technician"
    ADD COLUMN "tech_status" "tech_visit_status" NOT NULL DEFAULT 'Assigned';

-- Pause reason recorded when a time entry is closed by a visit pause
ALTER TABLE "visit_tech_time_entry" ADD COLUMN "pause_reason" "pause_reason_type";

-- Shift tracking
CREATE TABLE "technician_shift" (
    "id"            TEXT         NOT NULL,
    "tech_id"       TEXT         NOT NULL,
    "org_id"        TEXT         NOT NULL,
    "started_at"    TIMESTAMP(3) NOT NULL,
    "ended_at"      TIMESTAMP(3),
    "gross_hours"   DECIMAL(8,4),
    "break_hours"   DECIMAL(8,4),
    "payable_hours" DECIMAL(8,4),
    CONSTRAINT "technician_shift_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "technician_shift_tech_id_fkey"
        FOREIGN KEY ("tech_id") REFERENCES "technician"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "technician_shift_break" (
    "id"               TEXT                NOT NULL,
    "shift_id"         TEXT                NOT NULL,
    "tech_id"          TEXT                NOT NULL,
    "reason"           "tech_break_reason" NOT NULL,
    "is_paid"          BOOLEAN             NOT NULL,
    "pre_break_status" TEXT                NOT NULL,
    "started_at"       TIMESTAMP(3)        NOT NULL,
    "ended_at"         TIMESTAMP(3),
    "duration_hrs"     DECIMAL(8,4),
    CONSTRAINT "technician_shift_break_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "technician_shift_break_shift_id_fkey"
        FOREIGN KEY ("shift_id") REFERENCES "technician_shift"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "technician_shift_break_tech_id_fkey"
        FOREIGN KEY ("tech_id") REFERENCES "technician"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "technician_shift_tech_id_idx"       ON "technician_shift"("tech_id");
CREATE INDEX "technician_shift_org_id_idx"         ON "technician_shift"("org_id");
CREATE INDEX "technician_shift_break_shift_id_idx" ON "technician_shift_break"("shift_id");
CREATE INDEX "technician_shift_break_tech_id_idx"  ON "technician_shift_break"("tech_id");
