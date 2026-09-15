# Web App Architecture & Deployment Blueprint

> A reusable pattern for FastAPI + React (Vite) web apps that need: standalone
> local dev, single-container Docker deployment, PWA support, mobile/tablet/
> desktop responsiveness, and docs an AI agent can bootstrap a dev environment
> from. Merged from two extractions of the same underlying pattern —
> `PROJECT_TEMPLATE.md` (from `expenseandassettracker`) and `BLUEPRINT.md`
> (from `KitchenCounter`) — so the combined lessons of both travel together.
>
> Copy the sections you need into a new repo. Placeholders are `{{LIKE_THIS}}`.
> Where the two source apps genuinely disagreed (migrations strategy, frontend
> state management), both options are kept side by side as an explicit decision
> rather than one silently overwriting the other.

---

## 00. Philosophy

Four decisions drive almost every other choice below. Keep these, and the rest
falls out naturally.

- **One image, one process tree.** The backend serves the built frontend
  directly — no nginx, no second container, no CORS choreography in
  production. Fewer moving parts to deploy on a home server or a $5 VPS.
- **SQLite first, scale-up later.** Dev and small-deployment default to a
  zero-config file database; the same models run against Postgres (via
  `DATABASE_URL`, opt-in via a compose profile) when scale demands it — a flag,
  not a rewrite.
- **Touch is not an afterthought.** Every interactive surface — buttons, drag
  targets, hover-only actions — is designed for a finger on day one, not
  patched in after a laptop-only build.
- **The AI hook is stubbed before it's used.** Route shapes, tool-callable
  endpoints, and an MCP mount point exist in the skeleton from the start, even
  before an API key is configured — so "add AI later" is wiring, not
  architecture surgery.

### Checklist — decide these before writing code

- [ ] App name / short name (for PWA manifest)
- [ ] Default DB: SQLite for dev, Postgres-via-`DATABASE_URL` for scale-up
- [ ] Auth model: JWT (this pattern) vs session cookies
- [ ] Where secrets come from in prod (env vars with **no committed
      fallback** — see §09)
- [ ] Single-container (`SERVE_STATIC` pattern) vs separate frontend/backend
      containers
- [ ] Reverse proxy / TLS termination story (nginx, Caddy, Traefik) — decide
      up front, both source repos this pattern was extracted from didn't
- [ ] Migrations strategy: hand-written `migrate.py` vs Alembic — see §07
- [ ] Frontend state management: Context+hooks vs Zustand+TanStack Query — see
      §04
- [ ] CI: at minimum, `tsc`/lint on push. Add backend tests+lint even if the
      source projects skipped them.

---

## 01. Stack at a glance

| Layer | Choice | Why |
|---|---|---|
| Backend | FastAPI (Python) | async-ready, typed, free OpenAPI docs at `/docs` |
| ORM | SQLAlchemy (+ Alembic, optional — see §07) | one model set, two databases, versioned schema |
| DB (dev/small) | SQLite, WAL mode | zero config, single file, backs up by copying |
| DB (scale) | PostgreSQL 15+ | same models, opt-in via `DATABASE_URL` / compose profile |
| Auth | JWT (python-jose) + bcrypt (passlib) | stateless tokens, no session store to run |
| Frontend | React 18 + Vite + TypeScript | fast dev server, small predictable build |
| Styling | Tailwind CSS | utility classes, one design-token file to reskin |
| HTTP client | Axios, `baseURL: '/api'` | one place to point at proxy or prod path |
| Frontend state | See §04 — Context+hooks *or* Zustand+TanStack Query | pick one per project, don't mix |
| Charts | Recharts | declarative, themeable via CSS vars, `ResponsiveContainer` |
| Packaging | Single multi-stage Dockerfile | node build stage → python runtime stage |
| AI integration | MCP server + LLM client skeleton | tool-callable stats endpoints, mount reserved |
| Install surface | Web manifest + share target | home-screen install, no app-store review |

**Ideology**: backend and frontend are independently runnable in dev (two
ports, two processes) but fuse into **one deployable artifact** in prod. Don't
build two separate prod images unless you actually need independent scaling.

---

## 02. Repo layout

```
{{project}}/
├── backend/
│   ├── main.py              FastAPI app + router registration (see §05 ordering rule)
│   ├── database.py          SQLAlchemy engine + session
│   ├── seed.py              Idempotent default data (admin user, config lists, …)
│   ├── migrate.py           Idempotent, non-destructive schema migrations (if not using Alembic — see §07)
│   ├── models/               SQLAlchemy ORM models
│   ├── schemas/              Pydantic request/response models
│   ├── routers/               Thin FastAPI route handlers
│   ├── services/              Business logic (routers call into here, not the other way)
│   └── core/
│       ├── config.py         pydantic-settings Settings — every env var, with defaults
│       └── security.py       JWT + password hashing, isolated from everything else
├── frontend/
│   ├── public/
│   │   ├── icons/             PWA icons (192, 512, 512-maskable)
│   │   └── labels.properties  All UI text, runtime-editable (see §04)
│   └── src/
│       ├── api/               Axios functions, one module per resource
│       ├── components/
│       ├── pages/
│       ├── store/              Client/auth state (Context or Zustand — see §04)
│       ├── hooks/
│       ├── utils/
│       └── types/
├── start.{ps1,sh}             Two valid meanings, pick one per project (see §09a):
├── stop.{ps1,sh}                dev convenience (launch backend+frontend together) OR
│                                 Docker orchestration wrapper (`docker compose up`/`down`)
├── Dockerfile                 Multi-stage: build frontend → copy into python runtime
├── docker-entrypoint.sh       PUID/PGID step-down, migrate, seed, exec server (see §06)
├── docker-compose.yml         Production launcher (see §06)
├── scripts/backup.{sh,ps1}    Tars the named volumes to a host file (see §09)
├── scripts/restore.{sh,ps1}   Reverses backup.sh — stop the app first
├── AGENTS.md                  Terse agent-facing conventions + gotchas
├── AI_SETUP.md                Step-by-step install runbook for an agent to execute
├── AI_GUIDE.md                Full schema/API/business-rule reference for an agent
├── DEVELOPER.md               Human file map + how-tos + security notes
└── README.md                  Human quick start
```

---

## 03. Backend skeleton — `core/config.py` and `core/security.py`

```python
# core/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "sqlite:///./data/app.db"
    JWT_SECRET: str          # no default in a real template — fail closed, see §09
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_HOURS: int = 24
    APP_NAME: str = "{{App Name}}"
    DEBUG: bool = False


settings = Settings()
```

`core/security.py` — isolate all crypto here, nothing else imports
`jose`/`passlib` directly:

```python
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import jwt, JWTError
from passlib.context import CryptContext
from core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.JWT_EXPIRY_HOURS)
    return jwt.encode({"sub": subject, "exp": expire}, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

def decode_token(token: str) -> Optional[str]:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]).get("sub")
    except JWTError:
        return None
```

### Rules that prevent bugs and 500s

General:
- **Routers stay thin; business logic lives in `services/`.**
- **Router registration order matters**: any route with a greedy path param
  (`/{id}`, `/{year}/{month}`) must be registered *after* every static
  sub-route that could collide with it. Document this explicitly wherever it
  applies — it's the kind of bug that resurfaces the moment someone adds a new
  endpoint.
- **Lazy row creation**: GET endpoints return empty/404/None, never
  auto-create rows as a side effect. Creation happens only via an explicit
  POST/init action. Keeps read-only calls read-only and avoids surprise rows
  from health checks, crawlers, or retried requests.
- **Computed fields are computed server-side and reject client writes** (e.g.
  a derived total, or a percentage crossing 100 flipping a status enum) —
  enforced on every write path in the router/service layer, never trusted
  from client input.
- **Pin the dev port.** Pick one backend dev port and stick to it
  project-wide (docs, proxy config, start scripts). A port that's ever had a
  stuck socket is worth abandoning rather than fighting.

UUID-as-primary-key, specifically (SQLite has no native UUID type, so it
stores them as strings — these came from real runtime failures and are worth
adopting as fixed rules, not per-project judgment calls):

| Rule | Why |
|---|---|
| `UUID(as_uuid=False)` on every UUID column | SQLite stores UUIDs as strings — without this, reads come back as the wrong Python type. |
| `default=lambda: str(uuid.uuid4())` | Not `uuid.uuid4` bare — the lambda ensures a fresh string per row, not a memoized object reused across inserts. |
| Pydantic UUID fields → `str`, never `UUID4` | Keeps serialization consistent with the string values SQLite actually returns. |
| `_parse_uid()` helpers return `str` | Any router helper that parses a path-param UUID should validate it, then return `str(...)`, never a stdlib `uuid.UUID` object, so downstream `==` comparisons against DB values don't silently fail. |

---

## 04. Frontend conventions

### Vite config — PWA + dev proxy

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: '{{App Name}}',
        short_name: '{{Short Name}}',
        description: '{{One-line description}}',
        theme_color: '#1e40af',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https?.*\/api\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } },
  },
})
```

In production, a small ASGI middleware does the equivalent prefix-stripping
in front of the FastAPI routers, so **the frontend code never has an
environment-specific API URL to change**:

```js
// dev-only variant, if the backend doesn't mount routes under /api itself
proxy: {
  '/api': {
    target: 'http://127.0.0.1:8001',
    changeOrigin: true,
    rewrite: p => p.replace(/^\/api/, ''),
  },
}
```

Axios is configured once with `baseURL: '/api'`.

### State management — pick one per project

Two viable defaults, depending on how much async server-state caching the
project actually needs:

| Approach | When to use |
|---|---|
| **Local `useState`/`useEffect` + one React Context** for genuinely global state (theme, auth) | Default starting point. No Redux/Zustand/React Query until the project actually has cross-cutting async cache needs a hand-rolled fetch can't satisfy anymore. |
| **Zustand** (client/auth state) **+ TanStack Query** (server state) + Axios | Once there's enough server-state fetching/caching/invalidation logic that hand-rolled `useEffect` fetches are getting duplicated across pages. |

Don't mix both patterns in one project — pick one at the checklist stage
(§00) and apply it consistently.

### Installable by default

`manifest.json` (or the Vite PWA plugin's inline manifest above) ships from
day one — name, icons, `display: standalone`, theme colors — even before a
service worker exists. A `share_target` block lets the OS share-sheet hand a
URL straight to a page in the app (e.g. sharing a link from a phone browser
opens an add-item form pre-filled).

### Labels/text externalization

All UI copy lives in one file (`public/labels.properties`), loaded via a
`useLabels()`/`l(key)` hook. Keys are permanent; only values change. Makes
copy edits and rebranding a non-code, non-rebuild change, and lets the same
build serve multiple locales/brands later if needed.

---

## 05. Responsive & touch, as a system

Not "it also works on mobile" — a small set of rules applied everywhere, so
laptop/tablet/phone is one codebase with breakpoints, not three designs.

### Breakpoints (Tailwind defaults — don't invent custom ones)

| Prefix | Width | Target |
|---|---|---|
| *(none)* | 0px+ | Mobile |
| `sm:` | 640px+ | Large phone / small tablet |
| `md:` | 768px+ | Tablet |
| `lg:` | 1024px+ | Desktop |
| `xl:` | 1280px+ | Wide desktop panels |

### Rules and reusable patterns

| Rule | Implementation |
|---|---|
| Touch target floor | Base button class enforces `min-h-[44px]` everywhere; compact table-row actions get a deliberate, smaller `min-h-[36px]` exception — a floor and a named exception, not an unstated one. |
| Hover-only actions | On pointer devices, reveal-on-hover (`opacity-0 group-hover:opacity-100`), gated by `@media (hover: none)` so those same controls are always-visible on touch, where hover can't happen. |
| Nav | Inline links at `lg:`; hamburger → full-width dropdown below it. |
| Panel → full screen | A component that's a fixed side panel on desktop (e.g. 320px) becomes full-width on mobile, rather than shrinking a fixed-width panel into an unusable sliver. |
| Tables → card grid | Always `overflow-x-auto` with `min-w-max` as the floor. For the *primary* data table on a page, prefer switching to a **stacked-card layout (or card grid) below `sm`** over horizontal scrolling — a slide-over for full detail if needed. |
| Page padding | One consistent pattern, e.g. `p-3 sm:p-6`, applied to every full-width page rather than ad hoc values per page. |
| Forms | `grid-cols-1 sm:grid-cols-2` so multi-column forms stack on mobile. |
| Charts | Wrap in `ResponsiveContainer width="100%"` (Recharts or equivalent); chart-column grids go `grid-cols-1 → sm:grid-cols-2`, never a fixed multi-column row that gets crushed under 400px. |
| Side-by-side panels | Collapse with `grid-cols-1 {breakpoint}:grid-cols-2`, choosing the breakpoint per component based on actual content width (a dense table needs `xl:`, a simple pair of cards can collapse at `md:`). |

---

## 06. Drag & drop: pointer events, not HTML5 DnD

The HTML5 drag API breaks inside scrollable ancestors in Chrome/Safari
(`dataTransfer.getData()` returns empty) and never worked on touch to begin
with. The reusable fix is one pointer-event system that serves both input
types identically.

- `onMouseDown` / `onTouchStart` on a draggable row seed a ref with the item
  and start coordinates — no state update yet, so a simple tap/click isn't
  mistaken for a drag.
- A single document-level `mousemove`/`touchmove` listener (`{ passive: false
  }` for touch, so `preventDefault()` can block page scroll mid-drag)
  activates the drag after a small pixel threshold, moves a fixed-position
  ghost element, and hit-tests `elementFromPoint` against `[data-dropzone]`
  ancestors.
- `mouseup`/`touchend` share one commit handler that reads refs (never stale
  closures over React state) and resets everything.

---

## 07. `main.py` wiring — single-container static serving

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from database import engine, Base
import models
from routers import auth, {{other_routers}}, catchall_router  # catchall_router last!

Base.metadata.create_all(bind=engine)  # new tables only — see §08 on migrations

app = FastAPI(title=settings.APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # tighten in prod — see §10
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
# ... other routers ...
app.include_router(catchall_router.router)  # registered LAST — see routing-order rule, §03

@app.get("/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME}

# Docker mode: serve the built SPA. Toggled by SERVE_STATIC=true.
# Must be added after all API routers so the catch-all doesn't shadow /api/*.
import os
if os.getenv("SERVE_STATIC", "false").lower() == "true":
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse

    static_dir = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
    app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        return FileResponse(os.path.join(static_dir, "index.html"))
```

`SERVE_STATIC=true` → single-container prod (FastAPI serves the SPA).
`SERVE_STATIC=false`/unset → dev mode, Vite serves the frontend separately.

**SPA fallback route, done safely**: one route handles both "serve a real
static file at the root" (favicon, manifest) and "fall back to `index.html`
for client-side routes" — in that order, with a path-containment check
(`candidate.parent == frontend_dist` or equivalent). Skipping that check, or
checking the fallback first, either serves the SPA shell for your own favicon
or opens a directory-traversal read of arbitrary files under the dist folder.

---

## 08. Migrations — pick a strategy

Two approaches, both real and battle-tested; pick one at the checklist stage
(§00) rather than starting one and drifting into the other.

### Option A — no Alembic, hand-written `migrate.py`

Simpler and honest if you won't actually maintain a full migration tool: new
tables via `Base.metadata.create_all()` (additive, never destructive);
changes to *existing* tables via a hand-written `migrate.py` — an ordered
list of guarded, idempotent `ALTER TABLE` steps, run automatically before
`seed.py` on every start.

### Option B — Alembic, with SQLite in mind

SQLite can't `ALTER COLUMN` or `DROP COLUMN` directly, which is normally
where "just use Alembic" advice quietly breaks. `render_as_batch=True` in
`env.py` makes Alembic rebuild the table under the hood instead, so the same
migration files run unmodified against SQLite and Postgres.

- Local dev keeps a `create_all()` convenience fallback for brand-new tables
  — never for altering existing ones — so a fresh clone doesn't need Alembic
  just to boot.
- Docker always runs `alembic upgrade head` before the app starts; never
  `create_all()` in production, so schema history stays real and reviewable.
- Adding a table means three edits in lockstep: the SQLAlchemy model, an
  import of it in `migrations/env.py` (or autogenerate won't see it), and the
  generated revision file — reviewed by hand, since autogenerate is
  unreliable around `Enum` columns.

**Either way**: whichever strategy you pick, run it before `seed.py` on every
container start (see §09), and if you do commit to Alembic, commit to it
fully instead of leaving it half-wired in `requirements.txt` unused.

---

## 09. Single-image Docker packaging

### Two build stages, one runtime image

```dockerfile
# Stage 1: build the frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: python runtime
FROM python:3.11-slim AS runtime
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/                                  # nested, not flattened — see below
COPY --from=frontend-build /app/frontend/dist ./backend/frontend_dist

VOLUME /app/data
ENV DATABASE_URL="sqlite:////app/data/app.db"
ENV SERVE_STATIC="true"
ENV PORT=8000
EXPOSE 8000

ENTRYPOINT ["/docker-entrypoint.sh"]
```

**Keep the backend nested as a package** (`/app/backend/…`, run via `python
-m backend.main`) rather than flattened into `/app`. Any module using
relative imports like `from ..database import Base` needs a real parent
package to resolve against — flattening turns that into `ImportError:
attempted relative import beyond top-level package`. This also keeps local
dev and the container running the exact same import style.

### What the entrypoint script is responsible for

1. Optional `PUID`/`PGID` step-down — create a matching user/group, `chown`
   the volume-mounted data dirs, then `gosu` into that user before starting
   the app. Solves host/container file-ownership mismatches on bind-mounted
   volumes without baking a fixed UID into the image.
2. Fail fast with a clear message if the database's parent directory doesn't
   exist in the container — almost always means a `DATABASE_URL` path and a
   volume mount target have drifted apart, and that's a much better error
   than a buried SQLAlchemy traceback.
3. Run schema migrations (§08) before the app starts, every single boot.
   Idempotent, so re-running on every restart is safe and existing data is
   never touched.
4. Seed default data (an initial admin account, config lists, a root record)
   — written to skip rows that already exist, so it's also safe to run on
   every boot.
5. `exec` the server process last, so it becomes PID 1 and receives signals
   directly (clean shutdowns, correct `docker stop` behavior).

Equivalent one-line `CMD` form (if you don't need the PUID/PGID step-down):

```dockerfile
CMD ["sh", "-c", "cd /app/backend && python migrate.py && python seed.py && uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
```

A container `HEALTHCHECK` hitting `/` (or `/health`) gives orchestrators
(and a human running `docker ps`) a real signal, separate from "the process
is still running."

### docker-compose.yml

```yaml
version: "3.9"
services:
  app:
    build:
      context: ./{{repo-name}}   # place this compose file ONE directory above the git clone
      dockerfile: Dockerfile
    image: {{repo-name}}:latest
    container_name: {{repo-name}}
    restart: unless-stopped
    ports:
      - "8006:8000"
    volumes:
      - app_data:/app/data       # named volume — survives rebuilds; `down -v` to wipe
      - uploads_data:/app/uploads
    environment:
      - DATABASE_URL=sqlite:////app/data/app.db
      - JWT_SECRET=${JWT_SECRET:?must be set}   # fail closed, no committed fallback
      - JWT_EXPIRY_HOURS=24
      - SERVE_STATIC=true
      - PORT=8000
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 5s
      retries: 3

volumes:
  app_data:
    driver: local
  uploads_data:
    driver: local
```

| Volume | Contains |
|---|---|
| `app_data` / `db_data` | The SQLite file itself, on its own volume, separate from the app image |
| `uploads_data` | User-uploaded files — must survive every rebuild |
| `postgres_data` | Only mounted when the optional Postgres profile is active |

Backup before a migration-bearing deploy: `docker cp
<container>:/app/data/app.db ./backup-$(date +%F).db`

---

## 09a. `start`/`stop` scripts — two valid meanings, pick one

§02 lists `start.{ps1,sh}`/`stop.{ps1,sh}` at the repo root, but the pattern
was never pinned down to one behavior across the two source apps — worth
fixing here, because a contributor who assumes the wrong one wastes a trip
into the file to find out. There are two legitimate, non-overlapping things
a project might want these scripts to do:

1. **Dev-server launcher** — starts backend + frontend as two local
   processes (no Docker involved) for day-to-day development. This is what
   §02's original one-line description meant.
2. **Docker orchestration wrapper** — a thin, safety-railed wrapper around
   `docker compose up`/`down` for a project's *deployed* instance, so
   whoever operates it (who may not know Compose) doesn't need to remember
   flags or `.env` setup by heart.

Don't build both under the same filenames in one project — pick per the
checklist stage (§00) based on who runs the project day to day. A solo
maintainer comfortable with `docker compose` directly may not need either.

**If you pick the Docker-wrapper meaning**, the reusable shape is:

- `start.ps1`/`start.sh`: verify `docker` is on `PATH` (fail with a clear
  message, not a cryptic "command not found", if it isn't); if `.env` is
  missing, copy it from `.env.example` and STOP with instructions to fill in
  the required secrets rather than launching with placeholder values; then
  `docker compose up -d --build`. Print the URL and the follow-up commands
  (`docker compose ps`, `docker compose logs -f`, the stop script's name)
  on success — the operator shouldn't have to know Compose to find these.
- `stop.ps1`/`stop.sh`: default action is `docker compose down` (containers
  stop, named volumes untouched — safe, reversible, no confirmation needed).
  A destructive variant that also deletes the named volumes (`down -v`) must
  be opt-in via an explicit flag (e.g. `-WipeData`/`--wipe-data`), must point
  the operator at the backup script first, and must require a typed
  confirmation (not just a `[y/N]` keypress) before running — this is the
  one command in the whole operational surface that can destroy the
  landlord's/user's entire data history in one line, so it earns the extra
  friction deliberately.

This pairs with the backup/restore scripts (this section, above): a project
using the Docker-wrapper meaning typically ships four scripts total
(`start`, `stop`, `scripts/backup`, `scripts/restore`), each doing exactly
one thing, rather than folding backup/restore into `stop`.

---

## 10. The AI / MCP seam

The reusable idea isn't "add an AI chatbot" — it's designing a couple of
read-oriented endpoints so a tool-calling model (via MCP, or a direct LLM
call) can use them with zero bespoke glue, whether or not any AI code is
wired up yet.

- Pick 1–2 aggregate, parameter-free (or nearly so) GET endpoints — a trend,
  an overview, a summary — that return a compact, self-describing JSON shape.
  Design them as if a model will call them blind, because eventually one
  will.
- Stand up the MCP server module and an LLM-client module as stubs before
  there's an API key configured — a fixed mount point (`app.mount("/mcp",
  mcp_app)`), a `.messages.create(...)` call clearly marked "not yet
  implemented." Turning it on later is filling in a function body, not
  designing a subsystem under deadline.
- Run the MCP server as a separate process/entrypoint (`python -m
  mcp_server`) if it's not mounted onto the FastAPI app's HTTP routes, and
  have it call into the same `services/` layer the REST routers use — don't
  duplicate business logic, wrap it.
- Keep the AI dependency (SDK package, API key) optional at import time — the
  rest of the app must run with it absent, so a contributor without a key
  isn't blocked.
- Document it in `AI_GUIDE.md` §"MCP Tools" the same way endpoints are
  documented, so an agent knows what's available without reading code.

---

## 11. Production-hardening checklist

Pulled from real gaps in both source apps this pattern was extracted from —
so the gaps get inherited on purpose, not by accident. Close every 🔴 item
before this pattern fronts real user data on the open internet.

| Status | Item | Why it matters |
|---|---|---|
| 🔴 GAP | No committed secret fallback | Both source apps defaulted a secret (`JWT_SECRET`, `SECRET_KEY: change-me-in-production…`) "for convenience." Use `${VAR:?required}` in compose, or fail loudly on boot if a known placeholder value is still in place. |
| 🔴 GAP | CORS wide open | `allow_origins=["*"]` with `allow_credentials=True`, or `localhost:*`, is fine behind a private network — lock to explicit origins once anything is public-facing. |
| 🔴 GAP | No gate on registration | If `/auth/register` is unauthenticated, anyone reaching the API can create an account. For a single-household/internal tool, disable public registration or require an existing admin to create users. |
| 🔴 GAP | No rate limiting on login/register | JWT + bcrypt is sound; nothing slows down a brute-force credential attempt without it. |
| 🔴 GAP | No automated tests, no CI pipeline | Neither source repo had a `tests/` directory or CI workflows — migrations and status-transition rules are exactly the kind of logic that regresses silently without one. At minimum: `tsc`/lint on push, plus backend tests+lint. |
| 🟡 PARTIAL | TLS / reverse proxy assumed, not documented | The container serves plain HTTP on its own port; state explicitly "put Caddy/Traefik/nginx in front for TLS" rather than leave it implied by the deployment being internal. |
| 🟡 PARTIAL | JWT stored in localStorage | Readable by any injected JS (XSS blast radius) — move to an httpOnly cookie if you can. |
| 🟡 PARTIAL | No structured logging / request tracing | Fine at one-user scale; worth adding request-id logging before more than a couple of people depend on the deployment. |
| 🟡 PARTIAL | No documented backup routine for volumes | The SQLite file and uploads directory are durable across redeploys, but nothing automates copying them off-box. |
| 🟡 PARTIAL | Seeded default admin credentials | Change default admin credentials on first login — don't leave a seeded `admin/admin123` reachable in prod. |
| ✅ DONE | Migrations, healthcheck, PUID/PGID ownership, idempotent seeding | The operational basics most templates skip — keep these when copying the pattern forward. |

---

## 12. Docs-as-template layering

Four documents, four audiences — write all four for a new project, not just
a README:

| File | Audience | Content |
|---|---|---|
| `README.md` | Human, first contact | Quick start, tech stack table, feature list |
| `AGENTS.md` | Coding agent, every session | Terse: commands, architecture gotchas, conventions. Small enough to load into context every time. |
| `AI_SETUP.md` | Coding agent, one-time | Literal runbook: OS detection → install deps → run, with the exact command and expected output at each step (no prose to interpret) |
| `AI_GUIDE.md` | Coding agent, on demand | Full DB schema, API endpoint reference, computed-field/business-rule reference, MCP tool reference — so the agent never has to reverse-engineer rules from code |
| `DEVELOPER.md` | Human, deep dive | File-by-file map, environment variables, how-tos, Docker/PWA/security notes |

Skeleton headers to start each from:

```markdown
<!-- AGENTS.md -->
# AGENTS.md
{{One-line stack summary}}. Deep references: `DEVELOPER.md`, `AI_GUIDE.md`, `AI_SETUP.md`.
## Commands
## Architecture gotchas
## Conventions
```

```markdown
<!-- AI_SETUP.md -->
# AI Setup Guide — Automated Install & Startup
Written for an agent to execute sequentially. Every step: exact command, what
to check, what to do if it fails.
## Phase 1 — Detect OS
## Phase 2 — Install backend runtime
## Phase 3 — Install frontend runtime
## Phase 4 — Backend setup (venv, deps, seed)
## Phase 5 — Frontend setup (npm install)
## Phase 6 — Run both, verify health
```

```markdown
<!-- AI_GUIDE.md -->
# AI Guide — {{App Name}}
## 1. Project Overview
## 2. Database Connection
## 3. Table Catalog
## 4. API Base URL / Auth
## 5. Full Endpoint Reference
## 6. Computed Field Rules
## 7. Docker / SERVE_STATIC
## 8. Responsive Design notes
## 9. MCP Tools
```

```markdown
<!-- DEVELOPER.md -->
# Developer Guide — {{App Name}}
## Architecture
## Running Locally
## Environment Variables
## Backend File Map
## Frontend File Map
## How To (common tasks)
## Docker
## PWA
## Security Notes
```

---

## 13. Starting the next project from this pattern

1. Work through the §00 checklist first — app name, DB, auth model, secrets
   source, container topology, migrations strategy, frontend state strategy,
   CI — before writing code.
2. Copy the two-stage Dockerfile + entrypoint script wholesale; rename the
   package directory only.
3. Keep the UUID-as-string rules (§03) verbatim if using SQLite with UUID
   primary keys — they're not project-specific, they're a compatibility
   requirement.
4. Write the manifest + share target before the first feature page, not
   after — retrofitting installability is harder than starting with it.
5. Decide the touch-target and hover-vs-touch rules (§05) once, in the base
   component classes, so every new component inherits them for free.
6. Reserve the MCP mount point and pick your 1–2 tool-callable stats
   endpoints (§10) even if no AI feature ships in v1.
7. Write all four docs (§12), not just a README.
8. Before calling it production-ready, walk §11 top to bottom against the
   new project specifically — it will have its own placeholder secret and
   its own open registration route.

---

*Merged from two extractions of the same architecture pattern:
`expenseandassettracker` (FastAPI · React/Vite · SQLite) and `KitchenCounter`
(FastAPI · React/Vite · SQLite/Postgres · Docker). Not a claim that either
source app is production-hardened — see §11.*
