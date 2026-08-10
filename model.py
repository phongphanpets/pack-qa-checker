"""Backward-compatible imports for the canonical model.

The canonical definitions live in :mod:`packqa.model`, matching the layout
documented in README.md. New code should import from there.
"""

from packqa.model import Confidence, Field_, Item, Pack, PackBundle, Source

__all__ = [
    "Confidence",
    "Field_",
    "Item",
    "Pack",
    "PackBundle",
    "Source",
]
