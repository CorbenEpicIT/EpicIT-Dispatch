-- DropIndex
DROP INDEX "recurring_occurrence_recurring_plan_id_occurrence_start_at_key";

-- AlterTable
ALTER TABLE "recurring_occurrence" ADD COLUMN     "arrival_constraint" "arrival_constraint" NOT NULL DEFAULT 'at',
ADD COLUMN     "arrival_time" TEXT,
ADD COLUMN     "arrival_window_end" TEXT,
ADD COLUMN     "arrival_window_start" TEXT,
ADD COLUMN     "finish_constraint" "finish_constraint" NOT NULL DEFAULT 'when_done',
ADD COLUMN     "finish_time" TEXT;
