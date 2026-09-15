from decimal import Decimal

from backend.services.invoice_service import compute_invoice_amounts


def test_sample_invoice_formula():
    """Pinned to the known-correct sample in REQUIREMENTS.md."""
    r = compute_invoice_amounts(
        room_start=Decimal("2135"), room_end=Decimal("2236"),
        water_start=Decimal("837"), water_end=Decimal("870"),
        room_rate=Decimal("6.65"), water_rate=Decimal("6.65"), water_divisor=1,
        monthly_rent=Decimal("8000"), previous_dues=Decimal("0"),
    )
    assert r["room_usage"] == Decimal("101")
    assert r["room_amount"] == Decimal("671.65")
    assert r["water_usage"] == Decimal("33")
    assert r["water_amount"] == Decimal("219.45")
    assert r["total_payable"] == Decimal("8891.10")


def test_shared_water_meter_divisor():
    r = compute_invoice_amounts(
        room_start=Decimal("0"), room_end=Decimal("100"),
        water_start=Decimal("0"), water_end=Decimal("100"),
        room_rate=Decimal("10"), water_rate=Decimal("10"), water_divisor=2,
        monthly_rent=Decimal("0"), previous_dues=Decimal("0"),
    )
    assert r["water_usage"] == Decimal("50")
    assert r["water_amount"] == Decimal("500.00")


def test_previous_dues_included_in_total():
    r = compute_invoice_amounts(
        room_start=Decimal("0"), room_end=Decimal("10"),
        water_start=Decimal("0"), water_end=Decimal("10"),
        room_rate=Decimal("1"), water_rate=Decimal("1"), water_divisor=1,
        monthly_rent=Decimal("100"), previous_dues=Decimal("50"),
    )
    assert r["total_payable"] == Decimal("170.00")
