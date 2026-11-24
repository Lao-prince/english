# Product brief audit and rollout

English Space uses a React and Vite client with role-filtered query navigation. Fastify verifies Telegram launch data, issues signed sessions, and uses Prisma with PostgreSQL. Compose runs the existing API, Web and database. The Telegram sender is shared by the reminder worker, which is paused by default. The test suite includes Fastify route injection and optional isolated PostgreSQL integration tests.

| Area | Existing | Needed |
| --- | --- | --- |
| Identity | Telegram sessions, one teacher, invitations, display names and signed student profile metadata | Expanded teacher-facing student profile and preferences |
| Calendar | One-hour slots, date picker, atomic self-booking and student cancellation | Slot visibility and editing, personal offers, teacher booking, teacher cancellation and reschedule history |
| Lessons | Upcoming lists and settled lesson debits | Student home and history, explicit completion independent of credit, no-show policy if wanted |
| Subscription | Credit ledger, dated grants, expiry, reversal and settlement | Named package lifecycle, queued renewals, booking coverage, payment records and a teacher-wide view |
| Notifications | Existing Telegram sender and paused reminder worker | Result notifications persisted with successful mutations, delivery tracking and an agreed reminder policy |

## Data and rollout

1. Ship the student home, read-only history, and subscription navigation using the existing records. No migration.
2. Booking completion is stored explicitly and backfilled from completed-lesson debits. Unsettled historical lessons remain unconfirmed. Teacher cancellation records the actor role, optional shared reason and reopening decision. Teacher rescheduling records a history of both time intervals while keeping the original booking ID.
3. Add explicit package and manual payment records while retaining the credit ledger. Migrate current dated grants without assuming prices or payments. Define booking coverage and pending reservations before adding the per-student override or enforcing limits.
4. Teacher booking uses the existing calendar transaction and active-booking uniqueness. Add personal offers with one active reservation per slot and role-scoped accept, decline, expiry and revoke flows.
5. Persist notification intents with the relevant mutations and deliver through the existing bot. Preserve the paused reminder policy until it is agreed separately.

## Decisions before changing policy

- The operator confirmed that same-day cancellations remain chargeable through manual settlement. Existing pending charges remain eligible.
- The brief calls for start and end times and for reminders. The previous request fixed new lessons to one hour and paused reminders. Keep those settings pending clarification. Transaction notifications are a separate product feature.
- Decide whether each upcoming booking reserves a credit and which funding is valid at the lesson time. Decide the default booking override for existing students before enforcing a restriction.
- Confirm the payment currency, partial payment rules and the trigger for activating a queued renewal. Decide whether offer expiry defaults to a specific interval or just the lesson start.

## First slice contract

The student opens Lessons by default, sees the nearest upcoming lesson and can switch between all upcoming lessons and a selected date. Existing confirmation and cancellation actions remain available. Booking and Subscription are separate views using the existing schedule and ledger. The teacher uses Schedule for bookings and Slots for availability.

`GET /api/schedule/bookings/history` requires a current student session. It returns up to 30 of that student's most recent cancelled or explicitly completed lessons, ordered by start time and ID, with timestamps and a status of `COMPLETED`, `CANCELLED_BY_STUDENT`, or `CANCELLED_BY_TEACHER`. A reversal changes the credit record, while the completed lesson remains in history. A past time alone cannot prove a lesson was conducted. Missing sessions return 401, and teacher sessions return 403 on this student-only endpoint.
