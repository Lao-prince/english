# Lesson credit ledger

The teacher opens a student's Credits panel to add 1–100 lesson credits or settle a completed lesson or chargeable same-day cancellation. A student sees their own balance and recent activity under Lessons. The teacher confirms that a past lesson took place by settling it. A chargeable cancellation becomes eligible as soon as it is recorded. Booking availability does not depend on the balance. Credits are pooled and have no expiry in this first version.

Ledger entries are immutable. A grant increases the balance. A completed lesson or chargeable cancellation consumes one credit. A free cancellation cannot consume a credit. A lesson stays pending if the balance is zero. Settlement remains a teacher action for existing and future records. Currency, payment confirmation, expiry and corrections are outside this slice.

PostgreSQL stores the student, operation ID, signed amount, reason, timestamp and optional booking ID. A unique booking ID prevents repeated debits. The database checks amount and booking presence by reason. A transaction locks the student row before reading the balance or applying any ledger entry. Grant retries use the same client-generated UUID. Settlement retries return the original entry, including after the balance reaches zero.

All routes require a current session and return `Cache-Control: no-store`.

- `GET /api/credits/me` returns the signed-in student's balance and latest 30 entries.
- `GET /api/credits/students/:id` returns a student's balance, latest entries and eligible unsettled bookings. Teachers only.
- `POST /api/credits/students/:id/grant` accepts `{ id, amount }` and returns the ledger entry. Teachers only.
- `POST /api/credits/students/:id/settle` accepts `{ bookingId }` and returns the debit. Teachers only.

Malformed requests return 400. Missing sessions and wrong roles return 401 and 403. Missing students, missing bookings and bookings owned by another account return 404. Conflicting grant retries, ineligible bookings and zero-balance settlements return 409.

Set `TEST_DATABASE_URL` to an isolated, migrated PostgreSQL database before running `npm test` to exercise concurrent debits and mutation retries.
