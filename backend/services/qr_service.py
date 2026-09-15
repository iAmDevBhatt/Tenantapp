"""UPI deep-link QR generation. Deterministic and cheap (single-digit ms), so
no caching is needed -- the on-screen <img> endpoint and the PDF template both
call this fresh from the same invoice snapshot fields, guaranteeing identical
QR content without a cache-invalidation problem."""
from decimal import Decimal
from io import BytesIO
from urllib.parse import quote

import qrcode


def build_upi_uri(upi_id: str, payee_name: str, amount: Decimal) -> str:
    pa = quote(upi_id or "")
    pn = quote(payee_name or "")
    return f"upi://pay?pa={pa}&pn={pn}&am={amount:.2f}&cu=INR"


def generate_qr_png_bytes(data: str) -> bytes:
    img = qrcode.make(data)
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
