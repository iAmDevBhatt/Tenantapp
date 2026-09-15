"""SPA fallback for single-container prod (SERVE_STATIC=true). Registered
LAST in main.py so it never shadows /api/* routes. One route handles both
serving a real static file (favicon, manifest icons) and falling back to
index.html for client-side routes, with a path-containment check so this
can't be used to read arbitrary files outside frontend_dist."""
import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter()

FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend_dist")


@router.get("/{full_path:path}", include_in_schema=False)
def serve_spa(full_path: str):
    dist_root = os.path.realpath(FRONTEND_DIST)
    candidate = os.path.realpath(os.path.join(dist_root, full_path))
    if candidate.startswith(dist_root + os.sep) and os.path.isfile(candidate):
        return FileResponse(candidate)

    index_path = os.path.join(dist_root, "index.html")
    if not os.path.isfile(index_path):
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(index_path)
