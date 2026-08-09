-- DropIndex
DROP INDEX "idx_cards_search";

-- AlterTable
ALTER TABLE "study_cards" ALTER COLUMN "search_vector" DROP DEFAULT;
