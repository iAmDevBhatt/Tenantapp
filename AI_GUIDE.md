# AI Guide — Rent Ledger

## 1. Project Overview

Self-hosted invoicing app for a landlord managing multiple tenants across one or more properties. Replaces a Google Sheets + manual PDF export workflow. Two user roles: **admin** (the landlord, full CRUD) and **tenant** (read-only portal, sees only their own data).

## 2. Database Connection

SQLite by default, WAL mode, at `DATABASE_URL` (default `sqlite:///./data/app.db` in dev, `sqlite:////app/data/app.db` in Docker). SQLAlchemy models in `backend/models/`, session/engine in `backend/database.py`. All primary keys are `String(36)` UUIDs (SQLite has no native UUID type — see AGENTS.md).

## 3. Table Catalog

| Table | Purpose |
|---|---|
| `admin_users` | The landlord's login (usually exactly one row). Seeded from `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars if empty. |
| `tenants` | Tenant records: rates, rent, UPI, active/inactive (moved-out), move-in/out dates, `profile_photo_path` (nullable), `flat_id` FK → `property_flats`. |
| `tenant_documents` | Uploaded files (lease/id_proof/photo/other) against a tenant, stored under `UPLOADS_DIR/tenants/<tenant_id>/`. |
| `tenant_users` | A tenant's portal login (1:1 with `tenants`, created at self-registration). |
| `tenant_invites` | One-time invite codes a landlord generates per tenant so they can self-register a portal login. |
| `invoices` | Immutable invoice snapshots — see §6. |
| `invoice_writeoffs` | Write-off entries against an invoice. `total_payable` on the invoice never changes; net payable is computed as `total_payable − Σ write_offs`. |
| `properties` | Named properties (name + address). Parent of `property_flats`. |
| `property_flats` | Named flats/units within a property (e.g. "2 BHK", "Shop 1"). Referenced by `tenants.flat_id`. |
| `meter_submissions` | **Schema only, no router/UI in v1** — Phase 2 extension point for tenants uploading meter-reading photos. |
| `settings` | Singleton row: owner name (UPI payee display name), default UPI ID, property photo, invoice due days. |

## 4. API Base URL / Auth

Base path: `/api`. Two JWT-bearing auth schemes, both `Authorization: Bearer <token>`:

- **Admin**: obtained via `POST /api/auth/login`. Token claims: `{sub: admin_user_id, role: "admin"}`.
- **Tenant**: obtained via `POST /api/portal/auth/login` or `POST /api/portal/auth/register`. Token claims: `{sub: tenant_user_id, role: "tenant", tenantId: tenant_id}`.

`core/deps.py::get_current_admin` / `get_current_tenant` validate role + re-fetch the row from the DB. Tenant-scoped endpoints ALWAYS filter by the token's `tenantId` claim, never a client-supplied one — a request for another tenant's invoice returns `404`, not `403`.

## 5. Full Endpoint Reference

Legend: **A** = admin JWT required, **T** = tenant JWT required, **P** = public.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | P | `{status, app}` |
| POST | `/api/auth/login` | P | `{username,password}` → `{accessToken, role:"admin"}` |
| GET | `/api/auth/me` | A | current admin identity |
| POST | `/api/auth/change-password` | A | `{currentPassword,newPassword}` |
| GET | `/api/portal/auth/validate-code?code=` | P | `{valid, tenantName?, alreadyRegistered}` |
| POST | `/api/portal/auth/register` | P | `{code,username,password}` → tenant JWT |
| POST | `/api/portal/auth/login` | P | `{username,password}` → tenant JWT |
| GET/PUT | `/api/settings` | A | owner name, default UPI, due days |
| POST/DELETE | `/api/settings/property-photo` | A | multipart upload / remove |
| GET | `/api/settings/property-photo` | A | streams the current photo |
| GET | `/api/aggregate/overview` | A | active tenant count, total outstanding dues, unpaid count, this month collected |
| GET | `/api/aggregate/tenant/{id}/summary` | A | one tenant's last invoice + count |
| GET | `/api/tenants?active=true\|false\|all` | A | default `true` |
| POST | `/api/tenants` | A | create; accepts `flatId` |
| GET/PUT | `/api/tenants/{id}` | A | PUT accepts `flatId` |
| POST | `/api/tenants/{id}/deactivate` | A | `{moveOutDate?}` → soft-delete |
| POST | `/api/tenants/{id}/reactivate` | A | |
| GET | `/api/tenants/{id}/next-invoice-defaults` | A | `{roomStart, waterStart, previousDues}` — see §6 |
| GET/POST | `/api/tenants/{id}/documents` | A | list / multipart upload |
| GET | `/api/tenants/{id}/documents/{doc_id}/download` | A | streams file |
| DELETE | `/api/tenants/{id}/documents/{doc_id}` | A | removes row + file |
| GET | `/api/tenants/{id}/documents/download-all` | A | streams a zip of all docs + profile photo (registered BEFORE `/{doc_id}/download` in the router) |
| POST | `/api/tenants/{id}/profile-photo` | A | multipart upload; replaces existing |
| GET | `/api/tenants/{id}/profile-photo` | A | streams the profile photo |
| DELETE | `/api/tenants/{id}/profile-photo` | A | removes file + clears column |
| GET/POST/DELETE | `/api/tenants/{id}/invite` | A | get / generate (regenerate replaces) / revoke |
| GET | `/api/properties` | A | list all properties with their flats |
| POST | `/api/properties` | A | create property |
| GET/PUT/DELETE | `/api/properties/{pid}` | A | get / update / delete (cascades flats) |
| POST | `/api/properties/{pid}/flats` | A | add flat to property |
| PUT/DELETE | `/api/properties/{pid}/flats/{fid}` | A | update / delete flat |
| GET | `/api/invoices?tenantId=` | A | history, newest first |
| POST | `/api/invoices` | A | body: `tenantId, invoiceDate, roomStart, roomEnd, waterStart, waterEnd, previousDues` ONLY |
| GET/PUT/DELETE | `/api/invoices/{id}` | A | PUT recomputes from stored rates |
| POST | `/api/invoices/{id}/toggle-paid` | A | `{paid, paidDate?}` |
| GET | `/api/invoices/{id}/pdf` | A | `application/pdf`, or `501` if WeasyPrint libs missing |
| GET | `/api/invoices/{id}/qr.png` | A | `image/png` |
| POST | `/api/invoices/{id}/writeoffs` | A | `{amount, reason}` — amount must be > 0 and ≤ netPayable; only on unpaid invoices |
| DELETE | `/api/invoices/{id}/writeoffs/{wid}` | A | undo a write-off |
| GET | `/api/portal/me` | T | own tenant profile |
| GET | `/api/portal/invoices` | T | own invoices only |
| GET | `/api/portal/invoices/{id}` | T | 404 if not this tenant's invoice |
| GET | `/api/portal/invoices/{id}/pdf` | T | same scoping + same renderer as admin |
| GET | `/api/portal/invoices/{id}/qr.png` | T | same scoping |

## 6. Computed Field Rules

**The billing formula** (`backend/services/invoice_service.py::compute_invoice_amounts`, all `Decimal`, `ROUND_HALF_UP` to 2dp):
```
roomUsage      = roomEnd - roomStart
roomAmount     = roomUsage * roomRate
waterUsageRaw  = waterEnd - waterStart
waterUsage     = waterUsageRaw / waterDivisor      (divisor = shared-by count, default 1)
waterAmount    = waterUsage * waterRate
totalPayable   = roomAmount + waterAmount + monthlyRent + previousDues
```
Pinned by `backend/tests/test_invoice_calculations.py` against the known-correct sample: Room 2135→2236 @₹6.65 = ₹671.65; Water 837→870 @₹6.65 (divisor 1) = ₹219.45; Rent ₹8000; Previous dues ₹0 → **Total ₹8891.10**.

**Net payable** (`services/invoice_service.py::net_payable`):
```
netPayable = max(totalPayable − Σ(writeoff.amount), 0)
```
Computed at serialization time, never stored on the invoice row. Exposed as `netPayable` on `InvoiceOut`.

**Client can never set computed/rate fields.** `InvoiceCreate`/`InvoiceUpdate` declare ONLY `tenantId, invoiceDate, roomStart, roomEnd, waterStart, waterEnd, previousDues` as inputs — Pydantic drops anything else.

**Invoices are immutable snapshots.** At creation, `room_rate, water_rate, water_divisor, monthly_rent, upi_id, payee_name, due_days` are copied from `Tenant`/`Settings` onto the `Invoice` row and never re-read live again. Editing the invoice (PUT) recomputes using the RATES ALREADY STORED ON THAT INVOICE, not the tenant's current rates. `total_payable` itself is also immutable — write-offs are stored separately in `invoice_writeoffs`.

**Auto-fill logic** (`GET /tenants/{id}/next-invoice-defaults`, `services/invoice_service.py::next_invoice_defaults`):
- `roomStart`/`waterStart` = the tenant's most recent invoice's `roomEnd`/`waterEnd` (0 if no invoices yet).
- `previousDues` = `max(total_payable − Σ write_offs, 0)` if the last invoice is unpaid, else `0`.

## 7. Profile Photos & File Storage

Profile photos are stored alongside documents under `UPLOADS_DIR/tenants/{tenant_id}/profile_{uuid}{ext}`. The path is kept in `tenants.profile_photo_path`. `TenantOut.hasProfilePhoto` is a boolean derived from this column — the frontend uses it to decide whether to render a `TenantAvatar` or an initials fallback.

`build_tenant_zip` (in `services/document_service.py`) returns an in-memory zip (`io.BytesIO`) of all tenant documents plus the profile photo (if present), served by the `download-all` route.

## 8. Properties & Flats

`Property` (1) → `PropertyFlat` (many) → `Tenant` (many, nullable FK). The relationship is:
- A `Property` has a name and a full address.
- Each `PropertyFlat` has a label (e.g. "2 BHK", "Shop 1") and belongs to one property.
- `tenants.flat_id` is a nullable FK to `property_flats.id`. When set, `TenantOut.flatId` carries the flat's UUID.
- The `propertyAddress` column on `tenants` is still the text used on invoices — selecting a flat auto-fills it as `"{property.address} - {flat.label}"` but the landlord can override it.

## 9. Docker / SERVE_STATIC

Single image: `frontend-build` stage (`node:20-alpine`, `npm run build`) → `runtime` stage (`python:3.12-slim` + WeasyPrint's apt packages). `SERVE_STATIC=true` makes `backend/main.py` mount `backend/frontend_dist/assets` and register `routers/catchall_router.py` LAST, after all `/api/*` routers. Two named volumes: `app_data` → `/app/data` (SQLite file), `uploads_data` → `/app/uploads` (tenant docs, profile photos, property photo). `docker-entrypoint.sh`: optional PUID/PGID step-down → fail-fast dir check → `backend.migrate` → `backend.seed` → `exec uvicorn`.

## 10. Responsive Design Notes

Tailwind default breakpoints only. Touch-target floor `min-h-[44px]` via the `.btn` class in `frontend/src/index.css` (`.btn-compact` = `min-h-[36px]` for table-row actions). Nav: inline at `lg:`, hamburger dropdown below (`AdminLayout.tsx`). Forms `grid-cols-1 sm:grid-cols-2` (`TenantForm.tsx`). Invoice detail stacks to full width below `sm`.

## 11. MCP Tools

`backend/mcp/server.py` — stub, run standalone with `python -m backend.mcp.server`, not mounted onto the FastAPI app in v1. Calls into `services/aggregate_service.py` and `services/tenant_service.py`. Tools: `get_overview` (no args), `get_tenant_summary` (`tenant_id`). Not wired to any LLM client/API key yet.
