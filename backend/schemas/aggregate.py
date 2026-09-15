from decimal import Decimal

from pydantic import BaseModel
from datetime import date


class OverviewOut(BaseModel):
    """Parameter-free aggregate GET -- the AI/MCP seam. A tool-calling model
    can call this blind and get a compact, self-describing summary."""
    activeTenantCount: int
    totalOutstandingDues: Decimal
    unpaidInvoiceCount: int
    thisMonthCollected: Decimal


class TenantSummaryOut(BaseModel):
    tenantId: str
    tenantName: str
    lastInvoiceDate: date | None
    lastInvoiceTotal: Decimal | None
    lastInvoicePaid: bool | None
    totalInvoicesCount: int
