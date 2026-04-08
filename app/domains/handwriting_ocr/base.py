"""Handwriting OCR engine ABC + result dataclass.

Single responsibility: define the contract every OCR provider implements.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class HandwritingOCRResult:
    """Result of one image → text recognition.

    Engines never raise; failures are reported via `success=False` and `error`.
    """
    text: str = ""                                      # full transcript (lines joined by \n)
    lines: tuple = ()                                   # tuple[str, ...] per detected line
    confidence: float = 0.0                             # overall 0..1
    engine: str = "unknown"                             # provider identifier
    success: bool = True
    error: Optional[str] = None
    metadata: dict = field(default_factory=dict)       # model name, timing, etc.


class HandwritingOCREngine(ABC):
    """An OCR provider. Single job: image path → HandwritingOCRResult.

    Implementations MUST:
      - never raise
      - never touch the DB
      - never receive the reference text or any student metadata
      - return their `name` consistently (used in logs and DB persistence)
    """

    name: str = "abstract"
    supports: frozenset = frozenset()  # languages, e.g. frozenset({"en"})

    @abstractmethod
    async def recognize_image(self, image_path: str) -> HandwritingOCRResult:
        """Transcribe a single image. MUST never raise."""
        ...

    async def warm_up(self) -> None:
        """Optional: pre-load heavy assets at container startup.

        Default is a no-op. Override in engines with lazy model loading.
        """
        return None
