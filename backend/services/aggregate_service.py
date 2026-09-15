"""Read-oriented rollups designed for a tool-calling model to call blind (the
AI/MCP seam) -- parameter-free or nearly so, compact self-describing JSON."""
from decimal import Decimal

from sqlalchemy import func, extract
from sqlalchemy.orm import Session

from backend.models.invoice import Invoice
from backend.models.tenant import Tenant
from datetime import date


def overview(db: Session) -> dict:
    active_tenant_count = db.query(Tenant).filter(Tenant.active.is_(True)).count()

    unpaid = db.query(Invoice).filter(Invoice.paid.is_(False)).all()
    total_outstanding = sum((inv.total_payable for inv in unpaid), Decimal("0"))

    today = date.today()
    this_month_paid = (
        db.query(Invoice)
        .filter(
            Invoice.paid.is_(True),
            extract("year", Invoice.paid_date) == today.year,
            extract("month", Invoice.paid_date) == today.month,
        )
        .all()
    )
    this_month_collected = sum((inv.total_payable for inv in this_month_paid), Decimal("0"))

    return {
        "active_tenant_count": active_tenant_count,
        "total_outstanding_dues": total_outstanding,
        "unpaid_invoice_count": len(unpaid),
        "this_month_collected": this_month_collected,
    }


def tenant_summary(db: Session, tenant: Tenant) -> dict:
    last = (
        db.query(Invoice)
        .filter(Invoice.tenant_id == tenant.id)
        .order_by(Invoice.invoice_date.desc(), Invoice.created_at.desc())
        .first()
    )
    total_count = db.query(Invoice).filter(Invoice.tenant_id == tenant.id).count()
    return {
        "tenant_id": tenant.id,
        "tenant_name": tenant.name,
        "last_invoice_date": last.invoice_date if last else None,
        "last_invoice_total": last.total_payable if last else None,
        "last_invoice_paid": last.paid if last else None,
        "total_invoices_count": total_count,
    }
