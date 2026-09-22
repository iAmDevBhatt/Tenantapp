import mimetypes
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from backend.core.deps import get_current_admin
from backend.database import get_db
from backend.models.admin_user import AdminUser
from backend.models.meter_submission import MeterSubmission
from backend.models.payment_proof import PaymentProof
from backend.schemas.invoice import InvoiceCreate, InvoiceUpdate, InvoiceOut, TogglePaidRequest
from backend.schemas.invoice_writeoff import WriteOffCreate, WriteOffOut
from backend.schemas.invoice_payment import PaymentCreate, PaymentOut
from backend.schemas.payment_proof import PaymentProofOut, PaymentProofReviewRequest
from backend.schemas.tenant_document import DocumentOut
from backend.models.tenant_document import TenantDocument
from backend.services import invoice_service, tenant_service, settings_service, qr_service, document_service
from backend.services.pdf_service import render_invoice_pdf, render_payment_receipt_pdf, PdfUnavailableError, build_invoice_view

router = APIRouter(prefix="/api/invoices", tags=["invoices"], dependencies=[Depends(get_current_admin)])


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


@router.get("", response_model=list[InvoiceOut])
def list_invoices(tenantId: str, db: Session = Depends(get_db)):
    tenant_service.get_or_404(db, tenantId)
    return [_out(i, db) for i in invoice_service.list_for_tenant(db, tenantId)]


@router.post("", response_model=InvoiceOut)
def create_invoice(body: InvoiceCreate, db: Session = Depends(get_db)):
    tenant = tenant_service.get_or_404(db, body.tenantId)
    invoice_service.check_can_create_invoice(db, tenant)
    settings_row = settings_service.get_or_create(db)
    inv = invoice_service.create_invoice(
        db, tenant,
        invoice_date=body.invoiceDate, room_start=body.roomStart, room_end=body.roomEnd,
        water_start=body.waterStart, water_end=body.waterEnd, previous_dues=body.previousDues,
        payee_name=settings_row.owner_name, due_days=settings_row.invoice_due_days,
    )
    for ms_id in body.meterSubmissionIds:
        ms = db.query(MeterSubmission).filter(
            MeterSubmission.id == ms_id,
            MeterSubmission.tenant_id == tenant.id,
            MeterSubmission.status == "approved",
            MeterSubmission.applied_to_invoice_id == None,  # noqa: E711
        ).first()
        if ms:
            document_service.save_meter_submission_as_document(db, ms, inv.id)
    return _out(inv, db)


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: str, db: Session = Depends(get_db)):
    return _out(invoice_service.get_or_404(db, invoice_id), db)


@router.put("/{invoice_id}", response_model=InvoiceOut)
def update_invoice(invoice_id: str, body: InvoiceUpdate, db: Session = Depends(get_db)):
    inv = invoice_service.get_or_404(db, invoice_id)
    inv = invoice_service.update_invoice(
        db, inv, invoice_date=body.invoiceDate, room_start=body.roomStart, room_end=body.roomEnd,
        water_start=body.waterStart, water_end=body.waterEnd, previous_dues=body.previousDues,
    )
    return _out(inv, db)


@router.post("/{invoice_id}/toggle-paid", response_model=InvoiceOut)
def toggle_paid(invoice_id: str, body: TogglePaidRequest, db: Session = Depends(get_db)):
    inv = invoice_service.get_or_404(db, invoice_id)
    from datetime import date as date_cls
    paid_date = body.paidDate or (date_cls.today() if body.paid else None)
    return _out(invoice_service.toggle_paid(db, inv, body.paid, paid_date), db)


@router.post("/{invoice_id}/payments", response_model=InvoiceOut)
def add_payment(
    invoice_id: str,
    body: PaymentCreate,
    db: Session = Depends(get_db),
    current_admin: AdminUser = Depends(get_current_admin),
):
    inv = invoice_service.get_or_404(db, invoice_id)
    inv = invoice_service.add_payment(
        db, inv, body.amount, body.paidDate, body.method, body.notes, current_admin.username,
        payment_proof_id=body.paymentProofId,
    )
    return _out(inv, db)


def _proof_out(p: PaymentProof) -> PaymentProofOut:
    return PaymentProofOut(
        id=p.id, tenantId=p.tenant_id, invoiceId=p.invoice_id,
        originalFilename=p.original_filename, contentType=p.content_type, sizeBytes=p.size_bytes,
        submittedAt=p.submitted_at, status=p.status, notes=p.notes,
        appliedToPaymentId=p.applied_to_payment_id,
    )


@router.get("/{invoice_id}/payment-proofs", response_model=list[PaymentProofOut])
def list_payment_proofs(invoice_id: str, db: Session = Depends(get_db)):
    inv = invoice_service.get_or_404(db, invoice_id)
    return [_proof_out(p) for p in inv.payment_proofs]


@router.get("/{invoice_id}/payment-proofs/{proof_id}/photo")
def get_payment_proof_photo(invoice_id: str, proof_id: str, db: Session = Depends(get_db)):
    proof = db.query(PaymentProof).filter(
        PaymentProof.id == proof_id, PaymentProof.invoice_id == invoice_id,
    ).first()
    if not proof:
        raise HTTPException(status_code=404, detail="Payment proof not found")
    path = document_service.payment_proof_absolute_path(proof)
    mime = proof.content_type or mimetypes.guess_type(proof.original_filename)[0] or "image/jpeg"
    return FileResponse(path, media_type=mime)


@router.post("/{invoice_id}/payment-proofs/{proof_id}/review", response_model=PaymentProofOut)
def review_payment_proof(invoice_id: str, proof_id: str, body: PaymentProofReviewRequest, db: Session = Depends(get_db)):
    proof = db.query(PaymentProof).filter(
        PaymentProof.id == proof_id, PaymentProof.invoice_id == invoice_id,
    ).first()
    if not proof:
        raise HTTPException(status_code=404, detail="Payment proof not found")
    if proof.status != "pending":
        raise HTTPException(status_code=409, detail="This payment proof has already been reviewed")
    proof.status = "approved" if body.action == "approve" else "rejected"
    if body.action == "reject":
        proof.notes = body.notes
    db.commit()
    db.refresh(proof)
    return _proof_out(proof)


@router.delete("/{invoice_id}/payments/{payment_id}", response_model=InvoiceOut)
def delete_payment(invoice_id: str, payment_id: str, db: Session = Depends(get_db)):
    inv = invoice_service.get_or_404(db, invoice_id)
    inv = invoice_service.delete_payment(db, inv, payment_id)
    return _out(inv, db)


@router.get("/{invoice_id}/payments/{payment_id}/receipt.pdf")
def get_payment_receipt_pdf(invoice_id: str, payment_id: str, db: Session = Depends(get_db)):
    inv = invoice_service.get_or_404(db, invoice_id)
    payment = next((p for p in inv.payments if p.id == payment_id), None)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    settings_row = settings_service.get_or_create(db)
    try:
        pdf_bytes = render_payment_receipt_pdf(payment, inv, inv.tenant, settings_row)
    except PdfUnavailableError as e:
        raise HTTPException(status_code=501, detail=str(e))
    import re
    safe_name = re.sub(r'[^\w\-]', '_', inv.tenant.name)
    filename = f"receipt-{safe_name}-{payment.paid_date}.pdf"
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


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
    import re
    safe_name = re.sub(r'[^\w\-]', '_', inv.tenant.name)
    filename = f"invoice-{safe_name}-{inv.invoice_date}.pdf"
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
    return _out(inv, db)


@router.delete("/{invoice_id}/writeoffs/{writeoff_id}", response_model=InvoiceOut)
def delete_writeoff(invoice_id: str, writeoff_id: str, db: Session = Depends(get_db)):
    inv = invoice_service.get_or_404(db, invoice_id)
    inv = invoice_service.delete_writeoff(db, inv, writeoff_id)
    return _out(inv, db)


@router.post("/{invoice_id}/photos", response_model=InvoiceOut)
def upload_meter_photo(
    invoice_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    inv = invoice_service.get_or_404(db, invoice_id)
    existing_count = db.query(TenantDocument).filter(
        TenantDocument.invoice_id == invoice_id
    ).count()
    if existing_count >= 3:
        raise HTTPException(status_code=422, detail="Maximum 3 meter reading photos per invoice")
    doc = document_service.save_upload(db, inv.tenant_id, file, "meter_reading")
    doc.invoice_id = invoice_id
    db.commit()
    db.refresh(doc)
    return _out(inv, db)


@router.delete("/{invoice_id}/photos/{photo_id}", response_model=InvoiceOut)
def delete_meter_photo(invoice_id: str, photo_id: str, db: Session = Depends(get_db)):
    inv = invoice_service.get_or_404(db, invoice_id)
    doc = db.query(TenantDocument).filter(
        TenantDocument.id == photo_id,
        TenantDocument.invoice_id == invoice_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Photo not found")
    document_service.delete_document(db, doc)
    return _out(inv, db)
