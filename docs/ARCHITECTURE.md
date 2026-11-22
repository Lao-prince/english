# Architecture

Use a modular monolith in an npm workspace. A single Fastify application owns the domain and serves a REST API. React with Vite and Tailwind provides a mobile-first interface. PostgreSQL with Prisma provides transactional storage. One API and database keep booking, lessons and subscription operations within a transaction boundary.

## Delivery

- In development, Vite proxies /api to Fastify. The VPS Compose setup uses a Node.js Web container to serve the Vite build and proxy /api to Fastify on the same origin. The host publishes only the Web port at `127.0.0.1:8088`. See the [deployment guide](DEPLOYMENT.md) for loopback checks and public HTTPS setup.
- Telegram's frontend SDK supplies the launch context. The server validates signed initData and freshness before issuing an application session. Telegram theme integration follows. Authenticated browser entry will use that same session model when an alternative identity method is selected.
- Teachers receive administrative permissions from server-controlled provisioning. Every protected route checks role and object access. The data layer scopes student queries to the session's user ID.
- grammY will handle bot updates and send notifications. Persist delivery jobs alongside business changes and process them outside request handling. Use a stable event key, bounded retries and recovery of abandoned claims. Document how to handle uncertain sends when Telegram may have accepted a message before a network timeout.
- Use responsive layouts, visible focus, accessible form feedback, Telegram theme support and local time display. Keep UI state separate from domain status.

The API exposes GET /api/health for liveness and the [Telegram identity routes](IDENTITY.md) for authentication.
