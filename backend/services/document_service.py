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
