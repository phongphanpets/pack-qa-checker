from datetime import datetime

import pytest

from packqa.model import Confidence, Field_, ProductListing, Source


def _field(value):
    return Field_(value=value, source=Source.ADMIN, confidence=Confidence.CERTAIN)


def test_product_listing_rejects_datetime_without_timezone() -> None:
    with pytest.raises(ValueError, match="timezone"):
        ProductListing(
            product_uuid=_field("a2a598c7-7e83-40d8-8ff8-3e8e88685fb9"),
            name=_field("TP & Gold 9.1"),
            starts_at=_field(datetime(2026, 9, 2, 18, 0, 0)),
            source=Source.ADMIN,
        )


def test_product_listing_accepts_timezone_aware_datetime() -> None:
    listing = ProductListing(
        product_uuid=_field("a2a598c7-7e83-40d8-8ff8-3e8e88685fb9"),
        name=_field("TP & Gold 9.1"),
        starts_at=_field(datetime.fromisoformat("2026-09-02T18:00:00+07:00")),
        source=Source.ADMIN,
    )

    assert listing.starts_at is not None
    assert listing.starts_at.value is not None
    assert listing.starts_at.value.utcoffset().total_seconds() == 7 * 60 * 60
