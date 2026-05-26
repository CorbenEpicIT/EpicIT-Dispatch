-- CreateTable
CREATE TABLE "inventory_tag" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_inventory_itemToinventory_tag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_inventory_itemToinventory_tag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "inventory_tag_organization_id_idx" ON "inventory_tag"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_tag_organization_id_label_key" ON "inventory_tag"("organization_id", "label");

-- CreateIndex
CREATE INDEX "_inventory_itemToinventory_tag_B_index" ON "_inventory_itemToinventory_tag"("B");

-- AddForeignKey
ALTER TABLE "inventory_tag" ADD CONSTRAINT "inventory_tag_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_inventory_itemToinventory_tag" ADD CONSTRAINT "_inventory_itemToinventory_tag_A_fkey" FOREIGN KEY ("A") REFERENCES "inventory_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_inventory_itemToinventory_tag" ADD CONSTRAINT "_inventory_itemToinventory_tag_B_fkey" FOREIGN KEY ("B") REFERENCES "inventory_tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
