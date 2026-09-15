import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.core.config import settings
from backend.database import engine, Base
import backend.models  # noqa: F401 -- import side effect: registers all tables on Base

from backend.routers import (
    auth, portal_auth, settings as settings_router, aggregate, tenants, invoices, portal,
    properties, catchall_router,
)

if not settings.DEBUG and (not settings.JWT_SECRET or settings.JWT_SECRET == "change-me"):
    raise RuntimeError(
        "JWT_SECRET is not set (or is left at a placeholder value). Set a real secret via "
        "the JWT_SECRET environment variable before starting the app."
    )

# New tables only -- see migrate.py for changes to existing tables.
Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(portal_auth.router)
app.include_router(settings_router.router)
app.include_router(aggregate.router)
app.include_router(tenants.router)
app.include_router(invoices.router)
app.include_router(properties.router)
app.include_router(portal.router)


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME}


# Docker mode: serve the built SPA. Toggled by SERVE_STATIC=true. Must be
# mounted/registered after all API routers so the catch-all doesn't shadow
# /api/*.
if os.getenv("SERVE_STATIC", "false").lower() == "true":
    from fastapi.staticfiles import StaticFiles

    static_dir = os.path.join(os.path.dirname(__file__), "frontend_dist")
    assets_dir = os.path.join(static_dir, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    app.include_router(catchall_router.router)  # registered LAST
