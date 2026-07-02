# DamnMail

DamnMail is multi-domain temporary mail platform with Fastify backend, SMTP catch-all listener, Next.js dashboard, Telegram bot, SSE inbox streaming, Prisma/PostgreSQL production path, attachment persistence, and admin API key protection.

## Stack
- Backend: Fastify + smtp-server + mailparser + sanitize-html + grammY
- Frontend: Next.js 15 + TailwindCSS
- Realtime: Server-Sent Events
- Storage: memory for local dev, Prisma/PostgreSQL for production
- Attachments: persisted to `ATTACHMENT_STORAGE_DIR`
- Reverse proxy: Caddy

## Features
- Multi-domain temp inbox generator with root-domain dropdown
- Random or custom username inbox creation
- Real-time inbox updates without refresh
- Multipart/Base64/Quoted-Printable parsing via `mailparser`
- Sanitized HTML email rendering
- Attachment download endpoint
- Telegram admin broadcast for all inbound mail
- Telegram user utility for domain-based temp inbox creation
- Admin endpoints protected by `x-admin-api-key`
- Dynamic domain add/remove via admin endpoint
- Docker and compose deployment path

## Project Structure
- `apps/backend` — API, SMTP server, parser, bot, storage adapters, Prisma
- `apps/frontend` — one-page dashboard UI
- `packages/shared` — shared types/constants/utils
- `Dockerfile.backend` — production backend image
- `Dockerfile.frontend` — production frontend image
- `docker-compose.yml` — postgres + backend + frontend + caddy
- `Caddyfile` — reverse proxy example

## Environment
Copy `.env.example` to `.env`.

Important keys:
- `DOMAINS=apadeh.me,damnmail.com,wadooh.cx`
- `MAIL_STORAGE_MODE=memory` for local quick run
- `MAIL_STORAGE_MODE=database` for PostgreSQL path
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/damnmail`
- `ADMIN_API_KEY=change-me`
- `ATTACHMENT_STORAGE_DIR=./data/attachments`
- `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001`
- `TELEGRAM_BOT_TOKEN=`
- `TELEGRAM_ADMIN_CHAT_IDS=123456789`

## Local Run
```bash
corepack pnpm install
copy .env.example .env
corepack pnpm --filter @damnmail/backend prisma:generate
corepack pnpm -r build
corepack pnpm dev
```

URLs:
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:3001`
- SMTP: `localhost:2525`

## Prisma Commands
```bash
corepack pnpm --filter @damnmail/backend prisma:generate
corepack pnpm --filter @damnmail/backend prisma:migrate:dev
corepack pnpm --filter @damnmail/backend prisma:migrate:deploy
corepack pnpm --filter @damnmail/backend prisma:seed
```

Recommended production order:
1. Set `MAIL_STORAGE_MODE=database`
2. Set valid `DATABASE_URL`
3. Run `prisma:migrate:deploy`
4. Run `prisma:seed`
5. Start containers or services

## Public API
- `GET /api/domains`
- `POST /api/inboxes`
- `GET /api/inboxes/:address/messages`
- `GET /api/inboxes/:address/stream`
- `GET /api/attachments/:attachmentId`

## Admin API
Pass header:
```http
x-admin-api-key: change-me
```

Endpoints:
- `GET /api/admin/health`
- `POST /api/admin/domains`
- `POST /api/admin/test-inbound`

Add domain example:
```bash
curl -X POST http://localhost:3001/api/admin/domains ^
  -H "Content-Type: application/json" ^
  -H "x-admin-api-key: change-me" ^
  -d "{\"domain\":\"newdomain.com\",\"isActive\":true}"
```

## Testing
Run regression tests:
```bash
corepack pnpm test
```

Current coverage targets:
- Domain allow-list behavior
- Storage-backed inbox creation
- Message insertion ordering
- HTML sanitization behavior

## SMTP Testing From Local
Using `swaks`:
```bash
swaks --server 127.0.0.1:2525 --to demo@apadeh.me --from sender@example.com --header "Subject: Test DamnMail" --body "Hello from swaks"
```

## DNS Setup For Multi-Domain
For each root domain:
1. Point `A` record of mail host to VPS IP.
   - `mail.apadeh.me -> <VPS_IP>`
   - `mail.damnmail.com -> <VPS_IP>`
2. Point MX record of root domain to mail host.
   - `apadeh.me MX 10 mail.apadeh.me`
   - `damnmail.com MX 10 mail.damnmail.com`
3. Add SPF record.
   - `v=spf1 mx ~all`
4. Recommended: add DKIM and DMARC for reputation and policy.
5. Open ports `25`, `80`, `443`. Keep `3001` internal behind proxy if possible.

## Docker Deployment
1. Copy `.env.example` to `.env`
2. Set production domains and `ADMIN_API_KEY`
3. Set `MAIL_STORAGE_MODE=database`
4. Set valid `DATABASE_URL` pointing at compose postgres service or managed database
5. Edit `Caddyfile` hostname from `damnmail.example.com` to real domain
6. Start stack:
```bash
docker compose up --build -d
```
7. Run migrations inside backend container:
```bash
docker compose exec backend corepack pnpm --filter @damnmail/backend prisma:migrate:deploy
docker compose exec backend corepack pnpm --filter @damnmail/backend prisma:seed
```
8. Frontend container serves production build via `next start`; no dev server in compose.

## Runtime Notes
- Use port `25` for public SMTP on VPS in production.
- Compose example exposes `2525` for easier dev/test; map `25:2525` or configure direct `25` listener in production if provider allows it.
- Persist `./data` because attachments live there.
- Rotate `ADMIN_API_KEY` regularly.
- Add abuse controls and rate limiting before public launch.
- Consider object storage for attachments when traffic grows.
- Use webhook mode for Telegram if long-polling becomes limiting.
- Frontend Docker image runs `next start` because Windows standalone tracing can fail on local symlink creation.

## Verification
Known-good commands:
```bash
corepack pnpm install
corepack pnpm -r build
corepack pnpm test
```
