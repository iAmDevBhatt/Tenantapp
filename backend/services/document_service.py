import os
import uuid

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.models.tenant_document import TenantDocument

DOCS_SUBDIR = "tenants"


def _tenant_dir(tenant_id: str) -> str:
    d = os.path.join(settings.UPLOADS_DIR, DOCS_SUBDIR, tenant_id)
    os.makedirs(d, exist_ok=True)
    return d


def list_for_tenant(db: Session, tenant_id: str) -> list[TenantDocument]:
    return (
        db.query(TenantDocument)
        .filter(TenantDocument.tenant_id == tenant_id)
        .order_by(TenantDocument.uploaded_at.desc())
        .all()
    )


def save_upload(db: Session, tenant_id: str, upload: UploadFile, doc_type: str) -> TenantDocument:
    original = upload.filename or "file"
    ext = os.path.splitext(original)[1]
    stored_name = f"{uuid.uuid4()}{ext}"
    tenant_dir = _tenant_dir(tenant_id)
    abs_path = os.path.join(tenant_dir, stored_name)

    size = 0
    with open(abs_path, "wb") as f:
        while chunk := upload.file.read(1024 * 1024):
            size += len(chunk)
            f.write(chunk)

    rel_path = os.path.join(DOCS_SUBDIR, tenant_id, stored_name)
    doc = TenantDocument(
        tenant_id=tenant_id,
        filename=stored_name,
        original_filename=original,
        file_path=rel_path,
        content_type=upload.content_type,
        size_bytes=size,
        doc_type=doc_type,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def get_or_404(db: Session, tenant_id: str, document_id: str) -> TenantDocument:
    doc = db.get(TenantDocument, document_id)
    if not doc or doc.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


def absolute_path(doc: TenantDocument) -> str:
    return os.path.join(settings.UPLOADS_DIR, doc.file_path)


def delete_document(db: Session, doc: TenantDocument) -> None:
    path = absolute_path(doc)
    if os.path.exists(path):
        os.remove(path)
    db.delete(doc)
    db.commit()


def save_profile_photo(db: Session, tenant, upload: UploadFile):
    """Save or replace the tenant's passport-size profile photo."""
    if tenant.profile_photo_path:
        old = os.path.join(settings.UPLOADS_DIR, tenant.profile_photo_path)
        if os.path.exists(old):
            os.remove(old)

    ext = os.path.splitext(upload.filename or "photo.jpg")[1] or ".jpg"
    stored_name = f"profile_{uuid.uuid4()}{ext}"
    tenant_dir = _tenant_dir(tenant.id)
    abs_path = os.path.join(tenant_dir, stored_name)

    with open(abs_path, "wb") as f:
        while chunk := upload.file.read(1024 * 1024):
            f.write(chunk)

    tenant.profile_photo_path = os.path.join(DOCS_SUBDIR, tenant.id, stored_name)
    db.commit()
    db.refresh(tenant)
    return tenant


def delete_profile_photo(db: Session, tenant):
    if tenant.profile_photo_path:
        path = os.path.join(settings.UPLOADS_DIR, tenant.profile_photo_path)
        if os.path.exists(path):
            os.remove(path)
        tenant.profile_photo_path = None
        db.commit()
        db.refresh(tenant)
    return tenant


def profile_photo_absolute_path(tenant) -> str | None:
    if not tenant.profile_photo_path:
        return None
    return os.path.join(settings.UPLOADS_DIR, tenant.profile_photo_path)


def build_tenant_zip(db: Session, tenant) -> bytes:
    """Return an in-memory zip containing all documents + profile photo."""
    import io
    import zipfile

    docs = list_for_tenant(db, tenant.id)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for doc in docs:
            path = absolute_path(doc)
            if os.path.exists(path):
                zf.write(path, doc.original_filename)
        if tenant.profile_photo_path:
            pp = os.path.join(settings.UPLOADS_DIR, tenant.profile_photo_path)
            if os.path.exists(pp):
                ext = os.path.splitext(pp)[1]
                zf.write(pp, f"profile_photo{ext}")
    return buf.getvalue()
