BEGIN;

ALTER TABLE "Booking"
    ADD COLUMN "cancelledAt" TIMESTAMPTZ(3),
    ADD COLUMN "chargeApplies" BOOLEAN NOT NULL DEFAULT false,
    ADD CONSTRAINT "Booking_charge_requires_cancellation"
        CHECK (NOT "chargeApplies" OR "cancelledAt" IS NOT NULL);

CREATE UNIQUE INDEX "Booking_one_active_slot" ON "Booking" ("slotId") WHERE "cancelledAt" IS NULL;
CREATE INDEX "Booking_slotId_studentId_createdAt_idx" ON "Booking" ("slotId", "studentId", "createdAt");
DROP INDEX "Booking_slotId_key";

COMMIT;
