"""Import every model so Base.metadata.create_all() sees all tables."""
from backend.models.admin_user import AdminUser
from backend.models.tenant import Tenant
from backend.models.tenant_document import TenantDocument
from backend.models.tenant_invite import TenantInvite
from backend.models.tenant_user import TenantUser
from backend.models.invoice import Invoice
from backend.models.invoice_writeoff import InvoiceWriteOff
from backend.models.invoice_payment import InvoicePayment
from backend.models.payment_proof import PaymentProof
from backend.models.meter_submission import MeterSubmission
from backend.models.settings import AppSettings
from backend.models.property import Property, PropertyFlat

__all__ = [
    "AdminUser",
    "Tenant",
    "TenantDocument",
    "TenantInvite",
    "TenantUser",
    "Invoice",
    "InvoiceWriteOff",
    "InvoicePayment",
    "PaymentProof",
    "MeterSubmission",
    "AppSettings",
    "Property",
    "PropertyFlat",
]
