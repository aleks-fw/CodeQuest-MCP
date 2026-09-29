from src.format import format_price


def test_formats_whole_dollars():
    assert format_price(500) == "$5.00"


def test_pads_cents():
    assert format_price(1205) == "$12.05"


def test_formats_zero():
    assert format_price(0) == "$0.00"