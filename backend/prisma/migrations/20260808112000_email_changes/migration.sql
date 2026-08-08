-- Pending email changes (plan §6.5).
--
-- `new_email` is CITEXT to match `users.email`. Comparing a pending change
-- against the users table with mismatched collation would make
-- "Taken@example.com" look free when "taken@example.com" exists.
CREATE TABLE "email_changes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "new_email" CITEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_changes_pkey" PRIMARY KEY ("id")
);

-- Unique: the token is the lookup key, and a collision would make one link
-- confirm someone else's change.
CREATE UNIQUE INDEX "email_changes_token_hash_key" ON "email_changes"("token_hash");

CREATE INDEX "idx_email_change_user" ON "email_changes"("user_id", "expires_at");

-- CASCADE, matching `password_resets`: a deleted account leaves no tokens that
-- could still be redeemed against a row that no longer exists.
ALTER TABLE "email_changes"
    ADD CONSTRAINT "email_changes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
