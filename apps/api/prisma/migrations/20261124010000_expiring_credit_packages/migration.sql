BEGIN;

ALTER TABLE "CreditEntry"
    ADD COLUMN "packageId" UUID,
    ADD COLUMN "validThrough" VARCHAR(10),
    ADD COLUMN "packageTimeZone" VARCHAR(100),
    ADD COLUMN "expiresAt" TIMESTAMPTZ(3),
    ADD CONSTRAINT "CreditEntry_packageId_fkey"
        FOREIGN KEY ("packageId") REFERENCES "CreditEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "CreditEntry_package_terms_check" CHECK (
        ("expiresAt" IS NULL AND "validThrough" IS NULL AND "packageTimeZone" IS NULL)
        OR ("reason" = 'GRANT' AND "expiresAt" IS NOT NULL AND "validThrough" IS NOT NULL
            AND "packageTimeZone" IS NOT NULL AND "expiresAt" > "createdAt")
    ),
    ADD CONSTRAINT "CreditEntry_package_member_check" CHECK (
        "packageId" IS NULL OR ("reason" <> 'GRANT' AND "packageId" <> "id")
    );

CREATE INDEX "CreditEntry_studentId_packageId_idx" ON "CreditEntry" ("studentId", "packageId");

COMMIT;
