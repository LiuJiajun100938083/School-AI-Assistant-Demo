"""Handwriting OCR domain.

Single responsibility: turn an image file into a plain text string.

This domain is intentionally separate from `app/domains/vision/` because
vision LLM and dedicated handwriting OCR are two parallel provider families.
Keeping them apart prevents `vision/` from becoming a junk drawer for
"anything that touches images".
"""
