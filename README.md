# Softspace

A cozy chat home for the LGBTQ+, femboy and furry community.
Built fully open-source. Self-hostable. Real text + voice + video. No placeholder.

- **Backend** Node.js 20 · Express · Socket.io · Prisma · PostgreSQL
- **Frontend** Vite · React · TypeScript · TailwindCSS · zustand · react-i18next
- **Voice/Video** WebRTC peer-to-peer mesh
- **Languages** English & Deutsch
- **Deploy** Docker Compose + nginx (with Let's Encrypt ready)

---

## Local development (Windows / macOS / Linux)

You need Node.js 20+ installed.

```bash
# 1. Install deps
npm install
npm --prefix server install
npm --prefix client install

# 2. Server env (the dev database is SQLite, no Postgres required)
cd server
cp .env.example .env
# (Windows PowerShell: Copy-Item .env.example .env)
npx prisma migrate dev
cd ..

# 3. Run both apps in parallel
npm run dev
```

Then open http://localhost:5173 (frontend). The API runs on http://localhost:4000.

### Switching dev DB to PostgreSQL

If you want to mirror production locally:

1. Start Postgres: `docker compose up -d db`
2. In `server/.env` set `DATABASE_URL=postgresql://softspace:softspace@localhost:5432/softspace`
3. In `server/prisma/schema.prisma` set `provider = "postgresql"`
4. `npm --prefix server run db:migrate:dev`

---

## Production deployment

The included `docker-compose.yml` runs four containers behind nginx:
`db` (PostgreSQL), `server`, `client` (static React build), `proxy` (nginx + certbot).

### One-time setup on your server

1. Copy this repo to your server (e.g. `/srv/softspace`).
2. Point your domain (e.g. `softspace.cc`) at the server's IP via DNS A/AAAA records.
3. Edit `nginx/conf.d/softspace.conf` and replace every `softspace.cc` with your real domain.
4. Create the env file:

   ```bash
   cp .env.example .env
   $EDITOR .env
   ```

   Fill at least `JWT_SECRET` (use `openssl rand -hex 48`), `POSTGRES_PASSWORD`,
   `CLIENT_ORIGIN`, `VITE_API_URL`, `VITE_SOCKET_URL`, `DOMAIN`, `ACME_EMAIL`.

5. First-time start without TLS:

   ```bash
   docker compose up -d --build db server client proxy
   ```

6. Get a Let's Encrypt cert. With DNS pointed at the box and the proxy container running:

   ```bash
   docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
     -d softspace.cc -d www.softspace.cc \
     --email "$ACME_EMAIL" --agree-tos --no-eff-email
   ```

7. Uncomment the `ssl_certificate` lines in `nginx/conf.d/softspace.conf`, then:

   ```bash
   docker compose restart proxy
   ```

8. Make sure `certbot` runs in the background to auto-renew (the compose service
   is already wired for it).

### Updating the deployment

```bash
git pull
docker compose build server client
docker compose up -d server client
```

The server container automatically runs `prisma migrate deploy` on boot.

---

## Project layout

```
softspace/
├── client/            # React + Vite frontend (TypeScript)
│   ├── src/
│   │   ├── components/   # Sidebar, ChatArea, VoiceChat
│   │   ├── pages/        # Landing, Auth, Friends, Settings, Invite, ...
│   │   ├── store/        # Zustand state slices
│   │   ├── lib/api.ts    # Central API + Socket URL
│   │   └── i18n.ts       # English + Deutsch translations
│   └── Dockerfile
├── server/            # Express API + Socket.io (JavaScript ESM)
│   ├── prisma/        # Schema + migrations
│   ├── src/
│   │   ├── routes/    # auth, users, servers, channels, messages, dms, friends, invites, uploads
│   │   ├── socket/    # Realtime + WebRTC signaling
│   │   ├── lib/       # auth, prisma, validators, permissions, serializers
│   │   └── middleware/
│   └── Dockerfile
├── nginx/             # Reverse proxy config + ACME paths
├── docker-compose.yml
└── README.md
```

---

## Features

| Area | Implemented |
| --- | --- |
| Email/username register & login | ✅ |
| JWT sessions persisted in DB | ✅ |
| Profile (display name, bio, pronouns, identity tags, accent color, avatar) | ✅ |
| Servers (create, edit, delete, leave, kick, owner controls) | ✅ |
| Roles & permission bitfield | ✅ (default + admin role) |
| Text channels with categories | ✅ |
| Realtime messages (Socket.io) | ✅ |
| Edit / delete / reply / reactions | ✅ |
| File uploads (images, video, audio, PDFs up to 25 MB) | ✅ |
| Direct messages (1:1 and group) | ✅ |
| Friends + incoming/outgoing requests + block | ✅ |
| Server invite links with expiry & uses | ✅ |
| Voice channels (WebRTC mesh) with mute/deafen | ✅ |
| Video & screen share | ✅ |
| English / Deutsch UI | ✅ |
| Dark theme tuned for the community | ✅ |

For groups larger than ~8 in voice, swap the WebRTC mesh for a dedicated SFU
(e.g. mediasoup, LiveKit). The signaling protocol stays the same.

---

## Security notes

- Passwords are hashed with bcrypt (cost 12).
- HTML in messages is stripped server-side; only plain text is stored and rendered.
- File uploads are restricted to a configured MIME set and 25 MB by default.
- Sessions live in DB and are revocable on logout.
- Set a long `JWT_SECRET` in production. The server refuses to start in production
  with a missing or weak secret.
- nginx proxies Socket.io with proper `Upgrade` headers; never run the API on a
  bare port that's exposed to the internet — always go through the proxy.

---

## Contributing

Pull requests welcome. Be kind. We don't do bigotry here.

License: MIT.
