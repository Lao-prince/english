BEGIN;

ALTER TABLE "Booking" ADD COLUMN "completedAt" TIMESTAMPTZ(3);

UPDATE "Booking" b
SET "completedAt" = e."createdAt"
FROM "CreditEntry" e
WHERE e."bookingId" = b."id" AND e."reason" = 'COMPLETED_LESSON'
  AND b."cancelledAt" IS NULL;

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_completion_excludes_cancellation"
    CHECK ("completedAt" IS NULL OR "cancelledAt" IS NULL);

COMMIT;
