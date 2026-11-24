# Calendar and one-hour lessons

The teacher and student can select a date from a Monday-first week strip or expand it to a month grid. Marked dates contain entries in the current view. Availability and bookings share the selected local date, and the lists show only entries starting on that date. A lesson crossing midnight still shows the end date. Users can return to today or jump to the next date with entries.

The teacher uses the selected date and a start time to publish a one-hour slot. The database still stores both UTC instants and the teacher's IANA time zone. Existing slots keep their stored durations. Publication accepts `durationMinutes: 60` for a new slot. Exact retries of old publications still return their original records. Other durations for new slots return 400, along with the existing validation for invalid or past times. Booking, cancellation and settlement rules are unchanged.

Telegram reminders are paused by default. The production API only starts the existing delivery worker when `LESSON_REMINDERS_ENABLED=true` is explicitly configured.
