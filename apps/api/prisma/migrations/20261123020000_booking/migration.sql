CREATE TABLE "Booking" (
    "id" UUID PRIMARY KEY,
    "slotId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Booking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "AvailabilitySlot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Booking_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Booking_slotId_key" ON "Booking" ("slotId");
CREATE INDEX "Booking_studentId_idx" ON "Booking" ("studentId");
