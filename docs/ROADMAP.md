# Roadmap

See the [new product brief rollout](PRODUCT-IMPLEMENTATION.md) for the audit, dependencies and open decisions.

| Phase | Scope |
| --- | --- |
| 0. Foundation | Local workspace, documentation, browser shell, API liveness and initial Prisma schema. |
| 1. Identity and core UI | Implemented manual provisioning, launch verification, signed sessions, initial migration and role-based screens. Live Mini App verification requires a configured bot, database and HTTPS URL. |
| 2. Schedule and booking | [One-off availability](SCHEDULE.md), [student booking and cancellation](BOOKING.md). Extend to recurrence and rescheduling once their policies are agreed. |
| 3. Students and subscriptions | [Student roster and search](STUDENTS.md), [lesson credits, expiring packages, settlement and debit reversals](CREDITS.md). |
| 4. Bot and notifications | [Telegram lesson reminders and date grouping](REMINDERS.md). Notification preferences and Zoom links follow. |
| 5. Payments | Manual records, confirmation, history and a later provider decision. |
| 6. Learning materials | Homework, summaries, file access controls and publication notifications. |
| 7. Delivery | Full workflow tests, production hardening and Docker Compose, Nginx and VPS deployment. |
