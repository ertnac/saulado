-- Nested sets, and the removal of `study_cards.title` / `study_sets.description`.
--
-- Three independent changes in one migration because the middle one is not
-- independent: dropping `title` is illegal while the `search_vector` generated
-- column references it, so the vector rebuild has to sit between them.

-- ── 1. Nesting ──────────────────────────────────────────────────────────────
--
-- An adjacency list: one nullable self-FK, NULL at the root. See the `StudySet`
-- doc comment in `schema.prisma` for why this rather than a materialized path or
-- a closure table.
--
-- ON DELETE CASCADE on a self-FK deletes the whole subtree, and each deleted set
-- cascades to its own cards in turn. That is the intended semantics — a folder
-- you delete does not leave its contents behind — but it is the most destructive
-- edge in this schema, so the client confirms it by name before sending.
--
-- Deliberately nullable with no default: a set created without a parent is a
-- root, which is the common case and must not require the caller to say so.
ALTER TABLE "study_sets"
  ADD COLUMN "parent_id" uuid;

ALTER TABLE "study_sets"
  ADD CONSTRAINT "study_sets_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "study_sets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Mirrors `idx_sets_user` one level down. The sets list is either "roots for this
-- user" (`parent_id IS NULL`) or "children of this set", both ordered by
-- `updated_at DESC`, so the index carries the filter and the sort together and
-- the existing keyset pagination keeps working untouched.
CREATE INDEX "idx_sets_parent"
  ON "study_sets" ("user_id", "parent_id", "updated_at" DESC);

-- ── 2. Rebuild the search vector, BEFORE `title` goes ────────────────────────
--
-- Postgres refuses to drop a column a generated column depends on, and it will
-- not let the expression be altered in place either — a generated column has no
-- `SET EXPRESSION` in this version. So it comes down and goes back up.
--
-- Dropping the index explicitly rather than relying on the column drop to take
-- it: `DROP COLUMN` would remove it silently, and an index that disappears
-- without a line of SQL naming it is one nobody notices is gone.
DROP INDEX "idx_cards_search";
ALTER TABLE "study_cards" DROP COLUMN "search_vector";

-- Paragraph-only now, and promoted from weight 'B' to 'A'.
--
-- `setweight` is kept even though one term cannot outrank another. It pins the
-- rank scale: `ts_rank` weights default to {0.1, 0.2, 0.4, 1.0} for D..A, so an
-- unweighted vector would score every existing card differently from a weighted
-- one. Keeping the call means adding a second field later changes what ranks
-- above what, and nothing else.
--
-- `to_tsvector('english', ...)` with the config named as a literal stays
-- IMMUTABLE, which a generated column requires; the one-argument form reads
-- `default_text_search_config` at call time and is only STABLE.
ALTER TABLE "study_cards"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("paragraph", '')), 'A')
  ) STORED;

CREATE INDEX "idx_cards_search" ON "study_cards" USING GIN ("search_vector");

-- ── 3. The columns themselves ───────────────────────────────────────────────
--
-- Destructive and not recoverable: every existing card title and set description
-- is discarded here. That is the intent — a card is a paragraph with blanks in
-- it and needs no second name, and set descriptions went unwritten — but it is
-- worth one comment in the file that does it, because a rollback of this
-- migration restores the columns empty.
ALTER TABLE "study_cards" DROP COLUMN "title";
ALTER TABLE "study_sets" DROP COLUMN "description";
