BEGIN;

ALTER TABLE "Booking" ADD COLUMN "originalSlotId" UUID;

CREATE TABLE "BookingMove" (
    "id" UUID PRIMARY KEY,
    "bookingId" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "fromSlotId" UUID NOT NULL,
    "toSlotId" UUID NOT NULL,
    "fromStartsAt" TIMESTAMPTZ(3) NOT NULL,
    "fromEndsAt" TIMESTAMPTZ(3) NOT NULL,
    "toStartsAt" TIMESTAMPTZ(3) NOT NULL,
    "toEndsAt" TIMESTAMPTZ(3) NOT NULL,
    "reopenedPreviousSlot" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookingMove_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BookingMove_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BookingMove_distinct_slots" CHECK ("fromSlotId" <> "toSlotId")
);

CREATE INDEX "BookingMove_bookingId_createdAt_idx" ON "BookingMove" ("bookingId", "createdAt");

COMMIT;
