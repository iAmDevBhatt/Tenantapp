"""Single source of the billing formula. Pinned by
tests/test_invoice_calculations.py against the known-correct sample in
REQUIREMENTS.md. All arithmetic uses Decimal (never float) so the result
matches the sample exactly, with no floating-point rounding artifacts."""
from decimal import Decimal, ROUND_HALF_UP
from datetime import date

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.models.invoice import Invoice
from backend.models.tenant import Tenant

TWO_PLACES = Decimal("0.01")


def _q(value: Decimal) -> Decimal:
    return value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def compute_invoice_amounts(
    room_start: Decimal,
    room_end: Decimal,
    water_start: Decimal,
    water_end: Decimal,
    room_rate: Decimal,
    water_rate: Decimal,
    water_divisor: int,
    monthly_rent: Decimal,
    previous_dues: Decimal,
) -> dict:
    room_usage = room_end - room_start
    room_amount = _q(room_usage * room_rate)

    water_usage_raw = water_end - water_start
    water_usage = _q(water_usage_raw / Decimal(water_divisor))
    water_amount = _q(water_usage * water_rate)

    total_payable = _q(room_amount + water_amount + monthly_rent + previous_dues)

    return {
        "room_usage": room_usage,
        "room_amount": room_amount,
        "water_usage": water_usage,
        "water_amount": water_amount,
        "total_payable": total_payable,
    }


def get_or_404(db: Session, invoice_id: str) -> Invoice:
    inv = db.get(Invoice, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return inv


def list_for_tenant(db: Session, tenant_id: str) -> list[Invoice]:
    return (
        db.query(Invoice)
        .filter(Invoice.tenant_id == tenant_id)
        .order_by(Invoice.invoice_date.desc(), Invoice.created_at.desc())
        .all()
    )


def next_invoice_defaults(db: Session, tenant: Tenant) -> dict:
    """Start readings auto-fill from the tenant's last invoice end readings
    (0 if this is their first ever invoice). Previous dues auto-fills from
    the most recent invoice's total if that invoice is unpaid, else 0."""
    last = (
        db.query(Invoice)
        .filter(Invoice.tenant_id == tenant.id)
        .order_by(Invoice.invoice_date.desc(), Invoice.created_at.desc())
        .first()
    )
    if not last:
        return {"room_start": _q(Decimal("0")), "water_start": _q(Decimal("0")), "previous_dues": _q(Decimal("0"))}
    return {
        "room_start": last.room_end,
        "water_start": last.water_end,
        "previous_dues": last.total_payable if not last.paid else _q(Decimal("0")),
    }


def create_invoice(
    db: Session,
    tenant: Tenant,
    invoice_date: date,
    room_start: Decimal,
    room_end: Decimal,
    water_start: Decimal,
    water_end: Decimal,
    previous_dues: Decimal,
    payee_name: str | None,
    due_days: int,
) -> Invoice:
    """Snapshots the tenant's CURRENT rates/rent/upi onto the invoice row --
    this is the snapshot moment. Client-supplied rate/amount fields don't
    exist on InvoiceCreate at all, so there's nothing to ignore; every
    computed value here comes only from this function."""
    amounts = compute_invoice_amounts(
        room_start=room_start,
        room_end=room_end,
        water_start=water_start,
        water_end=water_end,
        room_rate=tenant.room_rate,
        water_rate=tenant.water_rate,
        water_divisor=tenant.water_divisor,
        monthly_rent=tenant.monthly_rent,
        previous_dues=previous_dues,
    )
    invoice = Invoice(
        tenant_id=tenant.id,
        invoice_date=invoice_date,
        room_start=room_start,
        room_end=room_end,
        water_start=water_start,
        water_end=water_end,
        previous_dues=previous_dues,
        room_rate=tenant.room_rate,
        water_rate=tenant.water_rate,
        water_divisor=tenant.water_divisor,
        monthly_rent=tenant.monthly_rent,
        upi_id=tenant.upi_id,
        payee_name=payee_name,
        due_days=due_days,
        room_usage=amounts["room_usage"],
        water_usage=amounts["water_usage"],
        room_amount=amounts["room_amount"],
        water_amount=amounts["water_amount"],
        total_payable=amounts["total_payable"],
        paid=False,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def update_invoice(
    db: Session,
    invoice: Invoice,
    invoice_date: date | None,
    room_start: Decimal | None,
    room_end: Decimal | None,
    water_start: Decimal | None,
    water_end: Decimal | None,
    previous_dues: Decimal | None,
) -> Invoice:
    """Edits the input fields only, then fully recomputes using the RATES
    ALREADY STORED ON THE INVOICE (its own snapshot) -- editing an old
    invoice never pulls in the tenant's current rates."""
    if invoice_date is not None:
        invoice.invoice_date = invoice_date
    if room_start is not None:
        invoice.room_start = room_start
    if room_end is not None:
        invoice.room_end = room_end
    if water_start is not None:
        invoice.water_start = water_start
    if water_end is not None:
        invoice.water_end = water_end
    if previous_dues is not None:
        invoice.previous_dues = previous_dues

    amounts = compute_invoice_amounts(
        room_start=invoice.room_start,
        room_end=invoice.room_end,
        water_start=invoice.water_start,
        water_end=invoice.water_end,
        room_rate=invoice.room_rate,
        water_rate=invoice.water_rate,
        water_divisor=invoice.water_divisor,
        monthly_rent=invoice.monthly_rent,
        previous_dues=invoice.previous_dues,
    )
    invoice.room_usage = amounts["room_usage"]
    invoice.water_usage = amounts["water_usage"]
    invoice.room_amount = amounts["room_amount"]
    invoice.water_amount = amounts["water_amount"]
    invoice.total_payable = amounts["total_payable"]

    db.commit()
    db.refresh(invoice)
    return invoice


def toggle_paid(db: Session, invoice: Invoice, paid: bool, paid_date: date | None) -> Invoice:
    invoice.paid = paid
    invoice.paid_date = paid_date if paid else None
    db.commit()
    db.refresh(invoice)
    return invoice


def delete_invoice(db: Session, invoice: Invoice) -> None:
    db.delete(invoice)
    db.commit()
