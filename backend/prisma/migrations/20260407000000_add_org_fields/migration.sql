-- Add organization branding, contact, and location fields
ALTER TABLE "organization" ADD COLUMN "logo_url" TEXT;
ALTER TABLE "organization" ADD COLUMN "phone" TEXT;
ALTER TABLE "organization" ADD COLUMN "address" TEXT;
ALTER TABLE "organization" ADD COLUMN "coords" JSONB;
ALTER TABLE "organization" ADD COLUMN "email" TEXT;
ALTER TABLE "organization" ADD COLUMN "website" TEXT;
