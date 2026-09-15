# Rent Ledger

A self-hosted web app that replaces a landlord's Google Sheet workflow for generating monthly rent & utilities invoices — tenant records, invoice history, and a printable PDF invoice with a dynamic UPI QR code.

## Features

- **Tenant management** — active/inactive (moved-out) tenants, per-tenant documents (lease, ID proof, photos), rates, UPI ID, phone.
- **New invoice** — auto-fills start readings from the last invoice and previous dues from the last unpaid invoice; live-computed preview; saved as an immutable snapshot.
- **Invoice history** — per tenant, toggle paid/unpaid, re-download any past invoice's PDF (always renders from its own saved snapshot, never today's rates), delete mistaken entries.
- **Invoice PDF** — server-rendered (WeasyPrint), blue-and-white printable design matching the reference layout, with a dynamic UPI QR code (amount pre-filled).
- **Send via WhatsApp** — opens a prefilled `wa.me` chat with the tenant; download the PDF first and attach it manually (WhatsApp click-to-chat links can't attach files).
- **Tenant portal** — each tenant gets their own read-only login (self-registered via a landlord-issued invite link) to view and download their own invoice history.

## Tech stack

| Layer | Choice |
|---|---|
| Backend | FastAPI (Python), SQLAlchemy, SQLite (WAL mode) |
| PDF/QR | WeasyPrint (Jinja2 HTML → PDF), `qrcode` |
| Auth | JWT, two roles: admin (landlord) and tenant (portal) |
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Packaging | Single Docker image (backend serves the built frontend) |

## Quick start — standalone / local dev (no Docker)

Windows: just run `.\start.ps1`. First run creates a Python venv, installs backend + frontend dependencies, generates a dev `.env` (random `JWT_SECRET` + a random admin password, printed once to the console), runs migrations/seed, and launches the backend and frontend each in their own window so you can see their logs live. Stop both with `.\stop.ps1`.

```
.\start.ps1     # first run takes a minute (installs deps); prints the app URL + admin password
.\stop.ps1      # stops both processes cleanly
```

Then open `http://localhost:5173` and sign in with the admin username/password printed by `start.ps1` (also saved in `.env` at the repo root if you need it again).

PDF generation needs WeasyPrint's system libraries (pango/cairo/gdk-pixbuf), which aren't installed by default on native Windows — everything except downloading PDFs still works in standalone mode; PDFs work once you run via Docker (see `DEVELOPER.md`).

To do the same by hand (any OS), or if you're not on Windows:

Backend:
```
python -m venv .venv && .venv\Scripts\activate  # or source .venv/bin/activate on macOS/Linux
pip install -r backend/requirements.txt
# set JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD, e.g. via a .env file at the repo root (see core/config.py)
python -m backend.migrate
python -m backend.seed
uvicorn backend.main:app --reload --port 8000
```

Frontend (separate terminal):
```
cd frontend
npm install
npm run dev
```
Visit `http://localhost:5173` — the Vite dev server proxies `/api` to `http://localhost:8000`.

## Docker — for the actual self-hosted deployment

1. Copy `.env.example` to `.env` and fill in `JWT_SECRET` (`openssl rand -hex 32`), `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
2. `docker compose up -d --build`
3. Open `http://localhost:8006`, sign in with the admin credentials from `.env`.
4. Stop with `docker compose down` (data stays on its volumes); `docker compose down -v` also deletes the volumes — back up first, see below.

`start.ps1`/`stop.ps1` are for local dev only (standalone mode, no Docker) — use the `docker compose` commands above for the deployed instance.

## Persistence & backups — read this before self-hosting

All state lives on two named Docker volumes:

| Volume | Contains | Mounted at |
|---|---|---|
| `app_data` | The SQLite database file (`app.db`) | `/app/data` |
| `uploads_data` | Tenant documents, the property photo | `/app/uploads` |

`docker compose down` (without `-v`) and image rebuilds/redeploys never touch these volumes — data survives. Only `docker compose down -v` deletes them.

**Back these up regularly** — this is the landlord's only source of invoice history:
```
./scripts/backup.sh            # Linux/macOS/WSL — writes ./backups/rentledger-backup-<date>.tar.gz
.\scripts\backup.ps1           # Windows PowerShell
```
Restore with `./scripts/restore.sh <path-to-backup.tar.gz>` (stop the app first). A quick partial option for just the DB: `docker cp rent-ledger:/app/data/app.db ./backup.db`.

## Documentation

- [`DEVELOPER.md`](./DEVELOPER.md) — architecture, file map, environment variables, how-tos, security notes.
- [`AI_GUIDE.md`](./AI_GUIDE.md) — full schema, API reference, business rules (for an AI agent working on this codebase).
- [`AI_SETUP.md`](./AI_SETUP.md) — literal install runbook.
- [`AGENTS.md`](./AGENTS.md) — terse conventions/gotchas for a coding agent.

## Roadmap (not built yet)

Tenant meter-reading submission: tenants photograph their meter each month and upload it; the landlord reviews and applies it to the next invoice instead of retyping readings. The `meter_submissions` table exists in the schema as an extension point, but no router/UI is wired up yet.
