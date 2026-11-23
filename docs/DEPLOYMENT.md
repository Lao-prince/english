# First VPS deployment

## 1. Check isolation before startup

Use a dedicated checkout, Docker Engine 28 or later, and a Docker Compose v2 plugin with `up --wait` support. Earlier Docker Engines have a known loopback publishing issue for hosts on the same layer-2 network. Check the server versions and the availability of TCP port 8088. [Docker port publishing](https://docs.docker.com/engine/network/port-publishing/)

```sh
docker version
docker compose version
docker compose ls --all
docker ps -a --filter label=com.docker.compose.project=english-space
docker network ls --filter name=english-space_english-space
docker volume ls --filter name=english-space_postgres-data
ss -ltn 'sport = :8088'
```

On a first installation, investigate any existing project resources with these names or listener on port 8088 before continuing. The dedicated project creates the `english-space_english-space` network and `english-space_postgres-data` volume. Leave existing projects and their resources intact. Run the remaining commands from the English Space checkout after `git pull`.

## 2. Prepare the environment

On first setup, create a private environment file. Preserve it on subsequent updates.

```sh
test ! -e .env && install -m 600 .env.example .env
openssl rand -hex 32
openssl rand -hex 32
```

Edit `.env` privately. Generate each value separately and keep the output out of shared terminals and logs.

| Variable | Value |
| --- | --- |
| `POSTGRES_PASSWORD` | The first 64-character hex value. Used only by the English Space PostgreSQL instance and its clients. |
| `SESSION_SECRET` | The second 64-character hex value. Used by the API to sign sessions. Changing it invalidates existing sessions. |
| `TELEGRAM_BOT_TOKEN` | In Telegram, use `/newbot` with BotFather to create the dedicated English Space bot. Paste its token into `.env`. [Telegram bot management](https://core.telegram.org/bots/features#botfather) |

Compose constructs `DATABASE_URL` for the API and migration service from the PostgreSQL password using `db:5432/english_space`. Keep the local-development `DATABASE_URL` example commented out. Use `config --quiet` because regular Compose config output includes interpolated credentials. Restrict access to Docker and the checkout since Docker administrators can inspect container environment variables. Run these commands from a shell without overrides for the three secrets.

## 3. Validate, build and start

```sh
docker compose -p english-space config --quiet
docker compose -p english-space build api
docker compose -p english-space build web
docker compose -p english-space up -d --wait
```

The images run Node.js 24. Sequential builds reduce peak memory on the 3.8 GB VPS. The memory ceilings total 2 GiB including the one-shot migration job and 1.5 GiB after it exits. Image builds use separate resources, so confirm headroom alongside the existing services. Compose starts PostgreSQL, waits for an authenticated health query, and runs `prisma migrate deploy`. A failed migration prevents the API and Web from starting. The API listens on port 3000 on the project network. The Web container listens on 8080 and is published on VPS loopback at 8088.

## 4. Check the migration and loopback service

```sh
docker compose -p english-space ps -a
docker compose -p english-space logs migrate
curl --fail --show-error http://127.0.0.1:8088/
curl --fail --show-error http://127.0.0.1:8088/api/health
```

Expect `db`, `api`, and `web` to be healthy, `migrate` to have exited with code 0, and the health endpoint to return `{"status":"ok"}`. The Web health check covers the page and the API proxy. The API health endpoint reports liveness. The browser page prompts for launch from Telegram until opened as a Mini App. For startup failures, inspect `docker compose -p english-space logs db migrate api web` and resolve the underlying error before retrying.

## 5. Connect the public URL and Telegram

Everything through the loopback checks works without a public HTTPS endpoint. The following steps are for public access and Telegram sign-in.

1. Point DNS for `english.sokolovportfolio.ru` at the VPS. Add an AAAA record only if the VPS serves that address over IPv6.
2. Add a dedicated virtual host to the host Nginx for that name and proxy all paths, including `/api/`, to `http://127.0.0.1:8088`. This upstream assumes Nginx runs on the VPS host. If the existing Nginx is containerized, confirm a host-side routing design before proceeding. Obtain a trusted TLS certificate, validate the Nginx configuration before reload, and keep the Compose port on loopback. Verify `https://english.sokolovportfolio.ru/` and `/api/health` before configuring Telegram.
3. In BotFather use `/setmenubutton` for the dedicated bot and give it the public URL `https://english.sokolovportfolio.ru/`. The production Mini App launch and end-to-end Telegram authentication require this public HTTPS URL. [Telegram Mini App menu button](https://core.telegram.org/bots/webapps#launching-mini-apps-from-the-menu-button)
4. Provision approved accounts in the API container, then open the Mini App through the bot menu and verify the account role. Replace the example arguments with the approved numeric Telegram IDs.

```sh
docker compose -p english-space exec api npm run user:provision -- teacher YOUR_TELEGRAM_ID
docker compose -p english-space exec api npm run user:provision -- student STUDENT_TELEGRAM_ID
```

After provisioning the teacher, new students can join using invitations issued in the Mini App. See [Student invitations](INVITATIONS.md) for optional direct-link setup.

## Stop or update

```sh
docker compose -p english-space down
```

This preserves the project database volume. Before an update, take a verified backup and build the replacement images before stopping the stack. Run the start and health checks again after shutdown to recreate the migration job and apply pending migrations before serving requests. PostgreSQL applies `POSTGRES_PASSWORD` during initial volume setup. Rotating it later requires changing the role password in PostgreSQL as well as the value in `.env`.
