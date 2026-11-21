# Telegram identity

The pilot uses a server-managed allowlist. An operator provisions the teacher and each student by numeric Telegram ID before their first launch. Re-running provisioning for the same role is safe. Switching roles requires an explicit database operation. A PostgreSQL index enforces the single-teacher limit.

| Request | Result |
| --- | --- |
| POST /api/auth/telegram with a JSON initData string | Verify Telegram's bot-token HMAC and freshness, look up the Telegram ID, return a signed eight-hour bearer token. |
| GET /api/auth/me | Verify the Authorization bearer token, look up the current account by ID, return its ID and role. |

Malformed request bodies return 400. Invalid or expired credentials return 401. Valid Telegram users outside the allowlist receive 403. Unconfigured authentication returns 503 at sign-in. The app restores an existing session before exchanging launch data. Browser visitors without a Telegram session see instructions to open the Mini App.

The frontend keeps the token in per-tab session storage and uses memory when storage is unavailable. Authorization headers work in Telegram WebViews without relying on third-party cookies. Serve the app over HTTPS and treat the token as a secret. Auth responses are private and non-cacheable. The database remains the authority for access and roles. Each launch payload can be exchanged during its five-minute validity window, so it must be kept out of logs and URLs. Future state-changing routes must enforce role and ownership.
