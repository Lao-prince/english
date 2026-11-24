ALTER TABLE "Booking"
    ADD COLUMN "cancelledByTeacher" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "reopenedOnCancellation" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "cancellationReason" VARCHAR(200),
    ADD CONSTRAINT "Booking_teacher_cancellation_details" CHECK (
        ("cancelledByTeacher" AND "cancelledAt" IS NOT NULL AND NOT "chargeApplies")
        OR (NOT "cancelledByTeacher" AND NOT "reopenedOnCancellation" AND "cancellationReason" IS NULL)
    );
