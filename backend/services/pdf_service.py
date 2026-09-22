"""Server-side invoice PDF rendering: Jinja2 HTML + WeasyPrint. Every money
field used here comes only from the Invoice row's own snapshot columns
(never from tenant.room_rate etc.) so a historical invoice always renders
identically regardless of later rate changes on the tenant record. `tenant`
is passed in solely for stable identity fields (name, address, phone) that
are expected to reflect current data (e.g. a corrected spelling), never for
billing numbers. The one deliberate exception is the owner/payee name: it's
an identity label, not a billing input, so it always reflects the current
`AppSettings.owner_name` rather than `Invoice.payee_name`'s frozen value --
see the matching comment in routers/invoices.py::_out."""
import base64
import os

from jinja2 import Environment, FileSystemLoader

from backend.core.config import settings
from backend.models.invoice import Invoice
from backend.models.invoice_payment import InvoicePayment
from backend.models.tenant import Tenant
from backend.models.settings import AppSettings
from backend.services.qr_service import build_upi_uri, generate_qr_png_bytes
from backend.services import invoice_service

try:
    from weasyprint import HTML
except (ImportError, OSError):
    # Missing system libs (pango/cairo/gdk-pixbuf) -- common on native Windows
    # dev. The app must still boot and every non-PDF feature keeps working;
    # see DEVELOPER.md for running the backend via Docker/WSL for PDF work.
    HTML = None

TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "..", "templates")
_jinja_env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))


class PdfUnavailableError(Exception):
    pass


def _read_data_uri(abs_path: str | None) -> str | None:
    if not abs_path or not os.path.exists(abs_path):
        return None
    ext = os.path.splitext(abs_path)[1].lstrip(".").lower() or "jpeg"
    mime = "jpeg" if ext == "jpg" else ext
    with open(abs_path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode()
    return f"data:image/{mime};base64,{encoded}"


def build_invoice_view(invoice: Invoice, tenant: Tenant, app_settings: AppSettings) -> dict:
    """Shared data-shaping used by both the PDF template and the QR-only
    endpoint, so the QR content is always derived from the same snapshot
    fields the PDF renders."""
    qr_uri = build_upi_uri(invoice.upi_id or "", app_settings.owner_name or "", invoice.total_payable)
    due_date = None
    return {
        "invoice": invoice,
        "tenant": tenant,
        "settings": app_settings,
        "qr_uri": qr_uri,
    }


def _additional_occupants(tenant: Tenant) -> list[str]:
    return [tu.full_name for tu in tenant.tenant_users if tu.show_on_invoice and tu.full_name]


def render_invoice_pdf(invoice: Invoice, tenant: Tenant, app_settings: AppSettings) -> bytes:
    if HTML is None:
        raise PdfUnavailableError(
            "PDF generation unavailable in this environment; install WeasyPrint's "
            "system libraries or run via Docker/WSL -- see DEVELOPER.md"
        )

    ctx = build_invoice_view(invoice, tenant, app_settings)
    qr_png = generate_qr_png_bytes(ctx["qr_uri"])
    qr_data_uri = "data:image/png;base64," + base64.b64encode(qr_png).decode()

    property_photo_data_uri = None
    if app_settings.property_photo_path:
        abs_path = os.path.join(settings.UPLOADS_DIR, app_settings.property_photo_path)
        property_photo_data_uri = _read_data_uri(abs_path)

    meter_photo_data_uris = []
    for doc in invoice.meter_photos:
        abs_path = os.path.join(settings.UPLOADS_DIR, doc.file_path)
        uri = _read_data_uri(abs_path)
        if uri:
            meter_photo_data_uris.append(uri)

    html_str = _jinja_env.get_template("invoice.html").render(
        invoice=invoice,
        tenant=tenant,
        settings=app_settings,
        owner_name=app_settings.owner_name,
        additional_occupants=_additional_occupants(tenant),
        qr_data_uri=qr_data_uri,
        property_photo_data_uri=property_photo_data_uri,
        meter_photo_data_uris=meter_photo_data_uris,
    )
    # All images are inlined as base64 data URIs -- no relative asset refs, so
    # no base_url is needed and the render is fully self-contained.
    return HTML(string=html_str).write_pdf()


def render_payment_receipt_pdf(payment: InvoicePayment, invoice: Invoice, tenant: Tenant, app_settings: AppSettings) -> bytes:
    """No QR here -- unlike the invoice PDF, a receipt confirms money
    already received, so there's nothing left to pay via the code."""
    if HTML is None:
        raise PdfUnavailableError(
            "PDF generation unavailable in this environment; install WeasyPrint's "
            "system libraries or run via Docker/WSL -- see DEVELOPER.md"
        )

    proof_photo_data_uri = None
    if payment.proof and payment.proof.status == "applied":
        abs_path = os.path.join(settings.UPLOADS_DIR, payment.proof.photo_path)
        proof_photo_data_uri = _read_data_uri(abs_path)

    html_str = _jinja_env.get_template("receipt.html").render(
        payment=payment,
        invoice=invoice,
        tenant=tenant,
        settings=app_settings,
        payee_name=app_settings.owner_name,
        additional_occupants=_additional_occupants(tenant),
        proof_photo_data_uri=proof_photo_data_uri,
        net_payable=invoice_service.net_payable(invoice),
        total_paid=invoice_service.total_paid(invoice),
        outstanding=invoice_service.outstanding(invoice),
    )
    return HTML(string=html_str).write_pdf()
