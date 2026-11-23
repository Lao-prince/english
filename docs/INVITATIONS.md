# Student invitations

An authenticated teacher creates an invitation in the Students section and shares it with one student. An unapproved student opens the Mini App and submits the code or arrives through a Telegram launch link. The server verifies Telegram launch data before accepting a code or reading a signed launch parameter. The resulting account has the Student role. Existing accounts keep their role and sign in normally.

An invitation is available for 24 hours, then expires or is redeemed once. PostgreSQL stores its hash, expiry, and redemption time. Redemption and account creation commit together. An account that retries after a successful commit signs in normally.

`POST /api/auth/invitations` requires a teacher session and returns `code`, `expiresAt`, and an optional `link`. It returns 401 for a missing or stale session and 403 for students. `POST /api/auth/telegram` accepts an optional `inviteCode` and can redeem a signed Telegram `start_param`. Missing access and unavailable invitations return 403. Invalid or stale Telegram launch data returns 401.

Set the optional `TELEGRAM_BOT_USERNAME` without `@` to provide shareable links. Enable the bot's Main Mini App in BotFather with the existing HTTPS URL for the links to open correctly. Codes also work from the existing menu button. [Telegram Main Mini App links](https://core.telegram.org/bots/webapps#launching-the-main-mini-app)

Set `TEST_DATABASE_URL` to an isolated, migrated PostgreSQL database to run the concurrent redemption test with `npm test`.
