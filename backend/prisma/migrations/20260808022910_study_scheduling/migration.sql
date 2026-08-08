-- CreateTable
CREATE TABLE "card_schedules" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "ease_factor" DECIMAL(3,2) NOT NULL DEFAULT 2.50,
    "interval_days" INTEGER NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "due_at" DATE NOT NULL,
    "last_reviewed_at" TIMESTAMP(3),

    CONSTRAINT "card_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "grade" SMALLINT NOT NULL,
    "blank_results" JSONB NOT NULL,
    "duration_ms" INTEGER,
    "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_daily_stats" (
    "user_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "reviews_count" INTEGER NOT NULL DEFAULT 0,
    "correct_count" INTEGER NOT NULL DEFAULT 0,
    "goal_met" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_daily_stats_pkey" PRIMARY KEY ("user_id","day")
);

-- CreateTable
CREATE TABLE "study_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "study_set_id" UUID,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "study_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_session_cards" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "is_new" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "answered_at" TIMESTAMP(3),
    "grade" SMALLINT,
    "correct" BOOLEAN,
    "idempotency_key" TEXT,
    "last_result" JSONB,

    CONSTRAINT "study_session_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_schedules_due" ON "card_schedules"("user_id", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "idx_schedules_user_card" ON "card_schedules"("user_id", "card_id");

-- CreateIndex
CREATE INDEX "idx_reviews_user_date" ON "reviews"("user_id", "reviewed_at" DESC);

-- CreateIndex
CREATE INDEX "idx_reviews_card" ON "reviews"("card_id", "reviewed_at" DESC);

-- CreateIndex
CREATE INDEX "idx_daily_stats_user_day" ON "user_daily_stats"("user_id", "day" DESC);

-- CreateIndex
CREATE INDEX "idx_sessions_user" ON "study_sessions"("user_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "idx_session_cards_order" ON "study_session_cards"("session_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "idx_session_cards_unique" ON "study_session_cards"("session_id", "card_id");

-- AddForeignKey
ALTER TABLE "card_schedules" ADD CONSTRAINT "card_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_schedules" ADD CONSTRAINT "card_schedules_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "study_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "study_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_daily_stats" ADD CONSTRAINT "user_daily_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_study_set_id_fkey" FOREIGN KEY ("study_set_id") REFERENCES "study_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_session_cards" ADD CONSTRAINT "study_session_cards_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "study_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_session_cards" ADD CONSTRAINT "study_session_cards_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "study_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
