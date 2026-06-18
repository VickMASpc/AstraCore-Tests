# Deployment

## Local Production-Like Run

1. Create `.env` from `.env.example`.
2. Set `GEMINI_API_KEY`.
3. Set `OWNER_NUMBERS`.
4. Create `data/`.
5. Run:

```bash
npm ci
npm run build
npm start
```

## Docker

```bash
docker compose up --build
```

Persistent data is stored in `./data`:

- SQLite database
- WhatsApp multi-file auth state

## Health Endpoints

When `PUBLIC_STATUS_SERVER=true`:

- `GET /health` returns `{ "ok": true, "connected": boolean }`
- `GET /` returns connection status and optional QR payload when `WHATSAPP_PRINT_QR=true`

## Production Notes

- Keep `.env` out of version control.
- Use a process supervisor or container restart policy.
- Restrict host access to the status endpoint if it is internet-facing.
- Rotate WhatsApp auth data and Gemini secrets through your deployment platform, not by editing tracked files.

## PostgreSQL Later

Current runtime is SQLite-only. For a PostgreSQL migration later:

- add a dedicated Drizzle PostgreSQL client
- preserve table separation between AI and RPG
- migrate audit and analytics tables with hashed identifiers
- validate transaction and locking behavior under concurrent message load
