# Lesson credit ledger

The teacher opens a student's Credits panel to add 1–100 lesson credits, optionally as a package with a last valid date, or to settle a completed lesson or chargeable same-day cancellation. A student sees their own balance, packages and recent activity under Lessons. The teacher confirms that a past lesson took place by settling it. A chargeable cancellation becomes eligible as soon as it is recorded. Booking availability does not depend on the balance.

Ledger entries are immutable. Grants without a deadline stay in the existing non-expiring balance. Each dated grant creates one package. Its unused credits are excluded from the spendable balance starting at the next local midnight after the last valid date, in the teacher's device time zone at issuance. The app retains the original date and UTC expiry. A completed lesson or chargeable cancellation consumes one credit from the soonest-expiring package that is active when the teacher settles it, then from the non-expiring balance. A free cancellation cannot consume a credit. A lesson stays pending if the spendable balance is zero. The teacher can reverse a mistaken debit once, which returns the credit to its original package or non-expiring balance and waives the charge. If the original package has expired, the return is recorded there and does not increase the spendable balance. Currency, payment confirmation and reversal of grants are outside this slice.

PostgreSQL stores the student, operation ID, signed amount, reason, timestamp and optional booking ID. A unique booking ID prevents repeated debits. The database checks amount and booking presence by reason. A transaction locks the student row before reading the balance or applying any ledger entry. Grant retries use the same client-generated UUID. Settlement retries return the original entry, including after the balance reaches zero.

All routes require a current session and return `Cache-Control: no-store`.

- `GET /api/credits/me` returns the signed-in student's balance and latest 30 entries.
- `GET /api/credits/students/:id` returns a student's balance, latest entries and eligible unsettled bookings. Teachers only.
- `POST /api/credits/students/:id/grant` accepts `{ id, amount, package?: { validThrough, timeZone } }` and returns the ledger entry. `validThrough` is a calendar date in `YYYY-MM-DD` format, and `timeZone` is an IANA zone. An invalid date or zone returns 400. A package ending in the past returns 409 on first submission. A retry with the same ID and identical terms returns the original entry even after expiry. Teachers only.
- `POST /api/credits/students/:id/settle` accepts `{ bookingId }` and returns the debit. Teachers only.
- `POST /api/credits/students/:id/reverse` accepts `{ entryId }` and returns the reversal. Teachers only. Repeating the request returns the same entry. A missing or foreign debit returns 404. Grants and reversals return 409. A unique self-reference enforces one reversal per debit. Recent activity identifies which entries are reversed, and students see the offsetting credit in their own history.

Malformed requests return 400. Missing sessions and wrong roles return 401 and 403. Missing students, missing bookings and bookings owned by another account return 404. Conflicting grant retries, ineligible bookings and zero-balance settlements return 409.

Both summary routes add `nonExpiringBalance` and `packages`. Package rows include the original amount, remaining credits, last valid date, IANA zone, UTC expiry and expired flag. Recent entries that spend or restore package credits refer to the grant by `packageId`.

Set `TEST_DATABASE_URL` to an isolated, migrated PostgreSQL database before running `npm test` to exercise concurrent debits and mutation retries.
