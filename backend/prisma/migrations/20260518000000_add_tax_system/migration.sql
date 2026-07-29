-- AlterEnum
BEGIN;
CREATE TYPE "tech_visit_status_new" AS ENUM ('Assigned', 'EnRoute', 'OnSite', 'Done');
ALTER TABLE "public"."job_visit_technician" ALTER COLUMN "tech_status" DROP DEFAULT;
ALTER TABLE "job_visit_technician" ALTER COLUMN "tech_status" TYPE "tech_visit_status_new" USING ("tech_status"::text::"tech_visit_status_new");
ALTER TYPE "tech_visit_status" RENAME TO "tech_visit_status_old";
ALTER TYPE "tech_visit_status_new" RENAME TO "tech_visit_status";
DROP TYPE "public"."tech_visit_status_old";
ALTER TABLE "job_visit_technician" ALTER COLUMN "tech_status" SET DEFAULT 'Assigned';
COMMIT;

-- AlterTable
ALTER TABLE "client" ADD COLUMN     "tax_group_id" TEXT;

-- AlterTable
ALTER TABLE "invoice" ADD COLUMN     "tax_snapshot" JSONB;

-- AlterTable
ALTER TABLE "invoice_line_item" ADD COLUMN     "tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tax_group_id" TEXT,
ADD COLUMN     "taxable" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "job_line_item" ADD COLUMN     "tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tax_group_id" TEXT,
ADD COLUMN     "taxable" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "quote" ADD COLUMN     "tax_snapshot" JSONB;

-- AlterTable
ALTER TABLE "quote_line_item" ADD COLUMN     "tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tax_group_id" TEXT,
ADD COLUMN     "taxable" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "recurring_plan_line_item" ADD COLUMN     "tax_group_id" TEXT,
ADD COLUMN     "taxable" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE IF NOT EXISTS "tax_rate" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(5,4) NOT NULL,
    "description" TEXT,
    "jurisdiction" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tax_rate_rate_range_chk" CHECK (rate >= 0 AND rate <= 1)
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "tax_group" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "tax_group_rate" (
    "id" TEXT NOT NULL,
    "tax_group_id" TEXT NOT NULL,
    "tax_rate_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tax_group_rate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "tax_rate_organization_id_name_key" ON "tax_rate"("organization_id", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tax_rate_organization_id_idx" ON "tax_rate"("organization_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tax_rate_organization_id_is_default_idx" ON "tax_rate"("organization_id", "is_default");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tax_rate_organization_id_is_active_idx" ON "tax_rate"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "tax_group_organization_id_name_key" ON "tax_group"("organization_id", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tax_group_organization_id_idx" ON "tax_group"("organization_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tax_group_organization_id_is_default_idx" ON "tax_group"("organization_id", "is_default");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tax_group_organization_id_is_active_idx" ON "tax_group"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tax_group_rate_tax_group_id_idx" ON "tax_group_rate"("tax_group_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "tax_group_rate_tax_group_id_tax_rate_id_key" ON "tax_group_rate"("tax_group_id", "tax_rate_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "technician_shift_tech_id_ended_at_idx" ON "technician_shift"("tech_id", "ended_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "technician_shift_break_tech_id_ended_at_idx" ON "technician_shift_break"("tech_id", "ended_at");

-- AddForeignKey
ALTER TABLE "client" ADD CONSTRAINT "client_tax_group_id_fkey" FOREIGN KEY ("tax_group_id") REFERENCES "tax_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_line_item" ADD CONSTRAINT "quote_line_item_tax_group_id_fkey" FOREIGN KEY ("tax_group_id") REFERENCES "tax_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_line_item" ADD CONSTRAINT "job_line_item_tax_group_id_fkey" FOREIGN KEY ("tax_group_id") REFERENCES "tax_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_plan_line_item" ADD CONSTRAINT "recurring_plan_line_item_tax_group_id_fkey" FOREIGN KEY ("tax_group_id") REFERENCES "tax_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_item" ADD CONSTRAINT "invoice_line_item_tax_group_id_fkey" FOREIGN KEY ("tax_group_id") REFERENCES "tax_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rate" ADD CONSTRAINT "tax_rate_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_group" ADD CONSTRAINT "tax_group_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_group_rate" ADD CONSTRAINT "tax_group_rate_tax_group_id_fkey" FOREIGN KEY ("tax_group_id") REFERENCES "tax_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_group_rate" ADD CONSTRAINT "tax_group_rate_tax_rate_id_fkey" FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Tax architecture backfill
-- Runs automatically with this migration. All phases are idempotent.
-- ============================================================================

-- Phase 1: Seed a default tax_rate + tax_group per organisation from org.tax_rate
DO $$
DECLARE
    org_rec  RECORD;
    rate_id  TEXT;
    group_id TEXT;
BEGIN
    FOR org_rec IN SELECT id, tax_rate FROM organization LOOP
        -- Idempotency: skip if a default group already exists for this org
        CONTINUE WHEN EXISTS (
            SELECT 1 FROM tax_group
            WHERE organization_id = org_rec.id AND is_default = TRUE
        );

        group_id := gen_random_uuid()::TEXT;

        IF COALESCE(org_rec.tax_rate, 0) > 0 THEN
            rate_id := gen_random_uuid()::TEXT;
            INSERT INTO tax_rate
                (id, organization_id, name, rate, jurisdiction, is_default, is_active, created_at, updated_at)
            VALUES
                (rate_id, org_rec.id, 'Sales Tax', org_rec.tax_rate, 'State', TRUE, TRUE, NOW(), NOW());
            INSERT INTO tax_group
                (id, organization_id, name, is_default, is_active, created_at, updated_at)
            VALUES
                (group_id, org_rec.id, 'Standard Rate', TRUE, TRUE, NOW(), NOW());
            INSERT INTO tax_group_rate (id, tax_group_id, tax_rate_id, sort_order)
            VALUES (gen_random_uuid()::TEXT, group_id, rate_id, 0);
        ELSE
            -- Zero-tax org: create an empty default group (no rate attached)
            INSERT INTO tax_group
                (id, organization_id, name, is_default, is_active, created_at, updated_at)
            VALUES
                (group_id, org_rec.id, 'Standard Rate', TRUE, TRUE, NOW(), NOW());
        END IF;
    END LOOP;
END $$;

-- Phase 2: Create client-specific groups for clients whose rate differs from their org default
DO $$
DECLARE
    cli_rec  RECORD;
    org_rate NUMERIC;
    rate_id  TEXT;
    group_id TEXT;
BEGIN
    FOR cli_rec IN
        SELECT id, name, organization_id, tax_rate
        FROM   client
        WHERE  tax_rate        IS NOT NULL
          AND  tax_group_id    IS NULL
          AND  organization_id IS NOT NULL
    LOOP
        SELECT tax_rate INTO org_rate
        FROM   organization
        WHERE  id = cli_rec.organization_id;

        -- Skip if client rate matches org rate (org default group covers this client)
        CONTINUE WHEN COALESCE(org_rate, 0) = COALESCE(cli_rec.tax_rate, 0);

        rate_id  := gen_random_uuid()::TEXT;
        group_id := gen_random_uuid()::TEXT;

        INSERT INTO tax_rate
            (id, organization_id, name, rate, jurisdiction, is_default, is_active, created_at, updated_at)
        VALUES
            (rate_id, cli_rec.organization_id, 'Sales Tax', cli_rec.tax_rate, 'State', FALSE, TRUE, NOW(), NOW());

        INSERT INTO tax_group
            (id, organization_id, name, is_default, is_active, created_at, updated_at)
        VALUES
            (group_id, cli_rec.organization_id, 'Custom Rate – ' || cli_rec.name, FALSE, TRUE, NOW(), NOW());

        INSERT INTO tax_group_rate (id, tax_group_id, tax_rate_id, sort_order)
        VALUES (gen_random_uuid()::TEXT, group_id, rate_id, 0);

        UPDATE client SET tax_group_id = group_id WHERE id = cli_rec.id;
    END LOOP;
END $$;

-- Phase 3: Assign org default tax_group to unassigned draft invoice line items
UPDATE invoice_line_item ili
SET    tax_group_id = tg.id,
       taxable      = TRUE
FROM   invoice i
JOIN   tax_group tg
    ON  tg.organization_id = i.organization_id
   AND  tg.is_default      = TRUE
   AND  tg.is_active       = TRUE
WHERE  ili.invoice_id    = i.id
  AND  i.status          = 'Draft'
  AND  ili.tax_group_id IS NULL;

-- Phase 4: Assign org default tax_group to unassigned draft quote line items
UPDATE quote_line_item qli
SET    tax_group_id = tg.id,
       taxable      = TRUE
FROM   quote q
JOIN   tax_group tg
    ON  tg.organization_id = q.organization_id
   AND  tg.is_default      = TRUE
   AND  tg.is_active       = TRUE
WHERE  qli.quote_id      = q.id
  AND  q.status          = 'Draft'
  AND  qli.tax_group_id IS NULL;

-- Phase 5: Synthetic tax_snapshot for all non-Draft invoices that lack one
-- Reconstructs a v1 snapshot from the flat rate stored at invoice time.
UPDATE invoice
SET tax_snapshot = jsonb_build_object(
    'version',                  1,
    'locked_at',                COALESCE(issued_at, created_at)::TEXT,
    'client_exempt',            FALSE,
    'groups',                   CASE WHEN COALESCE(tax_rate, 0) > 0
                                  THEN jsonb_build_array(jsonb_build_object(
                                      'id',                   'migrated',
                                      'name',                 'Sales Tax (migrated)',
                                      'rates',                jsonb_build_array(jsonb_build_object(
                                          'id',   'migrated',
                                          'name', 'Sales Tax',
                                          'rate', COALESCE(tax_rate, 0)
                                      )),
                                      'taxable_amount_cents', ROUND((COALESCE(subtotal, 0) - COALESCE(discount_amount, 0)) * 100)::INTEGER,
                                      'tax_amount_cents',     ROUND(COALESCE(tax_amount, 0) * 100)::INTEGER
                                  ))
                                  ELSE '[]'::JSONB
                                END,
    'non_taxable_amount_cents', 0,
    'total_tax_cents',          ROUND(COALESCE(tax_amount, 0) * 100)::INTEGER,
    'subtotal_cents',           ROUND(COALESCE(subtotal, 0) * 100)::INTEGER,
    'discount_cents',           ROUND(COALESCE(discount_amount, 0) * 100)::INTEGER,
    'total_cents',              ROUND(COALESCE(total, 0) * 100)::INTEGER,
    'effective_rate',           COALESCE(tax_rate, 0)
)
WHERE status       != 'Draft'
  AND tax_snapshot IS NULL;
