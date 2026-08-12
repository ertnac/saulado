-- CreateEnum
CREATE TYPE "session_mode" AS ENUM ('spaced', 'sequential', 'shuffled', 'retake');

-- AlterTable
ALTER TABLE "study_sessions" ADD COLUMN "mode" "session_mode" NOT NULL DEFAULT 'spaced';

-- AlterTable
ALTER TABLE "study_session_cards" ADD COLUMN "had_empty_blank" BOOLEAN NOT NULL DEFAULT false;
