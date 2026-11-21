# English Space

A personal teaching workspace for one English teacher and their students. Telegram is the primary entry point. The frontend also opens in a regular browser.

## Local development

Install Node.js 24 and npm, then run:

```sh
npm ci
npm run build
```

Start the API and web app in separate terminals:

```sh
npm run dev:api
npm run dev:web
```

Open [the web app](http://localhost:5173) and check [API health through the web proxy](http://localhost:5173/api/health). Both can run without PostgreSQL. The health route reports API liveness only.

## Telegram sign-in

Use an empty PostgreSQL database for the initial migration. Copy `.env.example` to `.env`, set `DATABASE_URL` and `TELEGRAM_BOT_TOKEN`, and generate `SESSION_SECRET` with `openssl rand -hex 32`. Restart the API after changing configuration.

```sh
npm run db:generate
npm run db:validate
npm run db:migrate
npm run user:provision -- teacher YOUR_TELEGRAM_ID
npm run user:provision -- student STUDENT_TELEGRAM_ID
npm test
```

Configure the bot's Mini App to point to the app's public HTTPS URL. Open it from Telegram with an approved account. The teacher and student see different home screens. See [Telegram identity](docs/IDENTITY.md) for the API and access rules.

## Project map

- `apps/web` contains the React, TypeScript, Vite and Tailwind browser shell.
- `apps/api` contains the Fastify API and initial Prisma schema.
- `docs` contains the [product and MVP](docs/PRODUCT.md), [architecture](docs/ARCHITECTURE.md), [database model](docs/DATABASE.md), [user flows and open questions](docs/USER_FLOWS.md), [roadmap](docs/ROADMAP.md) and [decisions](docs/DECISIONS.md).
- [AGENTS.md](AGENTS.md) records development instructions.

The current release includes Telegram authentication and role-specific home screens. See the roadmap for scheduling and the first pilot.
