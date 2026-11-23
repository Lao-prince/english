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

## Docker Compose on a shared VPS

Follow the [VPS deployment guide](docs/DEPLOYMENT.md) after pulling the project into its own checkout. Set `POSTGRES_PASSWORD`, `SESSION_SECRET`, and `TELEGRAM_BOT_TOKEN` in an untracked `.env`. The `english-space` project owns its network and PostgreSQL volume. Its only published port is [the Web endpoint](http://127.0.0.1:8088) on VPS loopback. Node.js 24 runs inside the application containers.

Start with `docker compose -p english-space up -d --wait` after validating the configuration and building the images. Stop with `docker compose -p english-space down` to preserve the database volume.

## Project map

- `apps/web` contains the React, TypeScript, Vite and Tailwind browser shell.
- `apps/api` contains the Fastify API and initial Prisma schema.
- `docs` contains the [product and MVP](docs/PRODUCT.md), [architecture](docs/ARCHITECTURE.md), [database model](docs/DATABASE.md), [user flows and open questions](docs/USER_FLOWS.md), [roadmap](docs/ROADMAP.md) and [decisions](docs/DECISIONS.md).
- [AGENTS.md](AGENTS.md) records development instructions.

The app supports Telegram authentication, student invitations and [one-off availability](docs/SCHEDULE.md). Students can [book a slot](docs/BOOKING.md) and see their upcoming lessons in local time. The teacher can view all upcoming reservations. See the [roadmap](docs/ROADMAP.md) for cancellation and the first pilot.
