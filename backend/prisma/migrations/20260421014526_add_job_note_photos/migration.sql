-- CreateTable
CREATE TABLE "job_note_photo" (
    "id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "photo_url" TEXT NOT NULL,
    "photo_label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_note_photo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_note_photo_note_id_idx" ON "job_note_photo"("note_id");

-- AddForeignKey
ALTER TABLE "job_note_photo" ADD CONSTRAINT "job_note_photo_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "job_note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
