-- Remove redundant fields from the contact table
ALTER TABLE "contact" DROP COLUMN IF EXISTS "company";
ALTER TABLE "contact" DROP COLUMN IF EXISTS "title";
ALTER TABLE "contact" DROP COLUMN IF EXISTS "misc_info";
