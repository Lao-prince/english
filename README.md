# English Space

A personal teaching workspace for one English teacher and their students. Telegram is the primary entry point. The frontend also opens in a regular browser.

## Local development

Install Node.js 24 and npm, then run:

```sh
npm install
npm run build
```

Start the API and web app in separate terminals:

```sh
npm run dev:api
npm run dev:web
```

Open [the web app](http://localhost:5173) and check [API health through the web proxy](http://localhost:5173/api/health). Both can run without PostgreSQL. The health route reports API liveness only.

To validate the initial Prisma schema, copy `.env.example` to `.env` and run `npm run db:validate`. Schema validation needs a database URL but does not connect to the database. Migrations start with the authentication milestone.

## Project map

- `apps/web` contains the React, TypeScript, Vite and Tailwind browser shell.
- `apps/api` contains the Fastify API and initial Prisma schema.
- `docs` contains the [product and MVP](docs/PRODUCT.md), [architecture](docs/ARCHITECTURE.md), [database model](docs/DATABASE.md), [user flows and open questions](docs/USER_FLOWS.md), [roadmap](docs/ROADMAP.md) and [decisions](docs/DECISIONS.md).
- [AGENTS.md](AGENTS.md) records development instructions.

Phase 0 includes the browser shell, API health endpoint and initial identity schema. See the roadmap for feature availability.
