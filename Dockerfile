# syntax=docker/dockerfile:1

# ---- Stage 1: build the frontend ----
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: python runtime ----
FROM python:3.12-slim AS runtime

# WeasyPrint's system libraries (pango/cairo/gdk-pixbuf) -- without these the
# PDF endpoints return a clear 501 instead of crashing (see
# backend/services/pdf_service.py), but Docker is the environment meant to
# have them installed so PDFs actually work in production.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libgdk-pixbuf-2.0-0 \
      libffi-dev shared-mime-info fonts-dejavu-core \
      gosu curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Keep the backend nested as a real package (/app/backend/...), run via
# `python -m backend.main` / `uvicorn backend.main:app` -- relative imports
# like `from backend.database import Base` need a real parent package.
COPY backend/ ./backend/
COPY --from=frontend-build /app/frontend/dist ./backend/frontend_dist
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

VOLUME ["/app/data", "/app/uploads"]
ENV DATABASE_URL="sqlite:////app/data/app.db" \
    DATA_DIR="/app/data" \
    UPLOADS_DIR="/app/uploads" \
    SERVE_STATIC="true" \
    PORT=8000

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -f http://localhost:8000/health || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
