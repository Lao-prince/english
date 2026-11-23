# Student booking

An approved student selects an upcoming open slot and confirms the reservation. The slot becomes booked, disappears from availability, and appears under Upcoming lessons. The teacher sees the reservation and the student's Telegram ID when available. Students can only read their own bookings. The pilot accepts bookings without checking subscription credit.

Each slot has at most one active booking. Creating the booking and occupying the slot are the same database write. The booking stores the verified student's account ID, the slot ID and creation time. The slot supplies the lesson time. Calendar transactions serialize booking, cancellation, and teacher closure. A partial unique index enforces exclusivity for active bookings while retaining cancellation history.

- `POST /api/schedule/slots/:id/book` requires a student session and returns the booking ID, slot ID, start, and end. The app sends a unique `requestId` query parameter per booking attempt. Retries with that ID return the original booking even after cancellation. Requests without an ID return the student's latest reservation for that slot on retry.
- `GET /api/schedule/bookings` lists upcoming reservations. Teachers receive all reservations with a student reference. Students only receive their own and no student reference.
- The existing slot list excludes booked slots. Invalid IDs return 400, unauthenticated requests return 401, and teacher booking requests return 403. Missing slots return 404. Past, closed, or already booked slots return 409. Closing a booked slot also returns 409. The app reloads the calendar after a conflict.

## Student cancellation

Before the lesson starts, its owner may cancel. The teacher's IANA zone stored on the slot determines whether the cancellation and lesson fall on the same calendar date. Earlier cancellations reopen the slot without a charge. Same-day cancellations require explicit acknowledgement, are recorded as chargeable, and close the slot. The pilot leaves the chargeable reservation for the future subscription ledger to settle. Cancellation becomes terminal and releases the active booking key. A retry returns the original outcome.

`GET /api/schedule/bookings` gives students a `cancellationChargeApplies` preview. `POST /api/schedule/bookings/:id/cancel` accepts `{ acceptSameDayCharge: boolean }` and returns `id`, `cancelledAt`, and `chargeApplies`. The server recalculates the policy inside the transaction. A missing or foreign booking returns 404. A lesson that already started, or a same-day charge without acknowledgement, returns 409. The UI refreshes the preview after a conflict. The database persists the cancellation instant and charge classification together.

Run `npm test` for route authorization checks. Set `TEST_DATABASE_URL` to an isolated, migrated PostgreSQL database to run the concurrency, ownership and retry checks.
