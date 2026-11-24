# Student roster

## Telegram profile

Telegram Mini Apps receive the signed user's own profile, subject to photo privacy. They have no access to the teacher's local contact names. A teacher-assigned display name takes priority over the verified Telegram name. Without either, the UI uses the Telegram username or an unnamed label. Scheduled lessons and roster actions show the same identity.

On sign-in or a fresh signed launch with a restored student session, the API updates the approved student's profile. The server verifies the launch and its Telegram ID before writing. A newer launch replaces the name, username and photo URL snapshot. Missing fields clear the corresponding values. Existing students start with nullable fields. The app permits HTTPS Telegram userpic URLs and uses initials or an icon when a photo is unavailable or fails to load.

`POST /api/auth/profile` accepts `{ initData }` under a current student session, checks that the verified launch belongs to that session, and returns 204. Invalid, stale or mismatched identity returns 401. Teacher-only roster and upcoming lesson responses expose the profile. Students do not receive another student's data. The teacher may open a public Telegram profile when a verified username is available.

[Telegram Mini App user data](https://core.telegram.org/bots/webapps#webappuser) · [Telegram contact API](https://core.telegram.org/method/contacts.getContacts)

The teacher opens Students to see all provisioned and invited student accounts. The roster shows a teacher-assigned display name, Telegram ID when available, and account creation date. The teacher can search locally by name or Telegram ID and set or clear the display name. An unnamed record remains visible. The name also appears in the teacher's upcoming lessons. It is private to the teacher and has no effect on identity or access.

An existing student moves between unnamed and named states. A nullable column on User stores the name. Existing accounts start unnamed. The teacher can replace or clear it. Repeating the same request leaves the same visible name.

- `GET /api/students` returns an array of `{ id, displayName, telegramId, createdAt }`, newest first. Telegram IDs are strings. Missing values are null.
- `PATCH /api/students/:id` accepts `{ displayName: string | null }` and returns the updated roster entry. Names are trimmed and accept 1–80 characters. Send null to clear.
- Both routes require a current teacher session and set `Cache-Control: no-store`. Missing sessions return 401 and students receive 403. A malformed ID or name returns 400. A missing student or teacher ID returns 404.
- Invitation creation stays in the same section. The teacher can refresh the roster after a student joins.
