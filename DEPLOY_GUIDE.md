# DamnMail Deployment Guide

## Status

| Komponen | Status | URL |
|----------|--------|-----|
| Frontend (Dashboard) | ✅ **LIVE** | https://readyonbooking.app |
| Telegram Bot | ✅ **TERKONFIGURASI** | Token & admin ID di .env |
| Backend (API + SMTP) | ⏳ **BELUM DEPLOY** | Butuh VPS |
| Database (PostgreSQL) | ⏳ **BELUM DEPLOY** | Di dalam Docker |

---

## 1. DNS Records — Cloudflare

Domain `readyonbooking.app` harus pakai nameserver Cloudflare (`cruz.ns.cloudflare.com`, `etienne.ns.cloudflare.com`).

### Yang SUDAH terpasang:
| Type | Name | Target | Keterangan |
|------|------|--------|------------|
| CNAME | `@` | `appwrite.network` | Frontend dashboard (Appwrite) |

### Yang PERLU ditambah (setelah dapat VPS):

| Type | Name | Target | Priority | Keterangan |
|------|------|--------|----------|------------|
| A | `api` | `<IP_VPS>` | - | Backend API |
| A | `mail` | `<IP_VPS>` | - | SMTP server |
| MX | `@` | `mail.readyonbooking.app` | 10 | Email masuk |
| TXT | `@` | `v=spf1 a mx ip4:<IP_VPS> ~all` | - | SPF (authorize pengirim) |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | - | DMARC policy |

**Catatan tentang Proxy (orange cloud di Cloudflare):**
- CNAME `@` → `appwrite.network` → **DNS only** (gray cloud)
- A record `api` & `mail` → **DNS only** (gray cloud) biar SMTP port 25 work

---

## 2. Backend Deployment (VPS + Docker)

### Step 1: Beli VPS

Rekomendasi VPS murah untuk SMTP (port 25 TIDAK diblokir):

| Provider | Harga | Spesifikasi | Catatan |
|----------|-------|-------------|---------|
| **DigitalOcean** | $6/bln | 1GB RAM, 25GB SSD | Port 25 buka |
| **Vultr** | $6/bln | 1GB RAM, 25GB SSD | Port 25 buka |
| **Hetzner** | €4/bln | 2GB RAM, 20GB SSD | Murah, bagus |
| **Netcup** | €3.50/bln | 2GB RAM, 32GB SSD | Termurah |

### Step 2: Install Docker di VPS

```bash
# SSH ke VPS
ssh root@<IP_VPS>

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose plugin
apt-get install -y docker-compose-plugin

# Clone project
git clone https://github.com/<username>/damnmail.git /opt/damnmail
cd /opt/damnmail
```

### Step 3: Setup .env

```bash
cp .env .env.production
nano .env.production
```

Update isinya:
```env
DOMAIN=readyonbooking.app
DOMAINS=readyonbooking.app
EMAIL_TTL_HOURS=24
API_PORT=3001
SMTP_PORT=2525
FRONTEND_URL=https://readyonbooking.app
DATABASE_URL=postgresql://postgres:postgres@db:5432/damnmail
TELEGRAM_BOT_TOKEN=8671473534:AAEAs_ZDcbsEHgXq2yZlOYAC3PsEfCQVj_Y
TELEGRAM_ADMIN_CHAT_IDS=434699276
SMTP_HOSTNAME=mail.readyonbooking.app
MAIL_STORAGE_MODE=database
ADMIN_API_KEY=6b085e3957df201616ac6c2766a663676dfeafc289fab029f331c7d99da20253
ATTACHMENT_STORAGE_DIR=./data/attachments
NEXT_PUBLIC_API_BASE_URL=https://api.readyonbooking.app
```

### Step 4: Jalankan dengan Docker

```bash
docker compose up -d
```

Ini akan menjalankan:
- **PostgreSQL** — database
- **Backend** — Fastify API (port 3001) + SMTP server (port 2525)
- **Caddy** — reverse proxy untuk SSL (port 80/443)

### Step 5: Setup Caddy (SSL)

Edit `Caddyfile`:
```
api.readyonbooking.app {
    reverse_proxy backend:3001
}

mail.readyonbooking.app {
    reverse_proxy backend:2525
}
```

Restart Caddy:
```bash
docker compose restart caddy
```

### Step 6: Update DNS di Cloudflare

Setelah VPS jalan, update DNS record:
- A `api` → `<IP_VPS>`
- A `mail` → `<IP_VPS>`
- MX `@` → `mail.readyonbooking.app` (priority 10)
- TXT `@` → `v=spf1 a mx ip4:<IP_VPS> ~all`
- TXT `_dmarc` → `v=DMARC1; p=none;`

---

## 3. Telegram Bot

**Sudah terkonfigurasi** di `.env`:
```
TELEGRAM_BOT_TOKEN=8671473534:AAEAs_ZDcbsEHgXq2yZlOYAC3PsEfCQVj_Y
TELEGRAM_ADMIN_CHAT_IDS=434699276
```

### Cara kerja:
- Bot akan aktif setelah backend di-deploy
- Ketik `/start` di Telegram → dapet menu
- Ketik `/generate` → pilih domain → dapet alamat email random
- Ketik `/create rahasia` → pilih domain → dapet `rahasia@readyonbooking.app`
- Semua email masuk akan diforward ke kamu (434699276) dan ke user yang punya inbox

### Admin (434699276):
Admin dapet notifikasi SEMUA email yang masuk ke SEMUA inbox.
User biasa cuma dapet notifikasi email untuk inbox mereka sendiri.

---

## 4. Cara Menambah Domain Lain

Project ini support multi-domain. Untuk nambah domain baru:

### A. Tambah Domain Baru

Edit `.env`:
```env
DOMAINS=readyonbooking.app,domainbaru.com,domain2.com
```

### B. Setup DNS di Cloudflare/Nameserver Domain Baru

Setiap domain baru perlu:

| Type | Name | Target | Priority |
|------|------|--------|----------|
| MX | `@` | `mail.readyonbooking.app` | 10 |
| TXT | `@` | `v=spf1 include:readyonbooking.app ~all` | - |

Atau alternatifnya, buat subdomain `mail.domainbaru.com` (A record ke IP VPS) dan MX ke situ.

### C. Restart Backend

```bash
docker compose restart backend
```

### D. Domain otomatis terdaftar

Domain baru akan muncul di frontend dashboard dan di Telegram bot sebagai pilihan.

---

## 5. Arsitektur End-to-End

```
User mengirim email ke random@readyonbooking.app
         │
         ▼
  ┌─ DNS: MX → mail.readyonbooking.app ──┐
  │                                       │
  ▼                                       │
SMTP Server (VPS:2525)  ◄─────────────────┘
  │ Validasi: domain aktif?
  │ Ya → Parse email, simpan ke DB
  │
  ├─► Event Bus ──► Telegram Bot → Notifikasi admin (434699276)
  │                                   → Notifikasi user (chatId inbox)
  │
  ├─► API Server (VPS:3001)
  │    │
  │    ▼
  │  Frontend (Appwrite)
  │  https://readyonbooking.app
  │    │
  │    ▼
  │  SSE Stream → Email muncul real-time di dashboard
  │
  └─► Database (PostgreSQL)
       ├─ domains
       ├─ inboxes
       ├─ emails
       └─ attachments
```

### Port yang digunakan:
| Port | Service | Protocol |
|------|---------|----------|
| 25 | SMTP incoming | TCP (dari internet) |
| 2525 | SMTP internal | TCP (dari Docker) |
| 3001 | API backend | HTTP |
| 5432 | PostgreSQL | TCP (internal) |
| 80/443 | Caddy/SSL | HTTP/HTTPS |

---

## 6. Admin API Key

Untuk akses endpoint admin:
```
x-admin-api-key: 6b085e3957df201616ac6c2766a663676dfeafc289fab029f331c7d99da20253
```

Endpoint admin:
- `GET /api/admin/health` — Cek status
- `POST /api/admin/domains` — Tambah/ubah domain
- `POST /api/admin/test-inbound` — Test email masuk
