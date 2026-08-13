/*
  Warnings:

  - A unique constraint covering the columns `[google_id]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/

-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN     "nickname" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "profile_image" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "google_id" TEXT,
ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");
