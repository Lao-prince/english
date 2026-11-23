# Lesson reminders and day groups

The teacher and the booked student receive one private Telegram reminder each when an active booking is within one hour of starting. Bookings made less than one hour ahead are eligible on the next poll. The worker also covers bookings created before deployment. The message includes the date, time and time zone stored on the slot. Telegram participants must have opened a private conversation with the bot before it can message them. The app groups upcoming lessons and open slots by the viewer's local calendar date and shows a time range within each group. A lesson crossing midnight shows the end date as well.

The production API polls every 30 seconds. It discovers due deliveries, persists one row per booking and recipient, and claims a row before sending. Database uniqueness and row locking prevent duplicate claims. A claim moves from pending to sending, then to sent, failed, skipped, or unknown. Explicit Telegram rate limits move it back to pending at least as late as Telegram requested, up to three attempts. Cancelled or started lessons are skipped. The worker checks the booking again before sending. A cancellation can still race an HTTP request already in progress.

A timeout, lost response, unexpected server response, or process exit during a send leaves the delivery unknown. The worker does not resend an unknown delivery, because Telegram may already have delivered it. A definitive rejection stays failed. No new public API, bot polling, settings or credentials are needed. The worker uses the existing bot token and never logs it or the Telegram response body.

[Telegram Bot API message delivery and rate limits](https://core.telegram.org/bots/api#sendmessage)
