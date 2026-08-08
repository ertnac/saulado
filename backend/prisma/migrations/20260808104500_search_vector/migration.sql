-- Full-text search over cards (plan §6.1).
--
-- Prisma's schema language cannot express a generated column or a GIN index over
-- an expression, so both live here as raw SQL. Anything added to this block must
-- also be added to the checked-in `schema.prisma` comments, since
-- `prisma migrate diff` does not see them.

-- A stored generated column, not a trigger. The column cannot drift from the row
-- it summarises, because Postgres recomputes it on every INSERT and UPDATE that
-- touches `title` or `paragraph` — there is no code path that can forget to.
--
-- `to_tsvector('english', ...)` with the config named as a literal is IMMUTABLE.
-- The one-argument form reads `default_text_search_config` at call time and is
-- only STABLE, which a generated column may not use. Naming the config is what
-- makes this legal, and it also pins the stemmer: a server whose default config
-- differs cannot silently index a different set of lexemes.
--
-- setweight gives a title hit a heavier rank than a paragraph hit. `coalesce`
-- guards NULL, which would otherwise make the whole concatenation NULL — both
-- columns are NOT NULL today, and this survives that changing.
ALTER TABLE "study_cards"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("paragraph", '')), 'B')
  ) STORED;

-- GIN, not GiST: GIN is slower to update and faster to search, and cards are
-- searched far more often than they are written.
CREATE INDEX "idx_cards_search" ON "study_cards" USING GIN ("search_vector");
