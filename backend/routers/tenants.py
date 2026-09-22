import mimetypes

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from backend.core.deps import get_current_admin
from backend.database import get_db
from backend.models.meter_submission import MeterSubmission
from backend.schemas.meter_submission import MeterSubmissionOut, ReviewRequest
from backend.schemas.tenant import (
    TenantCreate, TenantUpdate, TenantOut, DeactivateRequest, NextInvoiceDefaults,
    PortalPasswordResetOut,
)
from backend.schemas.tenant_document import DocumentOut
from backend.schemas.invite import InviteOut, InviteStatus
from backend.services import tenant_service, document_service, invite_service, invoice_service

router = APIRouter(prefix="/api/tenants", tags=["tenants"], dependencies=[Depends(get_current_admin)])


def _tenant_out(t) -> TenantOut:
    return TenantOut(
        id=t.id, name=t.name, phone=t.phone, propertyAddress=t.property_address,
        monthlyRent=t.monthly_rent, roomRate=t.room_rate, waterRate=t.water_rate,
        waterDivisor=t.water_divisor, upiId=t.upi_id, active=t.active,
        moveInDate=t.move_in_date, moveOutDate=t.move_out_date,
        hasPortalAccount=t.tenant_user is not None,
        hasProfilePhoto=bool(t.profile_photo_path),
        portalAccessBlocked=bool(t.tenant_user and t.tenant_user.portal_access_blocked),
        flatId=t.flat_id,
        permanentAddress=t.permanent_address,
        emergencyContactName=t.emergency_contact_name,
        emergencyContactPhone=t.emergency_contact_phone,
        createdAt=t.created_at,
    )


@router.get("", response_model=list[TenantOut])
def list_tenants(active: str = "true", db: Session = Depends(get_db)):
    return [_tenant_out(t) for t in tenant_service.list_tenants(db, active)]


@router.post("", response_model=TenantOut)
def create_tenant(body: TenantCreate, db: Session = Depends(get_db)):
    data = {
        "name": body.name, "phone": body.phone, "property_address": body.propertyAddress,
        "monthly_rent": body.monthlyRent, "room_rate": body.roomRate, "water_rate": body.waterRate,
        "water_divisor": body.waterDivisor, "upi_id": body.upiId, "move_in_date": body.moveInDate,
        "flat_id": body.flatId,
        "permanent_address": body.permanentAddress,
        "emergency_contact_name": body.emergencyContactName,
        "emergency_contact_phone": body.emergencyContactPhone,
    }
    return _tenant_out(tenant_service.create_tenant(db, data))


@router.get("/{tenant_id}", response_model=TenantOut)
def get_tenant(tenant_id: str, db: Session = Depends(get_db)):
    return _tenant_out(tenant_service.get_or_404(db, tenant_id))


@router.put("/{tenant_id}", response_model=TenantOut)
def update_tenant(tenant_id: str, body: TenantUpdate, db: Session = Depends(get_db)):
    tenant = tenant_service.get_or_404(db, tenant_id)
    data = {
        "name": body.name, "phone": body.phone, "property_address": body.propertyAddress,
        "monthly_rent": body.monthlyRent, "room_rate": body.roomRate, "water_rate": body.waterRate,
        "water_divisor": body.waterDivisor, "upi_id": body.upiId, "move_in_date": body.moveInDate,
        "flat_id": body.flatId,
        "permanent_address": body.permanentAddress,
        "emergency_contact_name": body.emergencyContactName,
        "emergency_contact_phone": body.emergencyContactPhone,
    }
    return _tenant_out(tenant_service.update_tenant(db, tenant, data))


@router.post("/{tenant_id}/deactivate", response_model=TenantOut)
def deactivate_tenant(tenant_id: str, body: DeactivateRequest, db: Session = Depends(get_db)):
    tenant = tenant_service.get_or_404(db, tenant_id)
    return _tenant_out(tenant_service.deactivate(db, tenant, body.moveOutDate))


@router.post("/{tenant_id}/reactivate", response_model=TenantOut)
def reactivate_tenant(tenant_id: str, db: Session = Depends(get_db)):
    tenant = tenant_service.get_or_404(db, tenant_id)
    return _tenant_out(tenant_service.reactivate(db, tenant))


@router.delete("/{tenant_id}")
def delete_tenant(tenant_id: str, db: Session = Depends(get_db)):
    tenant = tenant_service.get_or_404(db, tenant_id)
    tenant_service.delete_tenant(db, tenant)
    return {"ok": True}


@router.get("/{tenant_id}/next-invoice-defaults", response_model=NextInvoiceDefaults)
def next_invoice_defaults(tenant_id: str, db: Session = Depends(get_db)):
    tenant = tenant_service.get_or_404(db, tenant_id)
    d = invoice_service.next_invoice_defaults(db, tenant)
    return NextInvoiceDefaults(
        roomStart=d["room_start"], waterStart=d["water_start"], previousDues=d["previous_dues"]
    )


# --- Documents ---

def _doc_out(d) -> DocumentOut:
    return DocumentOut(
        id=d.id, tenantId=d.tenant_id, originalFilename=d.original_filename,
        contentType=d.content_type, sizeBytes=d.size_bytes, docType=d.doc_type,
        tenantVisible=bool(d.tenant_visible),
        invoiceId=d.invoice_id,
        uploadedAt=d.uploaded_at,
    )


@router.get("/{tenant_id}/documents", response_model=list[DocumentOut])
def list_documents(tenant_id: str, db: Session = Depends(get_db)):
    tenant_service.get_or_404(db, tenant_id)
    return [_doc_out(d) for d in document_service.list_for_tenant(db, tenant_id)]


@router.post("/{tenant_id}/documents", response_model=DocumentOut)
def upload_document(
    tenant_id: str,
    file: UploadFile = File(...),
    docType: str = Form("other"),
    db: Session = Depends(get_db),
):
    tenant_service.get_or_404(db, tenant_id)
    return _doc_out(document_service.save_upload(db, tenant_id, file, docType))


@router.get("/{tenant_id}/documents/{document_id}/download")
def download_document(tenant_id: str, document_id: str, db: Session = Depends(get_db)):
    doc = document_service.get_or_404(db, tenant_id, document_id)
    return FileResponse(
        document_service.absolute_path(doc),
        filename=doc.original_filename,
        media_type=doc.content_type or "application/octet-stream",
    )


@router.patch("/{tenant_id}/documents/{document_id}/visibility", response_model=DocumentOut)
def toggle_document_visibility(tenant_id: str, document_id: str, db: Session = Depends(get_db)):
    doc = document_service.get_or_404(db, tenant_id, document_id)
    doc.tenant_visible = not doc.tenant_visible
    db.commit()
    db.refresh(doc)
    return _doc_out(doc)


@router.delete("/{tenant_id}/documents/{document_id}")
def delete_document(tenant_id: str, document_id: str, db: Session = Depends(get_db)):
    doc = document_service.get_or_404(db, tenant_id, document_id)
    document_service.delete_document(db, doc)
    return {"ok": True}


@router.get("/{tenant_id}/documents/download-all")
def download_all_documents(tenant_id: str, db: Session = Depends(get_db)):
    tenant = tenant_service.get_or_404(db, tenant_id)
    zip_bytes = document_service.build_tenant_zip(db, tenant)
    import re
    safe_name = re.sub(r'[^\w\-]', '_', tenant.name)
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}-documents.zip"'},
    )


# --- Profile photo ---

@router.post("/{tenant_id}/profile-photo", response_model=TenantOut)
def upload_profile_photo(tenant_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    tenant = tenant_service.get_or_404(db, tenant_id)
    tenant = document_service.save_profile_photo(db, tenant, file)
    return _tenant_out(tenant)


@router.get("/{tenant_id}/profile-photo")
def get_profile_photo(tenant_id: str, db: Session = Depends(get_db)):
    tenant = tenant_service.get_or_404(db, tenant_id)
    path = document_service.profile_photo_absolute_path(tenant)
    if not path:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="No profile photo")
    import mimetypes
    mime = mimetypes.guess_type(path)[0] or "image/jpeg"
    return FileResponse(path, media_type=mime)


@router.delete("/{tenant_id}/profile-photo", response_model=TenantOut)
def delete_profile_photo(tenant_id: str, db: Session = Depends(get_db)):
    tenant = tenant_service.get_or_404(db, tenant_id)
    tenant = document_service.delete_profile_photo(db, tenant)
    return _tenant_out(tenant)


# --- Portal access block ---

@router.patch("/{tenant_id}/portal-block", response_model=TenantOut)
def toggle_portal_block(tenant_id: str, db: Session = Depends(get_db)):
    tenant = tenant_service.get_or_404(db, tenant_id)
    if not tenant.tenant_user:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="This tenant has no portal account.")
    tenant.tenant_user.portal_access_blocked = not tenant.tenant_user.portal_access_blocked
    db.commit()
    db.refresh(tenant)
    return _tenant_out(tenant)


@router.delete("/{tenant_id}/portal-account", response_model=TenantOut)
def delete_portal_account(tenant_id: str, db: Session = Depends(get_db)):
    tenant = tenant_service.get_or_404(db, tenant_id)
    tenant = tenant_service.delete_portal_account(db, tenant)
    return _tenant_out(tenant)


@router.post("/{tenant_id}/portal-account/reset-password", response_model=PortalPasswordResetOut)
def reset_portal_password(tenant_id: str, db: Session = Depends(get_db)):
    tenant = tenant_service.get_or_404(db, tenant_id)
    password = tenant_service.reset_portal_password(db, tenant)
    return PortalPasswordResetOut(password=password)


# --- Invite ---

def _invite_out(inv) -> InviteOut:
    return InviteOut(code=inv.code, expiresAt=inv.expires_at, usedAt=inv.used_at)


@router.get("/{tenant_id}/invite", response_model=InviteStatus)
def get_invite(tenant_id: str, db: Session = Depends(get_db)):
    tenant = tenant_service.get_or_404(db, tenant_id)
    inv = invite_service.current_invite(db, tenant_id)
    return InviteStatus(
        invite=_invite_out(inv) if inv else None,
        hasRegistered=tenant.tenant_user is not None,
    )


@router.post("/{tenant_id}/invite", response_model=InviteOut)
def create_invite(tenant_id: str, db: Session = Depends(get_db)):
    tenant_service.get_or_404(db, tenant_id)
    return _invite_out(invite_service.generate_invite(db, tenant_id))


@router.delete("/{tenant_id}/invite")
def delete_invite(tenant_id: str, db: Session = Depends(get_db)):
    tenant_service.get_or_404(db, tenant_id)
    invite_service.revoke_invite(db, tenant_id)
    return {"ok": True}


# --- Meter submissions (admin review) ---

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


@router.get("/{tenant_id}/meter-submissions", response_model=list[MeterSubmissionOut])
def list_meter_submissions(
    tenant_id: str,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    tenant_service.get_or_404(db, tenant_id)
    q = db.query(MeterSubmission).filter(MeterSubmission.tenant_id == tenant_id)
    if status:
        q = q.filter(MeterSubmission.status == status)
    rows = q.order_by(MeterSubmission.submitted_at.desc()).all()
    return [_ms_out(ms) for ms in rows]


@router.get("/{tenant_id}/meter-submissions/{ms_id}/photo")
def get_meter_submission_photo(tenant_id: str, ms_id: str, db: Session = Depends(get_db)):
    tenant_service.get_or_404(db, tenant_id)
    ms = db.query(MeterSubmission).filter(
        MeterSubmission.id == ms_id,
        MeterSubmission.tenant_id == tenant_id,
    ).first()
    if not ms:
        raise HTTPException(status_code=404, detail="Meter submission not found")
    path = document_service.meter_submission_absolute_path(ms)
    mime = ms.content_type or mimetypes.guess_type(ms.original_filename)[0] or "image/jpeg"
    return FileResponse(path, media_type=mime)


@router.post("/{tenant_id}/meter-submissions/{ms_id}/review", response_model=MeterSubmissionOut)
def review_meter_submission(
    tenant_id: str,
    ms_id: str,
    body: ReviewRequest,
    db: Session = Depends(get_db),
):
    tenant_service.get_or_404(db, tenant_id)
    ms = db.query(MeterSubmission).filter(
        MeterSubmission.id == ms_id,
        MeterSubmission.tenant_id == tenant_id,
    ).first()
    if not ms:
        raise HTTPException(status_code=404, detail="Meter submission not found")
    if ms.status != "pending":
        raise HTTPException(status_code=409, detail=f"Submission is already '{ms.status}'")
    if body.action == "approve":
        ms.status = "approved"
    else:
        ms.status = "rejected"
        ms.notes = body.notes
    db.commit()
    db.refresh(ms)
    return _ms_out(ms)
