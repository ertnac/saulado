-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateTable
CREATE TABLE "study_sets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_cards" (
    "id" UUID NOT NULL,
    "study_set_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "paragraph" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_answers" (
    "id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "start_offset" INTEGER NOT NULL,
    "end_offset" INTEGER NOT NULL,
    "answer_text" TEXT NOT NULL,
    "alt_answers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ordinal" INTEGER NOT NULL,

    CONSTRAINT "card_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_sets_user" ON "study_sets"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "idx_cards_set" ON "study_cards"("study_set_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_cards_tags" ON "study_cards" USING GIN ("tags" array_ops);

-- CreateIndex
CREATE UNIQUE INDEX "idx_answers_card" ON "card_answers"("card_id", "ordinal");

-- AddForeignKey
ALTER TABLE "study_sets" ADD CONSTRAINT "study_sets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_cards" ADD CONSTRAINT "study_cards_study_set_id_fkey" FOREIGN KEY ("study_set_id") REFERENCES "study_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_answers" ADD CONSTRAINT "card_answers_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "study_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- The offset-model invariants (IMPLEMENTATION_PLAN.md §2.1).
--
-- These are enforced in application code too (`validateAnswers`), but a check
-- constraint is what makes them true of the *data* rather than true of the code
-- path that happened to write it. A bug in a future bulk import, a migration
-- backfill, or a hand-run UPDATE cannot corrupt a card's offsets past these.
--
-- Prisma's schema language cannot express any of them, so they live here as raw
-- SQL. Anything added to this block must also be added to the checked-in
-- `schema.prisma` comments, since `prisma migrate diff` does not see them.
-- ─────────────────────────────────────────────────────────────────────────────

-- Invariant 1: 0 <= start_offset < end_offset. The upper bound
-- (end_offset <= length(paragraph)) is not expressible here — it spans two
-- tables — so `validateAnswers` owns that half.
ALTER TABLE "card_answers"
  ADD CONSTRAINT "card_answers_offsets_ordered"
  CHECK ("start_offset" >= 0 AND "start_offset" < "end_offset");

-- Invariant 3: ordinal is 0-based.
ALTER TABLE "card_answers"
  ADD CONSTRAINT "card_answers_ordinal_non_negative"
  CHECK ("ordinal" >= 0);

-- Invariant 4: an answer must not be pure whitespace. A blank the user cannot
-- see is a card that cannot be completed.
ALTER TABLE "card_answers"
  ADD CONSTRAINT "card_answers_text_not_blank"
  CHECK (btrim("answer_text") <> '');

-- answer_text is denormalised, so its length must agree with the range it was
-- sliced from. Cheap tripwire for the "paragraph edited without re-anchoring"
-- case. Compared in code points to match the offset model, hence
-- char_length(), not octet_length().
ALTER TABLE "card_answers"
  ADD CONSTRAINT "card_answers_text_matches_range"
  CHECK (char_length("answer_text") = "end_offset" - "start_offset");

-- Invariant 2: answers never overlap within a card. int4range is half-open,
-- matching [start, end) exactly, so two ranges touching end-to-start do not
-- collide. Needs btree_gist for the `card_id WITH =` element.
ALTER TABLE "card_answers"
  ADD CONSTRAINT "card_answers_no_overlap"
  EXCLUDE USING gist (
    "card_id" WITH =,
    int4range("start_offset", "end_offset") WITH &&
  );
