"""Pure functions for the dictation LLM grader.

Single responsibility: build the grading prompt and parse the LLM's
JSON response. No IO, no async, no LLM calls — completely deterministic
input → output, easy to unit test.

Why pure-function module:
  Keeping prompt construction and response parsing out of `grader.py`
  means we can unit-test "given this diff, does the prompt say X" and
  "given this LLM response, do we extract the right verdict" without
  mocking any LLM or DB.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

# We use a fenced JSON block to make the parser robust to LLM preambles
# like "Here is the JSON:" or markdown wrappers.
_JSON_BLOCK_RE = re.compile(r"\{[\s\S]*\}")


def build_grading_prompt(
    *,
    reference: str,
    student_text: str,
    diff: Dict[str, Any],
    language: str,
    mode: str,
) -> str:
    """Build the LLM prompt for judging a dictation submission.

    The prompt:
      - Tells the LLM it is a STRICT judge of an already-transcribed string
      - Forbids any inference about what the student "meant" beyond what
        the OCR text contains
      - Asks for a fixed-shape JSON output

    Args:
        reference: teacher's reference text
        student_text: literal OCR transcription of student handwriting
        diff: result from `dictation.comparator.compare_dictation()`
        language: 'en' | 'zh'
        mode: 'paragraph' | 'word_list'

    Returns:
        prompt string ready to feed to ask_ai
    """
    diff_summary = _format_diff_for_prompt(diff)
    lang_hint = "English" if language == "en" else "Chinese"
    mode_hint = "single passage / paragraph" if mode == "paragraph" else "word list"

    return f"""You are a strict, fair dictation judge.

INPUTS YOU RECEIVE
- A reference text (the correct answer the teacher expects)
- A literal OCR transcription of what the student wrote on paper.
  This transcription is FORENSIC: any spelling error, missing word, or
  extra word in it WAS actually written by the student. Do NOT assume
  the OCR mis-read it.
- A mechanical diff already computed by a deterministic algorithm.

INPUTS YOU DO NOT HAVE
- The original photo. You can never "look again" at the handwriting.
- The student's identity, prior history, or any other context.

YOUR JOB
- Confirm or refine each diff item. For each item:
  * "correct"  → keep as correct
  * "wrong"    → confirm wrong, OR downgrade to "minor" if the only issue
                 is capitalization, punctuation, or a US/UK spelling
                 variant (e.g. color/colour, organize/organise)
  * "missing"  → keep as missing (you cannot recover what isn't there)
  * "extra"    → keep as extra
- Compute a final score 0–100. Use:
      score = (correct_count + 0.5 * minor_count) / total_ref_count * 100
  rounded to one decimal.
- Write a short overall feedback message (1–3 sentences, in {lang_hint}).
- List notable errors (clear spelling mistakes worth pointing out) and
  minor issues (capitalization / punctuation only).

WHAT YOU MUST NOT DO
- Do not invent characters that aren't in `student_text`.
- Do not assume the OCR was wrong; trust it as ground truth.
- Do not reveal the reference text in the feedback (just describe issues).

LANGUAGE: {lang_hint}
MODE: {mode_hint}

REFERENCE:
\"\"\"
{reference}
\"\"\"

STUDENT (literal OCR):
\"\"\"
{student_text}
\"\"\"

MECHANICAL DIFF:
{diff_summary}

OUTPUT — return ONLY a single JSON object, no markdown, no commentary:
{{
  "score": <float 0..100>,
  "confirmed_items": [
    {{"ref": "<ref_word_or_null>", "ocr": "<ocr_word_or_null>", "status": "correct|wrong|minor|missing|extra"}},
    ...
  ],
  "overall_feedback": "<1-3 sentences>",
  "notable_errors": ["<short description>", ...],
  "minor_issues": ["<short description>", ...],
  "confidence": <float 0..1, your confidence in this judgement>
}}
"""


def _format_diff_for_prompt(diff: Dict[str, Any]) -> str:
    """Render the diff dict into a compact text block the LLM can read."""
    items = diff.get("items") or []
    counts = (
        f"correct={diff.get('correct_count', 0)}, "
        f"wrong={diff.get('wrong_count', 0)}, "
        f"missing={diff.get('missing_count', 0)}, "
        f"extra={diff.get('extra_count', 0)}, "
        f"total_ref={diff.get('total_ref', 0)}, "
        f"accuracy={diff.get('accuracy', 0)}%"
    )
    if not items:
        return f"counts: {counts}\n(no items)"
    sample = items[:120]  # cap to avoid huge prompts
    lines = [f"counts: {counts}", "items:"]
    for it in sample:
        ref = it.get("ref")
        ocr = it.get("ocr")
        lines.append(f"  - status={it.get('status')} ref={ref!r} ocr={ocr!r}")
    if len(items) > len(sample):
        lines.append(f"  ... ({len(items) - len(sample)} more items truncated)")
    return "\n".join(lines)


def parse_grading_response(text: str) -> Optional[Dict[str, Any]]:
    """Extract the JSON object from an LLM response.

    Returns the parsed dict, or None if the response cannot be parsed.
    """
    if not text:
        return None
    # Try direct parse first (best case: model returned pure JSON)
    try:
        return json.loads(text)
    except Exception:
        pass
    # Find the first {...} block
    match = _JSON_BLOCK_RE.search(text)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except Exception:
        return None


def normalize_grading_payload(
    raw: Dict[str, Any],
    fallback_score: float,
) -> Dict[str, Any]:
    """Coerce a raw LLM JSON response into a clean dict with defaults.

    This guarantees downstream code (service, repository, frontend) sees
    a consistent shape regardless of how creative the LLM was.
    """
    if not isinstance(raw, dict):
        return {
            "score": fallback_score,
            "confirmed_items": [],
            "overall_feedback": "",
            "notable_errors": [],
            "minor_issues": [],
            "confidence": 0.0,
        }
    score = _coerce_float(raw.get("score"), fallback_score)
    score = max(0.0, min(100.0, score))
    confidence = max(0.0, min(1.0, _coerce_float(raw.get("confidence"), 0.0)))
    return {
        "score": round(score, 2),
        "confirmed_items": _coerce_list_of_dicts(raw.get("confirmed_items")),
        "overall_feedback": str(raw.get("overall_feedback") or "").strip(),
        "notable_errors": _coerce_list_of_str(raw.get("notable_errors")),
        "minor_issues": _coerce_list_of_str(raw.get("minor_issues")),
        "confidence": round(confidence, 3),
    }


def _coerce_float(v: Any, default: float) -> float:
    try:
        return float(v)
    except Exception:
        return default


def _coerce_list_of_str(v: Any) -> List[str]:
    if not isinstance(v, list):
        return []
    return [str(x).strip() for x in v if x is not None and str(x).strip()]


def _coerce_list_of_dicts(v: Any) -> List[Dict[str, Any]]:
    if not isinstance(v, list):
        return []
    out = []
    for x in v:
        if isinstance(x, dict):
            out.append({
                "ref": x.get("ref"),
                "ocr": x.get("ocr"),
                "status": str(x.get("status") or "").strip() or "correct",
            })
    return out
