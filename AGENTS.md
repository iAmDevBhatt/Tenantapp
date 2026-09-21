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
uvicorn backend.main:app --reload --port 8000   # run from repo root

# Frontend
cd frontend && npm run dev        # dev server, proxies /api to :8000
cd frontend && npm run typecheck  # tsc --noEmit
cd frontend && npm run build      # production build → frontend/dist

# Docker
docker compose up -d --build
```

## Architecture gotchas

- **Two JWT roles, two auth deps.** `core/deps.py::get_current_admin` / `get_current_tenant` are separate — never reuse one for the other's routes. Tenant-scoped routers (`routers/portal.py`) must read `tenant_user.tenant_id` from the verified token, **never** a client-supplied id.
- **Invoices are immutable snapshots.** `Invoice.room_rate`, `water_rate`, `water_divisor`, `monthly_rent`, `upi_id`, `payee_name`, `due_days` are copied from `Tenant`/`AppSettings` at creation time and never re-read live. `total_payable` is also immutable — write-offs are stored in the child table `invoice_writeoffs`, not subtracted from `total_payable`. Historical PDFs read only from the `Invoice` row, never `invoice.tenant.*`.
- **Net payable ≠ total payable.** `invoice_service.net_payable(invoice)` returns `max(total_payable − Σ writeoffs, 0)`. Always use this for "how much does the tenant owe" logic. `total_payable` is the original frozen amount.
- **Partial payments and outstanding balance.** `invoices.amount_paid` (nullable `Numeric`) records how much has actually been received. `invoice_service.outstanding(invoice)` = `max(netPayable − amount_paid, 0)`; `0` if `paid=True`. `InvoiceOut.outstanding` is computed at serialisation, never stored. `previous_dues` auto-fill uses `outstanding`, not `net_payable`, so partially paid invoices carry forward only the unpaid remainder.
- **Invoice creation gate.** `invoice_service.check_can_create_invoice` raises 422 if the last invoice has none of: `paid=True`, `amount_paid IS NOT NULL`, write-offs. Always called in `POST /api/invoices` before creating.
- **Portal access blocking.** `TenantUser.portal_access_blocked` (bool). When `True`: `tenant_login` returns 403 (not 401), and `get_current_tenant` returns 403 on every portal API call. Auto-set to `True` when `tenant_service.deactivate` is called (moved out). Toggle via `PATCH /api/tenants/{id}/portal-block`. The portal axios client (`portalClient.ts`) treats both 401 and 403 as "clear token + redirect to /portal/login".
- **Computed fields are server-only.** `InvoiceCreate`/`InvoiceUpdate` schemas don't declare `roomAmount`/`waterAmount`/`totalPayable`/rates at all — Pydantic drops them. All amounts come from `services/invoice_service.py::compute_invoice_amounts` (Decimal math, `ROUND_HALF_UP`, never float).
- **Write-off validation: amount must be > 0 and ≤ netPayable.** Enforced in `routers/invoices.py` before calling `invoice_service.create_writeoff`. Write-offs can only be added to unpaid invoices (also enforced server-side).
- **PDF generation degrades gracefully.** `services/pdf_service.py` guards the WeasyPrint import; if system libs are missing (common on native Windows), PDF endpoints return `501` instead of crashing the app.
- **Route ordering in `routers/tenants.py`.** `GET /{tenant_id}/documents/download-all` MUST be registered BEFORE `GET /{tenant_id}/documents/{document_id}/download` — FastAPI would otherwise match "download-all" as a `document_id` parameter. Similarly, `catchall_router` must always be last in `main.py`.
- **No Alembic.** New tables are created by `Base.metadata.create_all()` at boot. Changes to *existing* table columns go in `backend/migrate.py` as guarded `_add_column_if_missing` steps. Both run every boot — must stay idempotent. Do NOT add an early-return guard that skips migration when the DB file already exists — the guard was removed precisely because `create_all` already handles brand-new DBs and the `ALTER TABLE` steps are safe to re-run.
- **Password hashing uses `bcrypt` directly**, not passlib — passlib's bcrypt backend-detection breaks against bcrypt >=4.1. Don't reintroduce passlib.
- **Two visual sources of truth for the invoice**: `frontend/src/components/invoice/InvoiceDocument.tsx` (+ `invoice-print.css`) for on-screen, `backend/templates/invoice.html` for the PDF. Both carry "KEEP IN SYNC WITH" header comments — mirror layout/color/copy changes both ways.
- **Two independent frontend auth sessions** coexist in one browser via separate localStorage keys (`rentledger_admin_token`, `rentledger_tenant_token`) and separate axios instances (`api/adminClient.ts`, `api/portalClient.ts`). Don't merge them.
- **Profile photo storage** — stored as `uploads/tenants/{tenant_id}/profile_{uuid}{ext}`, path kept in `tenants.profile_photo_path`. Served via an authenticated `FileResponse` route (not a static mount). `TenantOut.hasProfilePhoto` is a boolean derived from this column.
- **Meter reading photos reuse `tenant_documents`.** They are regular `TenantDocument` rows with `doc_type="meter_reading"` and a non-null `invoice_id` FK. Up to 3 per invoice (enforced in `routers/invoices.py`). `InvoiceOut.meterPhotos` is populated by an explicit `db.query(TenantDocument).filter(TenantDocument.invoice_id == inv.id)` in `_out(inv, db)` — not via ORM eager loading. Both `routers/invoices.py` and `routers/portal.py` use the same `_out(inv, db=None)` pattern; all callers must pass `db`.
- **Integer display for meter readings** — `Numeric(10,2)` in the DB, but always whole numbers in practice. Display as integers: `| int` Jinja2 filter in `invoice.html`; `Math.floor(parseFloat(...))` in `InvoiceDocument.tsx`. DB columns are NOT changed — display-only.
- **Document visibility.** `tenant_documents.tenant_visible` (bool, default `False`). Only documents with `tenant_visible=True` and `doc_type != "meter_reading"` appear in the tenant portal (`GET /api/portal/me/documents`). Toggled per-document by the landlord via `PATCH /{tenant_id}/documents/{doc_id}/visibility`. `DocumentOut.tenantVisible` always present.
- **All UI strings go through `useLabels`.** `frontend/public/labels.properties` is the single source of truth for every user-visible string. Use `l('key', 'fallback')` in every component — never inline string literals in JSX. When adding a feature, append new keys to `labels.properties` first.

## Conventions

- UUID primary keys as `String(36)`, `default=lambda: str(uuid.uuid4())` (SQLite has no native UUID type) — see every model in `backend/models/`.
- Routers stay thin; business logic lives in `backend/services/`.
- Frontend API calls go through `frontend/src/api/*.ts` modules, never inline `axios` calls in components.
- All money amounts are Decimal server-side, strings over the wire (Pydantic `Decimal` fields), parsed to `number` client-side only for display/preview math (`utils/formulas.ts`).
- Binary resources (images, PDFs, zips) are fetched via `fetchAuthedBlob(client, url)` in `utils/blob.ts` — plain `<img src>` / `<a href>` can't send the `Authorization` header.
