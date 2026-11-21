# User flows

1. A user opens the Telegram Mini App. The API validates launch data and finds the account. The app directs the user to the teacher or student home. Unverified and unapproved users receive a clear access state.
2. The teacher enters start time and duration in their calendar time zone. The API validates the interval and publishes the slot. The teacher can close an unbooked slot.
3. A student selects a slot shown in their local time zone and confirms. The server checks availability and creates the booking and lesson atomically. If another student booked it first, the app reloads availability and keeps the student on the selected date.
4. A student requests cancellation. The server verifies ownership and applies the agreed cutoff. The UI reflects cancellation and any applicable credit change. Teacher overrides are recorded when supported.

## Decisions before business logic

- How is the first teacher account provisioned? Do students join by invitation, self-register for approval, or both?
- What is the teacher's IANA time zone? What durations, buffers, lead times and booking horizon apply? Can teacher availability overlap?
- What is the cancellation and rescheduling cutoff? When should a cancelled slot reopen, and who may override the policy?
- Does booking require a paid subscription? When do completion, late cancellation and no-show consume a credit? Can credits expire, roll over or be reinstated?
- Which currency, country and manual payment methods apply? Who confirms payments and refunds?
- When should reminders and Zoom links be sent? Does the teacher use one recurring link or per-lesson links?
- Which sign-in method should support authenticated browser access? What retention rules apply to files, notes and student records?
