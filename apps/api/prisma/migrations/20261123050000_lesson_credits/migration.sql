BEGIN;

CREATE TYPE "CreditReason" AS ENUM ('GRANT', 'COMPLETED_LESSON', 'SAME_DAY_CANCELLATION');

CREATE TABLE "CreditEntry" (
    "id" UUID PRIMARY KEY,
    "studentId" UUID NOT NULL,
    "bookingId" UUID,
    "amount" INTEGER NOT NULL,
    "reason" "CreditReason" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CreditEntry_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CreditEntry_reason_amount_check" CHECK (
        ("reason" = 'GRANT' AND "bookingId" IS NULL AND "amount" BETWEEN 1 AND 100)
        OR ("reason" IN ('COMPLETED_LESSON', 'SAME_DAY_CANCELLATION') AND "bookingId" IS NOT NULL AND "amount" = -1)
    )
);

CREATE UNIQUE INDEX "CreditEntry_bookingId_key" ON "CreditEntry" ("bookingId");
CREATE INDEX "CreditEntry_studentId_createdAt_idx" ON "CreditEntry" ("studentId", "createdAt");

COMMIT;
