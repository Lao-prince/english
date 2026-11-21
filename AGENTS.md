# English Space development instructions

- Work in English and keep the project focused on one teacher.
- Follow the phased roadmap. Before implementing a major feature, document the actor, state transitions, business rules, persistence changes, API contract and failure cases.
- Keep TypeScript strict. Separate domain rules from HTTP routes and UI. Validate inputs at the API boundary and enforce role and ownership on the server.
- Keep secrets in environment variables and document keys with safe examples. Derive Telegram identity from server-verified initData.
- Use transactions and database constraints for booking exclusivity and subscription debits. Add automated tests for critical rules, including concurrent booking and retried mutations.
- Store instants in UTC and display them in the viewer's time zone. Keep the teacher's IANA time zone for calendar input and recurrence.
- Update the matching documents in docs/ when contracts or decisions change. Use synthetic fixtures without realistic personal data.
- Keep deployment, remote publication and real payment or bot credentials outside Phase 0.
