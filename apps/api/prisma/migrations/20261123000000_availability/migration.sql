CREATE TABLE "AvailabilitySlot" (
    "id" UUID PRIMARY KEY,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "timeZone" TEXT NOT NULL,
    "closedAt" TIMESTAMPTZ(3),
    CONSTRAINT "AvailabilitySlot_positive_duration" CHECK ("startsAt" < "endsAt"),
    CONSTRAINT "AvailabilitySlot_open_no_overlap"
        EXCLUDE USING gist (tstzrange("startsAt", "endsAt", '[)') WITH &&)
        WHERE ("closedAt" IS NULL)
);

CREATE INDEX "AvailabilitySlot_startsAt_idx" ON "AvailabilitySlot" ("startsAt");
