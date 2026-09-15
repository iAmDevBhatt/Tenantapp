# AI Setup Guide — Automated Install & Startup

Written for an agent to execute sequentially. Every step: exact command, what to check, what to do if it fails.

## Phase 1 — Detect OS

Run `echo $OSTYPE` (bash) or check the shell type given by the environment. Windows uses `.venv/Scripts/python.exe`; macOS/Linux use `.venv/bin/python`. Substitute accordingly below.

## Phase 2 — Install backend runtime

1. `python --version` — need 3.11+ (repo was built/tested against 3.14; anything 3.11+ should work).
2. From repo root: `python -m venv .venv`
3. Activate: `. .venv/Scripts/activate` (Windows) or `source .venv/bin/activate` (macOS/Linux) — or just call the venv's python binary directly by full path, as this repo's own tooling does.
4. `pip install --upgrade pip`
5. `pip install -r backend/requirements.txt`
   - If `pydantic-core`/`Pillow` fail to build from source on a very new Python version with no prebuilt wheel: the `requirements.txt` pins use `>=` ranges specifically so pip picks a version with a wheel — retry with `pip install --upgrade pip` first, or install a slightly older Python (3.11–3.12) if the failure persists.
   - `passlib` is intentionally NOT a dependency (see AGENTS.md) — don't add it.

## Phase 3 — Install frontend runtime

1. `node --version` — need 18+ (repo built/tested against Node 24).
2. `cd frontend && npm install`

## Phase 4 — Backend setup (env, migrate, seed)

1. Required env vars (export them or put in `backend/.env`): `JWT_SECRET` (any long random string for dev), `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
2. From repo root: `<venv-python> -m backend.migrate` — expect `migrate: done`.
3. `<venv-python> -m backend.seed` — expect `seed: created admin account '<username>'` and `seed: created default settings row` (on first run only; subsequent runs print nothing changed, which is correct/idempotent).
4. Verify: `<venv-python> -m pytest backend/tests -q` — expect `7 passed`. If WeasyPrint prints an import warning to stderr during this run, that's expected on a machine without its system libs (pango/cairo/gdk-pixbuf) and is NOT a test failure — the actual test run result line (`N passed`) is what matters.

## Phase 5 — Frontend setup

1. `cd frontend && npm run typecheck` — expect no output (success).
2. `cd frontend && npm run build` — expect `✓ built in ...` and a `frontend/dist/` directory.

## Phase 6 — Run both, verify health

1. Backend: from repo root, `uvicorn backend.main:app --reload --port 8000` (env vars from Phase 4 must be set in this shell).
2. Verify: `curl http://localhost:8000/health` → `{"status":"ok","app":"Rent Ledger"}`.
3. Frontend (separate terminal): `cd frontend && npm run dev` → serves on `http://localhost:5173`, proxying `/api` to port 8000.
4. Open `http://localhost:5173`, log in with the `ADMIN_USERNAME`/`ADMIN_PASSWORD` from Phase 4.

## Docker path (alternative to Phases 2–6)

1. `cp .env.example .env` and fill in `JWT_SECRET`/`ADMIN_USERNAME`/`ADMIN_PASSWORD`.
2. `docker compose up -d --build`
3. Verify: `curl http://localhost:8006/health`
4. This path also builds the PDF endpoints correctly (WeasyPrint's system libs are installed in the image) — the native-Python path above does not on most Windows machines, and PDF endpoints there will return `501` (see DEVELOPER.md).
