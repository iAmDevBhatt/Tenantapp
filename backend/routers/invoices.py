from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from backend.core.deps import get_current_admin
from backend.database import get_db
from backend.models.admin_user import AdminUser
from backend.schemas.invoice import InvoiceCreate, InvoiceUpdate, InvoiceOut, TogglePaidRequest
from backend.schemas.invoice_writeoff import WriteOffCreate, WriteOffOut
from backend.services import invoice_service, tenant_service, settings_service, qr_service
from backend.services.pdf_service import render_invoice_pdf, PdfUnavailableError, build_invoice_view

router = APIRouter(prefix="/api/invoices", tags=["invoices"], dependencies=[Depends(get_current_admin)])


def _out(inv) -> InvoiceOut:
    write_offs = [
        WriteOffOut(
            id=wo.id, invoiceId=wo.invoice_id, amount=wo.amount,
            reason=wo.reason, writtenOffBy=wo.written_off_by, writtenOffAt=wo.written_off_at,
        )
        for wo in inv.writeoffs
    ]
    return InvoiceOut(
        id=inv.id, tenantId=inv.tenant_id, invoiceDate=inv.invoice_date,
        roomStart=inv.room_start, roomEnd=inv.room_end, waterStart=inv.water_start,
        waterEnd=inv.water_end, previousDues=inv.previous_dues,
        roomRate=inv.room_rate, waterRate=inv.water_rate, waterDivisor=inv.water_divisor,
        monthlyRent=inv.monthly_rent, upiId=inv.upi_id, payeeName=inv.payee_name, dueDays=inv.due_days,
        roomUsage=inv.room_usage, waterUsage=inv.water_usage, roomAmount=inv.room_amount,
        waterAmount=inv.water_amount, totalPayable=inv.total_payable,
        paid=inv.paid, paidDate=inv.paid_date, createdAt=inv.created_at,
        writeOffs=write_offs,
        netPayable=invoice_service.net_payable(inv),
    )


@router.get("", response_model=list[InvoiceOut])
def list_invoices(tenantId: str, db: Session = Depends(get_db)):
    tenant_service.get_or_404(db, tenantId)
    return [_out(i) for i in invoice_service.list_for_tenant(db, tenantId)]


@router.post("", response_model=InvoiceOut)
def create_invoice(body: InvoiceCreate, db: Session = Depends(get_db)):
    tenant = tenant_service.get_or_404(db, body.tenantId)
    settings_row = settings_service.get_or_create(db)
    inv = invoice_service.create_invoice(
        db, tenant,
        invoice_date=body.invoiceDate, room_start=body.roomStart, room_end=body.roomEnd,
        water_start=body.waterStart, water_end=body.waterEnd, previous_dues=body.previousDues,
        payee_name=settings_row.owner_name, due_days=settings_row.invoice_due_days,
    )
    return _out(inv)


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: str, db: Session = Depends(get_db)):
    return _out(invoice_service.get_or_404(db, invoice_id))


@router.put("/{invoice_id}", response_model=InvoiceOut)
def update_invoice(invoice_id: str, body: InvoiceUpdate, db: Session = Depends(get_db)):
    inv = invoice_service.get_or_404(db, invoice_id)
    inv = invoice_service.update_invoice(
        db, inv, invoice_date=body.invoiceDate, room_start=body.roomStart, room_end=body.roomEnd,
        water_start=body.waterStart, water_end=body.waterEnd, previous_dues=body.previousDues,
    )
    return _out(inv)


@router.post("/{invoice_id}/toggle-paid", response_model=InvoiceOut)
def toggle_paid(invoice_id: str, body: TogglePaidRequest, db: Session = Depends(get_db)):
    inv = invoice_service.get_or_404(db, invoice_id)
    from datetime import date as date_cls
    paid_date = body.paidDate or (date_cls.today() if body.paid else None)
    return _out(invoice_service.toggle_paid(db, inv, body.paid, paid_date))


@router.delete("/{invoice_id}")
def delete_invoice(invoice_id: str, db: Session = Depends(get_db)):
    inv = invoice_service.get_or_404(db, invoice_id)
    invoice_service.delete_invoice(db, inv)
    return {"ok": True}


@router.get("/{invoice_id}/pdf")
def get_invoice_pdf(invoice_id: str, db: Session = Depends(get_db)):
    inv = invoice_service.get_or_404(db, invoice_id)
    settings_row = settings_service.get_or_create(db)
    try:
        pdf_bytes = render_invoice_pdf(inv, inv.tenant, settings_row)
    except PdfUnavailableError as e:
        raise HTTPException(status_code=501, detail=str(e))
    filename = f"invoice-{inv.tenant.name.replace(' ', '_')}-{inv.invoice_date}.pdf"
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/{invoice_id}/qr.png")
def get_invoice_qr(invoice_id: str, db: Session = Depends(get_db)):
    inv = invoice_service.get_or_404(db, invoice_id)
    ctx = build_invoice_view(inv, inv.tenant, settings_service.get_or_create(db))
    png_bytes = qr_service.generate_qr_png_bytes(ctx["qr_uri"])
    return Response(content=png_bytes, media_type="image/png")


@router.post("/{invoice_id}/writeoffs", response_model=InvoiceOut)
def add_writeoff(
    invoice_id: str,
    body: WriteOffCreate,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    inv = invoice_service.get_or_404(db, invoice_id)
    net = invoice_service.net_payable(inv)
    if body.amount <= Decimal("0") or body.amount > net:
        raise HTTPException(status_code=422, detail=f"Amount must be between 0.01 and {net}")
    inv = invoice_service.create_writeoff(db, inv, body.amount, body.reason, current_admin.username)
    return _out(inv)


@router.delete("/{invoice_id}/writeoffs/{writeoff_id}", response_model=InvoiceOut)
def delete_writeoff(invoice_id: str, writeoff_id: str, db: Session = Depends(get_db)):
    inv = invoice_service.get_or_404(db, invoice_id)
    inv = invoice_service.delete_writeoff(db, inv, writeoff_id)
    return _out(inv)
