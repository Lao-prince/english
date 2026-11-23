# Student roster

The teacher opens Students to see all provisioned and invited student accounts. The roster shows a teacher-assigned display name, Telegram ID when available, and account creation date. The teacher can search locally by name or Telegram ID and set or clear the display name. An unnamed record remains visible. The name also appears in the teacher's upcoming lessons. It is private to the teacher and has no effect on identity or access.

An existing student moves between unnamed and named states. A nullable column on User stores the name. Existing accounts start unnamed. The teacher can replace or clear it. Repeating the same request leaves the same visible name.

- `GET /api/students` returns an array of `{ id, displayName, telegramId, createdAt }`, newest first. Telegram IDs are strings. Missing values are null.
- `PATCH /api/students/:id` accepts `{ displayName: string | null }` and returns the updated roster entry. Names are trimmed and accept 1–80 characters. Send null to clear.
- Both routes require a current teacher session and set `Cache-Control: no-store`. Missing sessions return 401 and students receive 403. A malformed ID or name returns 400. A missing student or teacher ID returns 404.
- Invitation creation stays in the same section. The teacher can refresh the roster after a student joins.
