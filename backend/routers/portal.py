"""Tenant-facing routes. All lookups are scoped through tenant.tenant_id from
the verified JWT -- a tenant can never reach another tenant's data even by
guessing an id (returns 404, not 403, to avoid confirming the id exists)."""
import mimetypes

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from backend.core.deps import get_current_tenant
from backend.core.limiter import limiter
from backend.database import get_db
from backend.models.meter_submission import MeterSubmission
from backend.models.payment_proof import PaymentProof
from backend.models.tenant_user import TenantUser
from backend.schemas.meter_submission import MeterSubmissionOut
from backend.schemas.portal import PortalMeOut
from backend.schemas.invoice import InvoiceOut
from backend.schemas.invoice_writeoff import WriteOffOut
from backend.schemas.invoice_payment import PaymentOut
from backend.schemas.payment_proof import PaymentProofOut
from backend.schemas.tenant_document import DocumentOut
from backend.models.tenant_document import TenantDocument
from backend.services import document_service, invoice_service, settings_service, qr_service, tenant_service
from backend.services.pdf_service import render_invoice_pdf, render_payment_receipt_pdf, PdfUnavailableError, build_invoice_view

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
    payments = [
        PaymentOut(
            id=p.id, invoiceId=p.invoice_id, amount=p.amount, paidDate=p.paid_date,
            method=p.method, notes=p.notes, recordedBy=p.recorded_by, createdAt=p.created_at,
        )
        for p in inv.payments
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
        payments=payments,
        netPayable=invoice_service.net_payable(inv),
        totalPaid=invoice_service.total_paid(inv),
        outstanding=invoice_service.outstanding(inv),
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


@router.get("/invoices/{invoice_id}/payments/{payment_id}/receipt.pdf")
def get_my_payment_receipt_pdf(
    invoice_id: str, payment_id: str,
    tenant_user: TenantUser = Depends(get_current_tenant), db: Session = Depends(get_db),
):
    inv = _owned_invoice_or_404(db, tenant_user, invoice_id)
    payment = next((p for p in inv.payments if p.id == payment_id), None)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    settings_row = settings_service.get_or_create(db)
    try:
        pdf_bytes = render_payment_receipt_pdf(payment, inv, inv.tenant, settings_row)
    except PdfUnavailableError as e:
        raise HTTPException(status_code=501, detail=str(e))
    filename = f"receipt-{payment.paid_date}.pdf"
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


def _proof_out(p: PaymentProof) -> PaymentProofOut:
    return PaymentProofOut(
        id=p.id, tenantId=p.tenant_id, invoiceId=p.invoice_id,
        originalFilename=p.original_filename, contentType=p.content_type, sizeBytes=p.size_bytes,
        submittedAt=p.submitted_at, status=p.status, notes=p.notes,
        appliedToPaymentId=p.applied_to_payment_id,
    )


@router.post("/invoices/{invoice_id}/payment-proofs", response_model=PaymentProofOut)
@limiter.limit("20/minute")
def submit_payment_proof(
    request: Request,
    invoice_id: str,
    file: UploadFile = File(...),
    tenant_user: TenantUser = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    inv = _owned_invoice_or_404(db, tenant_user, invoice_id)
    rel_path, original = document_service.save_payment_proof_file(tenant_user.tenant_id, file)
    proof = PaymentProof(
        tenant_id=tenant_user.tenant_id,
        invoice_id=inv.id,
        photo_path=rel_path,
        original_filename=original,
        content_type=file.content_type,
        size_bytes=None,
        status="pending",
    )
    db.add(proof)
    db.commit()
    db.refresh(proof)
    return _proof_out(proof)


@router.get("/invoices/{invoice_id}/payment-proofs", response_model=list[PaymentProofOut])
def list_my_payment_proofs(
    invoice_id: str, tenant_user: TenantUser = Depends(get_current_tenant), db: Session = Depends(get_db)
):
    inv = _owned_invoice_or_404(db, tenant_user, invoice_id)
    return [_proof_out(p) for p in inv.payment_proofs]


@router.get("/invoices/{invoice_id}/payment-proofs/{proof_id}/photo")
def get_my_payment_proof_photo(
    invoice_id: str, proof_id: str,
    tenant_user: TenantUser = Depends(get_current_tenant), db: Session = Depends(get_db),
):
    inv = _owned_invoice_or_404(db, tenant_user, invoice_id)
    proof = next((p for p in inv.payment_proofs if p.id == proof_id), None)
    if not proof:
        raise HTTPException(status_code=404, detail="Payment proof not found")
    path = document_service.payment_proof_absolute_path(proof)
    mime = proof.content_type or mimetypes.guess_type(proof.original_filename)[0] or "image/jpeg"
    return FileResponse(path, media_type=mime)


_VALID_PHOTO_TYPES = {"flat_meter", "water_meter", "property"}


def _ms_out(ms: MeterSubmission) -> MeterSubmissionOut:
    return MeterSubmissionOut(
        id=ms.id,
        tenantId=ms.tenant_id,
        photoType=ms.photo_type,
        originalFilename=ms.original_filename,
        contentType=ms.content_type,
        sizeBytes=ms.size_bytes,
        submittedAt=ms.submitted_at,
        status=ms.status,
        appliedToInvoiceId=ms.applied_to_invoice_id,
        notes=ms.notes,
    )


@router.post("/meter-submissions", response_model=MeterSubmissionOut)
@limiter.limit("20/minute")
def submit_meter_photo(
    request: Request,
    photo_type: str = Form(...),
    file: UploadFile = File(...),
    tenant_user: TenantUser = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    if photo_type not in _VALID_PHOTO_TYPES:
        raise HTTPException(status_code=422, detail=f"photo_type must be one of {sorted(_VALID_PHOTO_TYPES)}")
    rel_path, original = document_service.save_meter_submission_file(tenant_user.tenant_id, file)
    ms = MeterSubmission(
        tenant_id=tenant_user.tenant_id,
        photo_path=rel_path,
        photo_type=photo_type,
        original_filename=original,
        content_type=file.content_type,
        size_bytes=None,  # size tracked inside save_meter_submission_file but not returned; acceptable
        status="pending",
    )
    db.add(ms)
    db.commit()
    db.refresh(ms)
    return _ms_out(ms)


@router.get("/meter-submissions", response_model=list[MeterSubmissionOut])
def list_my_meter_submissions(
    tenant_user: TenantUser = Depends(get_current_tenant), db: Session = Depends(get_db)
):
    rows = (
        db.query(MeterSubmission)
        .filter(MeterSubmission.tenant_id == tenant_user.tenant_id)
        .order_by(MeterSubmission.submitted_at.desc())
        .all()
    )
    return [_ms_out(ms) for ms in rows]


@router.get("/meter-submissions/{ms_id}/photo")
def get_my_meter_submission_photo(
    ms_id: str, tenant_user: TenantUser = Depends(get_current_tenant), db: Session = Depends(get_db)
):
    ms = db.query(MeterSubmission).filter(
        MeterSubmission.id == ms_id,
        MeterSubmission.tenant_id == tenant_user.tenant_id,
    ).first()
    if not ms:
        raise HTTPException(status_code=404, detail="Meter submission not found")
    path = document_service.meter_submission_absolute_path(ms)
    mime = ms.content_type or mimetypes.guess_type(ms.original_filename)[0] or "image/jpeg"
    return FileResponse(path, media_type=mime)


@router.get("/invoices/{invoice_id}/meter-photos/{photo_id}")
def get_invoice_meter_photo(
    invoice_id: str,
    photo_id: str,
    tenant_user: TenantUser = Depends(get_current_tenant),
    db: Session = Depends(get_db),
):
    _owned_invoice_or_404(db, tenant_user, invoice_id)
    doc = db.query(TenantDocument).filter(
        TenantDocument.id == photo_id,
        TenantDocument.invoice_id == invoice_id,
        TenantDocument.tenant_id == tenant_user.tenant_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Photo not found")
    path = document_service.absolute_path(doc)
    mime = doc.content_type or mimetypes.guess_type(doc.original_filename)[0] or "image/jpeg"
    return FileResponse(path, media_type=mime)
