from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.core.deps import get_current_admin
from backend.database import get_db
from backend.schemas.aggregate import OverviewOut, TenantSummaryOut
from backend.services import aggregate_service, tenant_service

router = APIRouter(prefix="/api/aggregate", tags=["aggregate"], dependencies=[Depends(get_current_admin)])


@router.get("/overview", response_model=OverviewOut)
def overview(db: Session = Depends(get_db)):
    r = aggregate_service.overview(db)
    return OverviewOut(
        activeTenantCount=r["active_tenant_count"],
        totalOutstandingDues=r["total_outstanding_dues"],
        unpaidInvoiceCount=r["unpaid_invoice_count"],
        thisMonthCollected=r["this_month_collected"],
    )


@router.get("/tenant/{tenant_id}/summary", response_model=TenantSummaryOut)
def tenant_summary(tenant_id: str, db: Session = Depends(get_db)):
    tenant = tenant_service.get_or_404(db, tenant_id)
    r = aggregate_service.tenant_summary(db, tenant)
    return TenantSummaryOut(
        tenantId=r["tenant_id"],
        tenantName=r["tenant_name"],
        lastInvoiceDate=r["last_invoice_date"],
        lastInvoiceTotal=r["last_invoice_total"],
        lastInvoicePaid=r["last_invoice_paid"],
        totalInvoicesCount=r["total_invoices_count"],
    )
