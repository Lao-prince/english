CREATE TYPE "ReminderState" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED', 'UNKNOWN');

CREATE TABLE "LessonReminder" (
    "bookingId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "state" "ReminderState" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "LessonReminder_pkey" PRIMARY KEY ("bookingId", "recipientId"),
    CONSTRAINT "LessonReminder_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LessonReminder_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "LessonReminder_state_nextAttemptAt_idx" ON "LessonReminder" ("state", "nextAttemptAt");
