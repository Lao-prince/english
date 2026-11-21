# Architecture

Use a modular monolith in an npm workspace. A single Fastify application owns the domain and serves a REST API. React with Vite and Tailwind provides a mobile-first interface. PostgreSQL with Prisma provides transactional storage. One API and database keep booking, lessons and subscription operations within a transaction boundary.

## Delivery

- In development, Vite proxies /api to Fastify. In production, Nginx can serve static frontend assets and gateway /api under the same origin. Docker Compose on a VPS is the planned deployment. See the roadmap for delivery order.
- The Telegram Mini Apps SDK will provide launch context and theme integration. The server will validate signed initData and freshness before issuing an application session. Authenticated browser entry will use that same session model when an alternative identity method is selected.
- Teachers receive administrative permissions from server-controlled provisioning. Every protected route checks role and object access. The data layer scopes student queries to the session's user ID.
- grammY will handle bot updates and send notifications. Persist delivery jobs alongside business changes and process them outside request handling. Use a stable event key, bounded retries and recovery of abandoned claims. Document how to handle uncertain sends when Telegram may have accepted a message before a network timeout.
- Use responsive layouts, visible focus, accessible form feedback, Telegram theme support and local time display. Keep UI state separate from domain status.

The current API exposes GET /api/health for liveness. Feature contracts will be added alongside their implementation.
