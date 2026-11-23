# Phase 2 availability

The teacher publishes and closes one-off slots. Approved students see upcoming open slots in their device time zone. See [Student booking](BOOKING.md) for reservations and how booking affects availability.

An open slot can become closed. Closing is terminal and safe to retry. Slots start in the future, have a positive duration, and open intervals cannot overlap. Adjacent intervals may touch. The calendar form uses the teacher's device IANA zone and submits an explicit UTC instant. The slot retains the input zone. A nonexistent local time is rejected by the form. When a local time occurs twice, the form uses the earlier instant.

PostgreSQL stores starts, ends and closure times as UTC instants. A check constraint enforces positive intervals. Publication serializes calendar writes in a transaction, and a partial GiST exclusion constraint enforces the overlap rule. An immutable client-generated UUID identifies each publication attempt, allowing retries to return the original record. The database has one teacher, so overlap is checked across all open slots.

All routes require a signed session for a currently approved account. `GET /api/schedule/slots` lists upcoming open intervals for both roles. `POST /api/schedule/slots` is teacher-only and accepts `id`, UTC `startsAt`, positive integer `durationMinutes`, and IANA `timeZone`. It returns the slot with `id`, `startsAt`, `endsAt`, `timeZone`, and `closedAt`. A repeated identical request returns the same slot. `POST /api/schedule/slots/:id/close` is teacher-only and returns the original closure on retry.

Invalid input or a new slot starting in the past returns 400. Duration accepts 1–1440 minutes. Missing or stale sessions return 401, student mutations return 403, missing slots return 404, and an overlap or reused ID with different details returns 409.

Run `npm test` for time validation. Set `TEST_DATABASE_URL` to a separate, migrated test database to also run the PostgreSQL concurrency and retry test.
