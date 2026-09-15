"""Stub MCP mount point. Not wired to any LLM API key -- importable and
runnable with the rest of the app absent one, so a contributor without a key
isn't blocked. Calls into services/*, the same layer the REST routers use, so
business logic is never duplicated.

Run standalone: `python -m backend.mcp.server`
(Not mounted onto the FastAPI app's HTTP routes in v1; promote to
`app.mount("/mcp", mcp_app)` in main.py if/when an in-process mount is wanted.)
"""
from backend.database import SessionLocal
from backend.services import aggregate_service

TOOLS = {
    "get_overview": "Read-only: active tenant count, total outstanding dues, unpaid invoice "
                     "count, and this month's collected total.",
    "get_tenant_summary": "Read-only: a single tenant's last invoice date/total/paid status "
                           "and total invoice count. Args: tenant_id.",
}


def call_tool(name: str, **kwargs) -> dict:
    db = SessionLocal()
    try:
        if name == "get_overview":
            return aggregate_service.overview(db)
        if name == "get_tenant_summary":
            from backend.services import tenant_service
            tenant = tenant_service.get_or_404(db, kwargs["tenant_id"])
            return aggregate_service.tenant_summary(db, tenant)
        raise ValueError(f"Unknown tool: {name}")
    finally:
        db.close()


if __name__ == "__main__":
    print("MCP server stub -- tools:", list(TOOLS.keys()))
    print("Not yet wired to an LLM client. See backend/mcp/server.py.")
