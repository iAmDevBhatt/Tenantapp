from fastapi import APIRouter, Depends, UploadFile, File, Form
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from backend.core.deps import get_current_admin
from backend.database import get_db
from backend.schemas.tenant import (
    TenantCreate, TenantUpdate, TenantOut, DeactivateRequest, NextInvoiceDefaults,
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
        flatId=t.flat_id,
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


@router.delete("/{tenant_id}/documents/{document_id}")
def delete_document(tenant_id: str, document_id: str, db: Session = Depends(get_db)):
    doc = document_service.get_or_404(db, tenant_id, document_id)
    document_service.delete_document(db, doc)
    return {"ok": True}


@router.get("/{tenant_id}/documents/download-all")
def download_all_documents(tenant_id: str, db: Session = Depends(get_db)):
    tenant = tenant_service.get_or_404(db, tenant_id)
    zip_bytes = document_service.build_tenant_zip(db, tenant)
    safe_name = tenant.name.replace(" ", "_")
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
