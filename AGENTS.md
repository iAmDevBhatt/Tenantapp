# AGENTS.md

FastAPI (SQLAlchemy/SQLite) + React/Vite/TS/Tailwind. Single Docker image; backend serves the built SPA when `SERVE_STATIC=true`. Deep references: `DEVELOPER.md`, `AI_GUIDE.md`, `AI_SETUP.md`.

## Commands

```
# Standalone local dev (Windows) — sets up venv/deps/.env on first run,
# launches backend + frontend each in their own window
.\start.ps1
.\stop.ps1

# Backend tests (from repo root, using the project venv)
./.venv/Scripts/python.exe -m pytest backend/tests -q      # Windows
.venv/bin/python -m pytest backend/tests -q                 # macOS/Linux

# Backend dev server
cd backend && uvicorn backend.main:app --reload --port 8000   # (run from repo root: `uvicorn backend.main:app ...`)

# Frontend
cd frontend && npm run dev        # dev server, proxies /api to :8000
cd frontend && npm run typecheck  # tsc --noEmit
cd frontend && npm run build      # production build → frontend/dist

# Docker
docker compose up -d --build
```

## Architecture gotchas

- **Two JWT roles, two auth deps.** `core/deps.py::get_current_admin` / `get_current_tenant` are separate — never reuse one for the other's routes. Tenant-scoped routers (`routers/portal.py`) must read `tenant_user.tenant_id` from the verified token, **never** a client-supplied id.
- **Invoices are immutable snapshots.** `Invoice.room_rate`, `water_rate`, `water_divisor`, `monthly_rent`, `upi_id`, `payee_name`, `due_days` are copied from `Tenant`/`AppSettings` at creation time and never re-read live. Historical PDFs must only read money fields off the `Invoice` row, never `invoice.tenant.*`.
- **Computed fields are server-only.** `InvoiceCreate`/`InvoiceUpdate` schemas don't declare `roomAmount`/`waterAmount`/`totalPayable`/rates at all — anything a client sends for those is dropped by Pydantic. All amounts come from `services/invoice_service.py::compute_invoice_amounts` (Decimal math, `ROUND_HALF_UP`, never float).
- **PDF generation degrades gracefully.** `services/pdf_service.py` guards the WeasyPrint import; if the system libs are missing (common on native Windows), PDF endpoints return `501` instead of crashing the app. Docker has the libs installed.
- **Router registration order** in `main.py`: `catchall_router` (SPA fallback) must always be registered/mounted last, after every `/api/*` router, or it swallows API calls. See the comment in `routers/tenants.py`'s sibling file `main.py` and the analysis in the original plan — every nested route here differs in path depth from its parent `{id}` route, so ordering among the API routers themselves doesn't matter, only catchall-last does.
- **No Alembic.** Schema changes to *existing* tables go in `backend/migrate.py` as guarded `ALTER TABLE` steps (see `_add_column_if_missing`); new tables are handled by `Base.metadata.create_all()`. Both run on every container boot — must stay idempotent.
- **Password hashing uses `bcrypt` directly**, not passlib — passlib's bcrypt backend-detection breaks against bcrypt >=4.1. Don't reintroduce passlib.
- **Two visual sources of truth for the invoice**: `frontend/src/components/invoice/InvoiceDocument.tsx` (+ `invoice-print.css`) for on-screen, `backend/templates/invoice.html` for the PDF. Both carry "KEEP IN SYNC WITH" header comments — mirror layout/color/copy changes both ways.
- **Two independent frontend auth sessions** coexist in one browser via separate localStorage keys (`rentledger_admin_token`, `rentledger_tenant_token`) and separate axios instances (`api/adminClient.ts`, `api/portalClient.ts`). Don't merge them.

## Conventions

- UUID primary keys as `String(36)`, `default=lambda: str(uuid.uuid4())` (SQLite has no native UUID type) — see every model in `backend/models/`.
- Routers stay thin; business logic lives in `backend/services/`.
- Frontend API calls go through `frontend/src/api/*.ts` modules, never inline `axios` calls in components.
- All money amounts are Decimal server-side, strings over the wire (Pydantic `Decimal` fields), parsed to `number` client-side only for display/preview math (`utils/formulas.ts`).
