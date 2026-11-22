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

## Docker Compose on a dedicated VPS

Use Docker Engine with the Docker Compose v2 plugin. The API and Web images use Node.js 24 LTS. The host only needs Docker and Compose to run the stack.

Copy `.env.example` to `.env` on the VPS and restrict access to it with `chmod 600 .env`. Set `POSTGRES_PASSWORD` to a 64-character hex value generated on that host with `openssl rand -hex 32`. Compose assembles the container database URL from that value. `DATABASE_URL` in the example is for local development. `WEB_PORT` defaults to 8080. Leave the Telegram settings blank for this setup.

### Start or update

```sh
docker compose config --quiet
docker compose up --build -d --wait
docker compose ps -a
curl --fail http://127.0.0.1:8080/api/health
```

Run these commands from the dedicated checkout. For updates, back up PostgreSQL first and run `docker compose down` before the start commands. This stops the old API before schema changes and recreates the migration job. Compose waits for PostgreSQL, runs `prisma migrate deploy`, then starts the API after a successful migration. The Web service starts after the API passes its health check. The `migrate` container should exit with code 0. If startup fails, inspect `docker compose logs db migrate api web`. Resolve a failed Prisma migration before retrying.

### Stop

```sh
docker compose down
```

The named volume persists across stops. Keep `--volumes` off the shutdown command to preserve the database. PostgreSQL applies its initialization password only when creating the database. Changing `.env` on an existing volume requires rotating the database role password as well.

### Operating limits

- The Web port listens on VPS loopback over HTTP. API and PostgreSQL ports stay on the Compose network. Telegram sign-in stays unavailable in this deployment configuration.
- Runtime memory ceilings total 2 GiB across all four containers, including the one-shot migration job. Image builds have separate resource usage. On a 3.8 GB host, build sequentially with `docker compose build api` and `docker compose build web` if the parallel build runs out of memory, then use `docker compose up -d --wait`.
- The API health check measures liveness. Compose marks failed probes unhealthy and restarts services when their process exits under the restart policy. Backups and monitoring are host operations.
- The Web server serves the current Vite HTML, CSS and JavaScript output and forwards `/api` on the same origin. Additional asset types, client-side routes or API headers may need corresponding server updates.

## Project map

- `apps/web` contains the React, TypeScript, Vite and Tailwind browser shell.
- `apps/api` contains the Fastify API and initial Prisma schema.
- `docs` contains the [product and MVP](docs/PRODUCT.md), [architecture](docs/ARCHITECTURE.md), [database model](docs/DATABASE.md), [user flows and open questions](docs/USER_FLOWS.md), [roadmap](docs/ROADMAP.md) and [decisions](docs/DECISIONS.md).
- [AGENTS.md](AGENTS.md) records development instructions.

The current release includes Telegram authentication and role-specific home screens. See the roadmap for scheduling and the first pilot.
