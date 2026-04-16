#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CJK character variant normalizer.

Single responsibility:
    Answer one question — given two single characters, are they equivalent
    Chinese traditional/simplified variants?

This module DOES NOT:
    - touch the database
    - touch network / OCR / vision
    - know about diff, comparator, or grading
    - know about dictation business logic

The mapping data lives in `zh_variants.json` (generated from OpenCC public
data via `scripts/generate_zh_variants.py`). The JSON is loaded ONCE at
module import; subsequent lookups are O(1) frozenset membership.

Fail-soft contract:
    chars_equivalent NEVER raises. On any internal error or missing data
    file, it degrades to strict equality (`a == b`). Callers don't need
    try/except; they get sane behavior even when zh_variants.json is gone.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Dict, FrozenSet

from app.domains.dictation.constants import CJK_REGEX

logger = logging.getLogger(__name__)

_VARIANTS_PATH = Path(__file__).resolve().parent / "zh_variants.json"
_CJK_RE = re.compile(CJK_REGEX)


def _load_variants() -> Dict[str, FrozenSet[str]]:
    """Load the variant mapping from JSON. Fail-soft: returns {} on any error.

    Each entry maps one character to a frozenset of all its equivalent
    variants (NOT including itself in the source data, but we add `key`
    into its own group below so chars_equivalent can do a single lookup).
    """
    try:
        with _VARIANTS_PATH.open(encoding="utf-8") as f:
            raw = json.load(f)
    except FileNotFoundError:
        logger.warning(
            "cjk_normalizer: zh_variants.json not found at %s — "
            "lenient variant matching disabled (will fall back to strict)",
            _VARIANTS_PATH,
        )
        return {}
    except Exception as e:
        logger.warning(
            "cjk_normalizer: failed to parse zh_variants.json: %s — "
            "lenient variant matching disabled",
            e,
        )
        return {}

    out: Dict[str, FrozenSet[str]] = {}
    for char, group_list in raw.items():
        # Ensure key char is in its own group (defensive — generator already does this)
        members = set(group_list)
        members.add(char)
        out[char] = frozenset(members)
    logger.info("cjk_normalizer: loaded %d variant entries", len(out))
    return out


# Module-level singleton — loaded once at import time
_MAPPING: Dict[str, FrozenSet[str]] = _load_variants()


def _is_single_cjk(s: str) -> bool:
    """True iff `s` is exactly one CJK character."""
    return len(s) == 1 and bool(_CJK_RE.match(s))


def chars_equivalent(a: str, b: str) -> bool:
    """Are these two characters considered equivalent for Chinese dictation?

    Pure-function contract:
      - never raises
      - O(1) lookup
      - well-defined for any string input (degrades safely)

    Rules:
      1. a == b                                          → True
      2. a or b is not a single CJK character            → fall back to a == b
      3. a and b are in the same variant group           → True (e.g. 飛/飞, 干/乾/幹)
      4. otherwise                                        → False

    Examples:
      chars_equivalent("飛", "飞")    → True
      chars_equivalent("飛", "飛")    → True
      chars_equivalent("飛", "機")    → False
      chars_equivalent("干", "乾")    → True (one-to-many)
      chars_equivalent("干", "幹")    → True
      chars_equivalent("a", "a")      → True (rule 2 falls back to ==)
      chars_equivalent("apple", "apple") → True (rule 2)
      chars_equivalent("飛機", "飞机")   → False (multi-char → rule 2 → strict ==)
    """
    if a == b:
        return True
    if not _is_single_cjk(a) or not _is_single_cjk(b):
        return False  # rule 2: degrade — already failed `a == b`, so different
    group = _MAPPING.get(a)
    if group is None:
        return False
    return b in group
