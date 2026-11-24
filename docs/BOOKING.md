# Student booking

An approved student selects an upcoming open slot and confirms the reservation. The slot becomes booked, disappears from availability, and appears under Upcoming lessons. The teacher sees the reservation and the student's Telegram ID when available. Students can only read their own bookings. The pilot accepts bookings without checking subscription credit.

Each slot has at most one active booking. Creating the booking and occupying the slot are the same database write. The booking stores the verified student's account ID, the slot ID and creation time. The slot supplies the lesson time. Calendar transactions serialize booking, cancellation, and teacher closure. A partial unique index enforces exclusivity for active bookings while retaining cancellation history.

- `POST /api/schedule/slots/:id/book` requires a student session and returns the booking ID, slot ID, start, and end. The app sends a unique `requestId` query parameter per booking attempt. Retries with that ID return the original booking even after cancellation. Requests without an ID return the student's latest reservation for that slot on retry.
- `GET /api/schedule/bookings` lists upcoming reservations. Teachers receive all reservations with a student reference and an optional roster display name. Students receive only their own reservations.
- The existing slot list excludes booked slots. Invalid IDs return 400, unauthenticated requests return 401, and teacher booking requests return 403. Missing slots return 404. Past, closed, or already booked slots return 409. Closing a booked slot also returns 409. The app reloads the calendar after a conflict.

## Student cancellation

Before the lesson starts, its owner may cancel. The teacher's IANA zone stored on the slot determines whether the cancellation and lesson fall on the same calendar date. Earlier cancellations reopen the slot without a charge. Same-day cancellations require explicit acknowledgement, are recorded as chargeable, and close the slot. The teacher settles the charge in the [lesson credit ledger](CREDITS.md). Cancellation becomes terminal and releases the active booking key. A retry returns the original outcome.

`GET /api/schedule/bookings` gives students a `cancellationChargeApplies` preview. `POST /api/schedule/bookings/:id/cancel` accepts `{ acceptSameDayCharge: boolean }` and returns `id`, `cancelledAt`, and `chargeApplies`. The server recalculates the policy inside the transaction. A missing or foreign booking returns 404. A lesson that already started, or a same-day charge without acknowledgement, returns 409. The UI refreshes the preview after a conflict. The database persists the cancellation instant and charge classification together.

## Teacher cancellation

Before a booked lesson starts, the teacher can cancel it from Schedule. An optional reason of up to 200 characters is visible to the student. The default closes the slot. The teacher can choose to make it available again. Cancellation is terminal and never chargeable when initiated by the teacher. The booking and slot changes commit together using the existing calendar lock.

`POST /api/schedule/bookings/:id/teacher-cancel` accepts `{ reopenSlot: boolean, reason?: string }` and returns `{ id, cancelledAt, reopenedSlot, reason }`. A retry returns the original decision. Missing bookings return 404. A student cancellation, completion, or lesson already started returns 409. Student history identifies teacher cancellations as `CANCELLED_BY_TEACHER` and includes the shared reason when provided. Existing cancellations remain student cancellations.

## Teacher rescheduling

Before an active lesson starts, the teacher can move it to a different, open future slot. The teacher may reopen the previous slot. The default closes it. The change preserves the booking ID and student, and has no effect on the credit ledger. The calendar lock serializes the move against bookings and cancellations. Each move stores the actor, source and destination slot references, and the UTC change time. Slots preserve their original time intervals.

`POST /api/schedule/bookings/:id/reschedule` requires a teacher session and accepts `{ requestId, slotId, reopenPreviousSlot }`. It returns the immutable move record. Identical retries return that record even after another move. Reusing a request ID with different details returns 409. Missing records return 404. Started or terminal bookings, an unchanged destination, and a closed, past or occupied destination return 409. The existing booking routes include move history in upcoming lessons and student history. Original booking retries retain their existing booking and return its current slot.

Run `npm test` for route authorization checks. Set `TEST_DATABASE_URL` to an isolated, migrated PostgreSQL database to run the concurrency, ownership and retry checks.
