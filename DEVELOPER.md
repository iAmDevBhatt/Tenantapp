# Developer Guide — Rent Ledger

## Architecture

FastAPI + SQLAlchemy/SQLite backend; React + Vite + TypeScript + Tailwind frontend. In dev they run as two processes (backend on :8000, Vite dev server on :5173 proxying `/api`). In prod they fuse into one Docker image: the backend serves the built SPA (`SERVE_STATIC=true`).

Two JWT-based auth roles, deliberately kept separate end to end:
- **Admin** (the landlord) — full CRUD on everything, logs in at `/login`.
- **Tenant** — read-only portal, self-registers via a landlord-issued invite link (`/portal/register?code=...`), logs in at `/portal/login`, can only ever see their own tenant record's invoices.

See `AI_GUIDE.md` for the full schema/API/business-rule reference and `AGENTS.md` for terse gotchas.

## Running Locally

See `README.md` → Quick start / Local development, or `AI_SETUP.md` for a literal step-by-step runbook.

## Environment Variables

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./data/app.db` | `sqlite:////app/data/app.db` in Docker |
| `UPLOADS_DIR` | `./uploads` | `/app/uploads` in Docker |
| `DATA_DIR` | `./data` | `/app/data` in Docker |
| `JWT_SECRET` | *(none — required)* | App refuses to boot without a real value; see `backend/main.py` |
| `JWT_ALGORITHM` | `HS256` | |
| `JWT_EXPIRY_HOURS` | `336` (2 weeks) | Both admin and tenant tokens |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | *(none)* | Only used by `seed.py` to create the FIRST admin row if `admin_users` is empty; changing them afterward does nothing — use Settings → Change Password |
| `TENANT_INVITE_EXPIRY_DAYS` | `14` | |
| `APP_URL` | *(empty)* | Public-facing base URL (e.g. `https://rent.yourdomain.com`). Set this in Docker so tenant invite links use the real domain instead of relying on the browser's origin. Leave empty in dev. |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated; tighten for a public-facing deploy |
| `SERVE_STATIC` | `false` | `true` in Docker — serves `backend/frontend_dist` + SPA fallback |
| `PORT` | `8000` | |
| `PUID` / `PGID` | *(unset)* | Docker-only; step the container process down to a host uid/gid before touching mounted volumes |

## Backend File Map

```
backend/
├── main.py              FastAPI app, CORS, router registration, SERVE_STATIC mount
├── database.py          engine + SessionLocal + Base + get_db
├── migrate.py           guarded ALTER TABLE steps (no Alembic) — run every boot
├── seed.py              admin account + settings row (idempotent) — run every boot
├── core/
│   ├── config.py        pydantic-settings Settings, every env var
│   ├── security.py      bcrypt hashing (NOT passlib) + JWT encode/decode
│   └── deps.py          get_current_admin / get_current_tenant
├── models/              SQLAlchemy ORM — one file per table
│   ├── tenant.py          + profile_photo_path, flat_id, permanent_address,
│   │                        emergency_contact_name, emergency_contact_phone
│   ├── invoice.py         + writeoffs relationship, meter_photos viewonly relationship
│   ├── invoice_writeoff.py  write-off child table
│   ├── tenant_document.py   + invoice_id (nullable FK → invoices), doc_type="meter_reading",
│   │                          tenant_visible (bool, default False)
│   ├── tenant_user.py         + portal_access_blocked (bool, default False)
│   ├── meter_submission.py  MeterSubmission: photo_type, original_filename, content_type,
│   │                          size_bytes; status: pending|approved|applied|rejected
│   ├── property.py          Property + PropertyFlat models
│   └── ...
├── schemas/             Pydantic request/response models
│   ├── tenant.py          TenantOut includes hasProfilePhoto, flatId,
│   │                        permanentAddress, emergencyContactName, emergencyContactPhone
│   ├── invoice.py         InvoiceOut includes writeOffs[], netPayable, meterPhotos[],
│   │                        amountPaid (nullable), outstanding (computed);
│   │                        InvoiceCreate includes meterSubmissionIds (list[str], default [])
│   ├── invoice_writeoff.py  WriteOffCreate, WriteOffOut
│   ├── tenant_document.py   DocumentOut includes invoiceId, tenantVisible
│   ├── meter_submission.py  MeterSubmissionOut (all submission fields, camelCase);
│   │                          ReviewRequest {action: "approve"|"reject", notes?}
│   └── property.py        PropertyOut, FlatOut, create/update variants
├── routers/             thin FastAPI handlers
│   ├── tenants.py         + profile-photo CRUD, download-all (zip),
│   │                        meter-submission review (list/photo/review endpoints)
│   ├── invoices.py        + write-off CRUD, meter-photo upload/delete;
│   │                        tags approved MeterSubmissions on invoice create
│   ├── portal.py          + meter-submission upload + list (portal write routes);
│   │                        meter-photo stream for invoice view
│   ├── properties.py      full CRUD for properties + flats
│   └── ...
├── services/            business logic
│   ├── invoice_service.py   billing formula + net_payable() + write-off helpers
│   │                         next_invoice_defaults uses net balance for previous dues
│   ├── document_service.py  + save_profile_photo, delete_profile_photo, build_tenant_zip;
│   │                          save_meter_submission_file (write file, return path+filename),
│   │                          meter_submission_absolute_path (full fs path from ms row),
│   │                          save_meter_submission_as_document (create TenantDocument,
│   │                          mark ms applied, commit — the tagging transaction)
│   ├── property_service.py  list/create/update/delete properties and flats
│   └── ...
├── templates/invoice.html   Jinja2 template for the PDF; Opening/Closing Reading columns;
│                             meter values rendered as integers; meter photos section at bottom
└── tests/               pytest — conftest.py spins up a throwaway sqlite file per run
```

## Frontend File Map

```
frontend/src/
├── api/
│   ├── adminClient.ts / portalClient.ts   separate axios instances, separate localStorage keys
│   ├── tenants.ts       + uploadProfilePhoto, deleteProfilePhoto, profilePhotoUrl,
│   │                      downloadAllDocsUrl, togglePortalBlock
│   ├── invoices.ts      + addWriteOff, deleteWriteOff, uploadMeterPhoto, deleteMeterPhoto,
│   │                      meterPhotoDownloadUrl, recordPayment
│   ├── documents.ts     + toggleVisibility
│   ├── meterSubmissions.ts  portal: submitPhoto, listMine, portalMeterPhotoUrl;
│   │                          admin: listForTenant, previewPhotoUrl, review
│   └── properties.ts    full CRUD for properties + flats
├── types/
│   ├── tenant.ts        + hasProfilePhoto, portalAccessBlocked, flatId, permanentAddress,
│   │                      emergencyContactName, emergencyContactPhone
│   ├── invoice.ts       + WriteOff, writeOffs[], netPayable, MeterPhoto, meterPhotos[],
│   │                      amountPaid (string|null), outstanding (string);
│   │                      InvoiceCreateInput includes meterSubmissionIds?: string[]
│   ├── meterSubmission.ts   MeterSubmission interface (id, tenantId, photoType, status, etc.)
│   └── property.ts      Property, PropertyFlat, create/input interfaces
├── hooks/
│   ├── useLabels.ts     loads /labels.properties once (module-level cache); l(key, fallback)
│   └── useAuth.ts
├── utils/
│   ├── formulas.ts      client-side live-preview mirror of the billing formula
│   └── blob.ts          fetchAuthedBlob() + triggerBlobDownload() — used for images, PDFs, zips
├── components/
│   ├── TenantAvatar.tsx   circular avatar; fetches blob, shows initials fallback; sizes sm/md/lg
│   ├── TenantForm.tsx     + Property→Flat dropdowns, permanentAddress textarea,
│   │                        emergencyContactName + emergencyContactPhone fields
│   ├── PropertiesManager.tsx  full CRUD UI embedded in Settings page
│   ├── DocumentList.tsx   + rental_agreement doc type, tenant_visible badge + toggle
│   ├── InviteCodeCard.tsx  + Block/Unblock access button when tenant has portal account
│   └── invoice/InvoiceDocument.tsx + invoice-print.css
│                            Opening/Closing Reading headers; meter values as integers
└── pages/
    ├── admin/DashboardPage.tsx      tenant cards include TenantAvatar
    ├── admin/TenantDetailPage.tsx   + profile photo, download-all, permanentAddress,
    │                                  emergencyContact fields in profile view;
    │                                  Meter Photos tab: pending review queue (approve/reject
    │                                  with inline notes textarea), approved list, history
    ├── admin/InvoiceDetailPage.tsx  + write-offs section, meter reading photos card,
    │                                  partial payment recording (RecordPaymentForm),
    │                                  "Partially paid" badge, outstanding amount display
    ├── admin/NewInvoicePage.tsx     reading inputs use step=1; shows warning banner +
    │                                  disables save when previous invoice has no payment record;
    │                                  meter photo picker (approved submissions, checkbox overlay,
    │                                  brand-colour selected ring, type label overlay)
    ├── admin/SettingsPage.tsx       + PropertiesManager section
    ├── portal/PortalDashboardPage.tsx  full tenant profile card, docs section with downloads,
    │                                    outstanding dues banner, partial-paid invoice badges;
    │                                    Meter Readings card (upload buttons open rear camera via
    │                                    capture="environment"; colour-coded status badges)
    ├── portal/PortalInvoiceViewPage.tsx  + Meter Reading Photos section (blob-fetched thumbnails
    │                                       via portalMeterPhotoUrl, with revokeObjectURL cleanup)
    └── portal/PortalLoginPage.tsx   distinguishes 403 (blocked) from 401 (wrong password)
```

## UI String Externalisation

All user-visible strings live in `frontend/public/labels.properties` (Java `.properties` format). The `useLabels()` hook lazy-loads this file once and exposes `l(key, fallback)`. **Every component and page must use `l(...)` — never inline string literals in JSX.** When adding a feature, append the new keys to `labels.properties` first, then reference them in code.

## Troubleshooting

**"I can't log in as admin/admin123"** — there is no default password. `start.ps1` generates a random admin password on its first run (printed to the console once) and saves it in `.env` (`ADMIN_PASSWORD=`) at the repo root — that's the only place it exists afterward. If you've lost it: `ADMIN_USERNAME`/`ADMIN_PASSWORD` in `.env` only take effect via `seed.py` when `admin_users` is empty. To reset in dev: stop the app (`.\stop.ps1`), delete `data/app.db*` and `.env`, then `.\start.ps1` again for a fresh admin login.

**"table tenants has no column named profile_photo_path"** — the DB existed before the new columns were added. Stop the app, then run `python -m backend.migrate` (or just restart via `start.ps1` — the migration runs automatically on boot).

**Portal goes blank after a form error** — check whether the code that renders the error message reads `err.response.data.detail` directly. FastAPI returns `detail` as a string for most errors but as an array of `{loc,msg,type}` objects on 422 validation failures; rendering that array as a React child throws. Always use `errorMessage(err, fallback)` from `frontend/src/api/client.ts` instead of reading `.detail` inline. A top-level `ErrorBoundary` (`main.tsx`) now catches any such crash and shows a recoverable screen instead of a blank page, but the underlying bug should still be fixed at the source.

## How To (common tasks)

**Add a new tenant field**: add the column to `models/tenant.py` + a guarded `_add_column_if_missing` step in `migrate.py` + the field in `schemas/tenant.py` + wire it through `routers/tenants.py`'s `_tenant_out`/create/update + `frontend/src/types/tenant.ts` + `TenantForm.tsx` + `TenantDetailPage.tsx` (read-only view).

**Add a new property or flat field**: edit `models/property.py` + `schemas/property.py` + `services/property_service.py` + `routers/properties.py` + `frontend/src/types/property.ts` + `api/properties.ts` + `PropertiesManager.tsx`.

**Add a new invoice write-off field**: edit `models/invoice_writeoff.py` + `schemas/invoice_writeoff.py` + `services/invoice_service.py` + `routers/invoices.py` + `frontend/src/types/invoice.ts` + `InvoiceDetailPage.tsx`.

**Change the invoice PDF layout**: edit `backend/templates/invoice.html` AND `frontend/src/components/invoice/InvoiceDocument.tsx` + `invoice-print.css` together — they're two independent render paths for the same design (server HTML→PDF vs. on-screen React), not one shared template. Check both against a real invoice after any change.

**Add an admin-only endpoint**: create the router file (or add to an existing one) with `dependencies=[Depends(get_current_admin)]` at the `APIRouter(...)` level; register it in `main.py` before `catchall_router`.

**Run only the formula tests**: `pytest backend/tests/test_invoice_calculations.py -v`.

## Docker

See README's Quick Start. Key facts: two-stage build (`node:20-alpine` → `python:3.12-slim`), WeasyPrint's apt packages installed in the runtime stage, two named volumes (`app_data`, `uploads_data`), `docker-entrypoint.sh` runs migrate → seed → `exec uvicorn` on every boot (idempotent, safe to restart anytime). `JWT_SECRET`/`ADMIN_USERNAME`/`ADMIN_PASSWORD` have no committed fallback — compose refuses to start without them (`${VAR:?must be set}`).

**Local build note**: this repo's Dockerfile/entrypoint were written and the SERVE_STATIC single-container mode was verified by running the built backend directly against a built `frontend/dist` copy outside Docker — the actual `docker build`/`docker compose up` has not been run end-to-end. Do that once before relying on it in production.

## PWA

`frontend/vite.config.ts` — `vite-plugin-pwa`, `registerType: autoUpdate`, manifest with 192/512/512-maskable icons (placeholder icons under `frontend/public/icons/` — replace with real branding art before shipping to tenants). `NetworkFirst` runtime caching for `/api/*`. `workbox.navigateFallback` is explicitly set to `undefined` — the plugin's default (`'index.html'`) precaches a `NavigationRoute` that serves the app shell for every hard navigation from cache, which can strand a browser on a stale build indefinitely after a redeploy. Don't re-enable it.

`frontend/src/components/InstallPrompt.tsx` nudges the tenant to install the PWA, shown once on `PortalDashboardPage` after login. Android/Chrome gets a real one-tap install via `beforeinstallprompt`; iOS Safari has no install API at all (Apple never implemented it), so it just shows static "tap Share → Add to Home Screen" instructions. Dismissal is remembered per-device via `safeStorage` (`localStorage`), and the banner never shows at all if `display-mode: standalone`/`navigator.standalone` says the app is already installed.

## Security Notes

- `JWT_SECRET` has no committed fallback — `backend/main.py` raises on boot if it's empty or the literal placeholder `"change-me"`.
- Passwords hashed with `bcrypt` directly (12 rounds via `bcrypt.gensalt()` default), not passlib.
- Tenant JWTs carry a `tenantId` claim; every tenant-facing route re-derives scoping from that claim, never from a path/query parameter — see `routers/portal.py::_owned_invoice_or_404`.
- JWTs are stored in `localStorage` (not an httpOnly cookie) — acceptable for a single-landlord internal tool behind your own network/VPN, but readable by any injected JS if the deployment is ever exposed to untrusted third-party scripts. Move to httpOnly cookies if that risk profile changes.
- No rate limiting on `/api/auth/login` or `/api/portal/auth/login` — fine behind a private network; add rate limiting (e.g. via a reverse proxy) before exposing this to the open internet.
- Registration for the **tenant** portal is gated by a landlord-issued invite code (not open); there is no public admin registration endpoint at all.
- CORS origins are explicit (`CORS_ORIGINS` env var), not `*`.
- This app has no built-in TLS — put a reverse proxy (Caddy/Traefik/nginx) in front for HTTPS if exposing it beyond your local network.
