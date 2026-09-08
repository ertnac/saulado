-- AlterTable
ALTER TABLE "cloud_files" ADD COLUMN IF NOT EXISTS "file_url" TEXT;
ALTER TABLE "cloud_files" ADD COLUMN IF NOT EXISTS "storage_key" TEXT;
ALTER TABLE "cloud_files" ALTER COLUMN "data" DROP NOT NULL;
