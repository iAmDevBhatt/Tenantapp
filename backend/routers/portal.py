"""Tenant-facing, read-only routes. Every lookup below is scoped through
tenant.tenant_id (from the verified JWT), never a client-supplied id -- so a
tenant can never reach another tenant's data even by guessing an invoice id
(returns 404, not 403, to avoid confirming the id exists at all)."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from backend.core.deps import get_current_tenant
from backend.database import get_db
from backend.models.tenant_user import TenantUser
from backend.schemas.portal import PortalMeOut
from backend.schemas.invoice import InvoiceOut
from backend.schemas.invoice_writeoff import WriteOffOut
from backend.schemas.tenant_document import DocumentOut
from backend.models.tenant_document import TenantDocument
from backend.services import document_service, invoice_service, settings_service, qr_service, tenant_service
from backend.services.pdf_service import render_invoice_pdf, PdfUnavailableError, build_invoice_view

router = APIRouter(prefix="/api/portal", tags=["portal"], dependencies=[Depends(get_current_tenant)])


def _doc_out(d) -> DocumentOut:
    return DocumentOut(
        id=d.id, tenantId=d.tenant_id, originalFilename=d.original_filename,
        contentType=d.content_type, sizeBytes=d.size_bytes, docType=d.doc_type,
        tenantVisible=bool(d.tenant_visible),
        invoiceId=d.invoice_id, uploadedAt=d.uploaded_at,
    )


def _out(inv, db=None) -> InvoiceOut:
    write_offs = [
        WriteOffOut(
            id=wo.id, invoiceId=wo.invoice_id, amount=wo.amount,
            reason=wo.reason, writtenOffBy=wo.written_off_by, writtenOffAt=wo.written_off_at,
        )
        for wo in inv.writeoffs
    ]
    meter_photos = []
    if db is not None:
        meter_photos = [
            _doc_out(d) for d in db.query(TenantDocument).filter(
                TenantDocument.invoice_id == inv.id
            ).order_by(TenantDocument.uploaded_at).all()
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
        meterPhotos=meter_photos,
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
        phone=tenant.phone, monthlyRent=tenant.monthly_rent,
        roomRate=tenant.room_rate, waterRate=tenant.water_rate,
        hasProfilePhoto=bool(tenant.profile_photo_path),
        permanentAddress=tenant.permanent_address,
        emergencyContactName=tenant.emergency_contact_name,
        emergencyContactPhone=tenant.emergency_contact_phone,
    )


@router.get("/me/photo")
def my_profile_photo(tenant_user: TenantUser = Depends(get_current_tenant), db: Session = Depends(get_db)):
    tenant = tenant_service.get_or_404(db, tenant_user.tenant_id)
    path = document_service.profile_photo_absolute_path(tenant)
    if not path:
        raise HTTPException(status_code=404, detail="No profile photo")
    import mimetypes
    mime = mimetypes.guess_type(path)[0] or "image/jpeg"
    return FileResponse(path, media_type=mime)


@router.get("/me/documents", response_model=list[DocumentOut])
def my_documents(tenant_user: TenantUser = Depends(get_current_tenant), db: Session = Depends(get_db)):
    docs = db.query(TenantDocument).filter(
        TenantDocument.tenant_id == tenant_user.tenant_id,
        TenantDocument.doc_type != "meter_reading",
        TenantDocument.tenant_visible == True,
    ).order_by(TenantDocument.uploaded_at).all()
    return [_doc_out(d) for d in docs]


@router.get("/me/documents/{doc_id}/download")
def download_my_document(doc_id: str, tenant_user: TenantUser = Depends(get_current_tenant), db: Session = Depends(get_db)):
    doc = db.query(TenantDocument).filter(
        TenantDocument.id == doc_id,
        TenantDocument.tenant_id == tenant_user.tenant_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    path = document_service.absolute_path(doc)
    if not path:
        raise HTTPException(status_code=404, detail="File not found on disk")
    import mimetypes
    mime = doc.content_type or mimetypes.guess_type(doc.original_filename)[0] or "application/octet-stream"
    return FileResponse(path, media_type=mime, filename=doc.original_filename)


@router.get("/invoices", response_model=list[InvoiceOut])
def list_my_invoices(tenant_user: TenantUser = Depends(get_current_tenant), db: Session = Depends(get_db)):
    return [_out(i, db) for i in invoice_service.list_for_tenant(db, tenant_user.tenant_id)]


@router.get("/invoices/{invoice_id}", response_model=InvoiceOut)
def get_my_invoice(
    invoice_id: str, tenant_user: TenantUser = Depends(get_current_tenant), db: Session = Depends(get_db)
):
    return _out(_owned_invoice_or_404(db, tenant_user, invoice_id), db)


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
