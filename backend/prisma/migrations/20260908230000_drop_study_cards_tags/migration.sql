-- DropIndex
DROP INDEX IF EXISTS "idx_cards_tags";

-- AlterTable
ALTER TABLE "study_cards" DROP COLUMN IF EXISTS "tags";
