# Decisions

| Decision | Rationale |
| --- | --- |
| One npm workspace with web and API packages | A single repository provides clear build boundaries without adding orchestration. |
| Fastify REST API with PostgreSQL and Prisma | The proposed stack supports one transactional boundary for scheduling and credits. PostgreSQL-specific constraints can live in reviewed SQL migrations. |
| React and Vite with Tailwind | Supports a mobile-first browser app shared by Telegram and desktop. |
| UTC instants and IANA time zones | Instants make bookings unambiguous. IANA zones preserve calendar rules across time changes. |
| Separate availability, bookings and lessons | Availability can be published before assignment, booking history can outlive slot occupancy, and lessons can track attendance and materials. |
| Defer grammY, the Telegram SDK and deployment dependencies | Add them in the phases that implement and exercise those integrations. |
