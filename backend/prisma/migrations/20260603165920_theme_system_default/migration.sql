-- Ensure theme column exists (fresh-install case: the original ADD COLUMN was squashed into
-- 20260608000000 which runs after this migration in timestamp order). IF NOT EXISTS makes
-- this idempotent for existing DBs that already have the column.
ALTER TABLE "technician" ADD COLUMN IF NOT EXISTS "theme" TEXT NOT NULL DEFAULT 'system';
ALTER TABLE "dispatcher" ADD COLUMN IF NOT EXISTS "theme" TEXT NOT NULL DEFAULT 'system';

-- Explicitly set default to 'system' in case the column already existed with a different default.
ALTER TABLE "technician" ALTER COLUMN "theme" SET DEFAULT 'system';
ALTER TABLE "dispatcher" ALTER COLUMN "theme" SET DEFAULT 'system';
