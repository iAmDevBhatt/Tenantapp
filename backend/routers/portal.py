"""Tenant-facing, read-only routes. Every lookup below is scoped through
tenant.tenant_id (from the verified JWT), never a client-supplied id -- so a
tenant can never reach another tenant's data even by guessing an invoice id
(returns 404, not 403, to avoid confirming the id exists at all)."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from backend.core.deps import get_current_tenant
from backend.database import get_db
from backend.models.tenant_user import TenantUser
from backend.schemas.portal import PortalMeOut
from backend.schemas.invoice import InvoiceOut
from backend.services import invoice_service, settings_service, qr_service, tenant_service
from backend.services.pdf_service import render_invoice_pdf, PdfUnavailableError, build_invoice_view

router = APIRouter(prefix="/api/portal", tags=["portal"], dependencies=[Depends(get_current_tenant)])


def _out(inv) -> InvoiceOut:
    return InvoiceOut(
        id=inv.id, tenantId=inv.tenant_id, invoiceDate=inv.invoice_date,
        roomStart=inv.room_start, roomEnd=inv.room_end, waterStart=inv.water_start,
        waterEnd=inv.water_end, previousDues=inv.previous_dues,
        roomRate=inv.room_rate, waterRate=inv.water_rate, waterDivisor=inv.water_divisor,
        monthlyRent=inv.monthly_rent, upiId=inv.upi_id, payeeName=inv.payee_name, dueDays=inv.due_days,
        roomUsage=inv.room_usage, waterUsage=inv.water_usage, roomAmount=inv.room_amount,
        waterAmount=inv.water_amount, totalPayable=inv.total_payable,
        paid=inv.paid, paidDate=inv.paid_date, createdAt=inv.created_at,
    )


def _owned_invoice_or_404(db: Session, tenant_user: TenantUser, invoice_id: str):
    inv = invoice_service.get_or_404(db, invoice_id)
    if inv.tenant_id != tenant_user.tenant_id:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return inv


@router.get("/me", response_model=PortalMeOut)
def me(tenant_user: TenantUser = Depends(get_current_tenant), db: Session = Depends(get_db)):
    tenant = tenant_service.get_or_404(db, tenant_user.tenant_id)
    return PortalMeOut(
        tenantId=tenant.id, name=tenant.name, propertyAddress=tenant.property_address,
        active=tenant.active, moveInDate=tenant.move_in_date, moveOutDate=tenant.move_out_date,
    )


@router.get("/invoices", response_model=list[InvoiceOut])
def list_my_invoices(tenant_user: TenantUser = Depends(get_current_tenant), db: Session = Depends(get_db)):
    return [_out(i) for i in invoice_service.list_for_tenant(db, tenant_user.tenant_id)]


@router.get("/invoices/{invoice_id}", response_model=InvoiceOut)
def get_my_invoice(
    invoice_id: str, tenant_user: TenantUser = Depends(get_current_tenant), db: Session = Depends(get_db)
):
    return _out(_owned_invoice_or_404(db, tenant_user, invoice_id))


@router.get("/invoices/{invoice_id}/pdf")
def get_my_invoice_pdf(
    invoice_id: str, tenant_user: TenantUser = Depends(get_current_tenant), db: Session = Depends(get_db)
):
    inv = _owned_invoice_or_404(db, tenant_user, invoice_id)
    settings_row = settings_service.get_or_create(db)
    try:
        pdf_bytes = render_invoice_pdf(inv, inv.tenant, settings_row)
    except PdfUnavailableError as e:
        raise HTTPException(status_code=501, detail=str(e))
    filename = f"invoice-{inv.invoice_date}.pdf"
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/invoices/{invoice_id}/qr.png")
def get_my_invoice_qr(
    invoice_id: str, tenant_user: TenantUser = Depends(get_current_tenant), db: Session = Depends(get_db)
):
    inv = _owned_invoice_or_404(db, tenant_user, invoice_id)
    ctx = build_invoice_view(inv, inv.tenant, settings_service.get_or_create(db))
    png_bytes = qr_service.generate_qr_png_bytes(ctx["qr_uri"])
    return Response(content=png_bytes, media_type="image/png")
