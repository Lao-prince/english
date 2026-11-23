CREATE TABLE "StudentInvitation" (
    "codeHash" TEXT PRIMARY KEY,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "redeemedAt" TIMESTAMPTZ(3)
);
