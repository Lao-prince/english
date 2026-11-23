BEGIN;

ALTER TYPE "CreditReason" ADD VALUE 'DEBIT_REVERSAL';

ALTER TABLE "CreditEntry"
    ADD COLUMN "reversesId" UUID,
    ADD CONSTRAINT "CreditEntry_reversesId_fkey"
        FOREIGN KEY ("reversesId") REFERENCES "CreditEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    DROP CONSTRAINT "CreditEntry_reason_amount_check";

-- Compare the new enum label as text until this transaction commits.
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_reason_amount_check" CHECK (
    ("reason" = 'GRANT' AND "bookingId" IS NULL AND "reversesId" IS NULL AND "amount" BETWEEN 1 AND 100)
    OR ("reason" IN ('COMPLETED_LESSON', 'SAME_DAY_CANCELLATION')
        AND "bookingId" IS NOT NULL AND "reversesId" IS NULL AND "amount" = -1)
    OR ("reason"::text = 'DEBIT_REVERSAL' AND "bookingId" IS NULL
        AND "reversesId" IS NOT NULL AND "reversesId" <> "id" AND "amount" = 1)
);

CREATE UNIQUE INDEX "CreditEntry_reversesId_key" ON "CreditEntry" ("reversesId");

COMMIT;
