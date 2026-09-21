import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from backend.core.config import settings
from backend.core.limiter import limiter
from backend.database import engine, Base
import backend.models  # noqa: F401 -- import side effect: registers all tables on Base

from backend.routers import (
    auth, portal_auth, settings as settings_router, aggregate, tenants, invoices, portal,
    properties, catchall_router,
)

if not settings.JWT_SECRET or settings.JWT_SECRET == "change-me":
    if settings.DEBUG:
        import warnings
        warnings.warn(
            "JWT_SECRET is not set — tokens are INSECURE. Set JWT_SECRET before deploying.",
            stacklevel=1,
        )
    else:
        raise RuntimeError(
            "JWT_SECRET is not set (or is left at a placeholder value). Set a real secret via "
            "the JWT_SECRET environment variable before starting the app."
        )

# New tables only -- see migrate.py for changes to existing tables.
Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.APP_NAME)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        return response


app.add_middleware(SecurityHeadersMiddleware)
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


@app.get("/api/config")
def public_config():
    """Returns runtime config the frontend needs before auth. appUrl is None
    when APP_URL is not set -- frontend falls back to window.location.origin."""
    return {"appUrl": settings.APP_URL or None}


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
