ALTER TABLE "inventory_item" ADD COLUMN "image_keys" TEXT[] DEFAULT '{}';
ALTER TABLE "organization" ADD COLUMN "logo_key" TEXT;
