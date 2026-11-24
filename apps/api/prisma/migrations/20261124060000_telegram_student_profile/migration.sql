ALTER TABLE "User"
    ADD COLUMN "telegramName" VARCHAR(120),
    ADD COLUMN "telegramUsername" VARCHAR(32),
    ADD COLUMN "telegramAvatarUrl" TEXT,
    ADD COLUMN "telegramProfileAt" TIMESTAMPTZ(3);
