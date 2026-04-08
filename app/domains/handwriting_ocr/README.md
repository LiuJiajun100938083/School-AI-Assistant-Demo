# handwriting_ocr

**Single responsibility:** turn an image file into plain text.

## Contract

Every engine implements `HandwritingOCREngine.recognize_image(path) -> HandwritingOCRResult`.
Engines must:

- never raise — always return a `HandwritingOCRResult` (success flag inside)
- never read DB
- never see the reference answer or any student metadata
- never make business decisions (that's `dictation` domain's job)

## Why a separate domain?

Vision LLM (`app/domains/vision/`) and forensic OCR (this domain) are two
parallel provider families. Mixing them lets `vision/` collect every
image-related concern; keeping them apart preserves single responsibility.

## Adding a new engine (e.g. PaddleOCR for Chinese)

1. Create `paddle_ocr_engine.py` implementing `HandwritingOCREngine`
2. Register it in `app/services/container.py::handwriting_ocr_registry`
3. Add it to the fallback chain for the relevant language in `Registry`
4. Set `OCR_PROVIDER_ZH=paddle_ocr` env var

No business code needs to change.
