"""
OCR 結果解析
============
從 VisionService 拆出。解析視覺模型的 JSON/文本輸出為 OCRResult。
"""

import json
import logging
import re

from app.domains.vision.schemas import OCRResult, RecognitionSubject, RecognitionTask
from app.domains.vision import json_utils
from app.domains.vision.figure_handler import normalize_figure_description

logger = logging.getLogger(__name__)


def parse_ocr_response(
    raw_response: str,
    subject: RecognitionSubject,
    task: RecognitionTask,
) -> OCRResult:
    """解析視覺模型的 JSON 輸出"""
    try:
        json_str = json_utils.extract_json_from_thinking(raw_response)
        data = json_utils.safe_json_loads(json_str)

        fig_desc_raw = data.get("figure_description", "")
        fig_desc = normalize_figure_description(fig_desc_raw)

        cb = data.get("confidence_breakdown")
        q_conf = 0.0
        a_conf = 0.0
        f_conf = 0.0
        if isinstance(cb, dict):
            q_conf = float(cb.get("question", 0.0))
            a_conf = float(cb.get("answer", 0.0))
            f_conf = float(cb.get("figure", 0.0))

        return OCRResult(
            question_text=data.get("question", ""),
            answer_text=data.get("answer", ""),
            figure_description=fig_desc,
            raw_text=raw_response,
            confidence=0.85 if not data.get("notes") else 0.65,
            has_math_formula=data.get("has_math_formula", False),
            has_handwriting=data.get("has_handwriting", False),
            metadata={
                k: v
                for k, v in data.items()
                if k not in ("question", "answer", "figure_description",
                             "confidence_breakdown")
            },
            success=True,
            question_confidence=q_conf,
            answer_confidence=a_conf,
            figure_confidence=f_conf,
        )

    except (json.JSONDecodeError, KeyError) as e:
        logger.warning("OCR JSON 解析失敗，嘗試正則提取: %s", e)
        return fallback_extract(raw_response, e)


def fallback_extract(raw_response: str, error: Exception) -> OCRResult:
    """JSON 解析失敗時，用正則從原始文本提取內容"""
    text = raw_response

    question = regex_extract_field(text, "question")
    answer = regex_extract_field(text, "answer")
    fig_desc = regex_extract_field(text, "figure_description")

    for old, new in [("\\\\", "\\"), ("\\n", "\n"), ("\\t", "\t"), ('\\"', '"')]:
        question = question.replace(old, new)
        answer = answer.replace(old, new)
        fig_desc = fig_desc.replace(old, new)

    fig_desc = normalize_figure_description(fig_desc)

    confidence = 0.7 if (question and answer) else 0.3

    if question or answer:
        logger.info("正則回退提取成功: question=%d字, answer=%d字, figure_description=%d字",
                    len(question), len(answer), len(fig_desc))
    else:
        logger.warning("正則回退也無法提取內容, raw前200字: %s", text[:200])

    return OCRResult(
        question_text=question,
        answer_text=answer,
        figure_description=fig_desc,
        raw_text=raw_response,
        confidence=confidence,
        has_handwriting='"has_handwriting": true' in text.lower()
            or '"has_handwriting":true' in text.lower(),
        has_math_formula='"has_math_formula": true' in text.lower()
            or '"has_math_formula":true' in text.lower(),
        metadata={"parse_error": str(error), "fallback": True},
        success=True,
    )


def regex_extract_field(text: str, field_name: str) -> str:
    """
    從不完整的 JSON 文本中提取指定欄位的值。

    嘗試多種模式：
    1. 嵌套 JSON 物件 "field": {...}
    2. 標準 JSON 雙引號字符串
    3. 長字符串（含未轉義換行）
    4. 數組格式 [...]
    5. 純文本值（無引號）
    """
    # 模式 5（優先）：嵌套 JSON 物件
    obj_start = re.search(rf'"{field_name}"\s*:\s*\{{', text)
    if obj_start:
        brace_pos = obj_start.end() - 1
        depth = 0
        in_str = False
        esc = False
        for i in range(brace_pos, len(text)):
            ch = text[i]
            if esc:
                esc = False
                continue
            if ch == '\\' and in_str:
                esc = True
                continue
            if ch == '"' and not esc:
                in_str = not in_str
                continue
            if in_str:
                continue
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    return text[brace_pos:i + 1]
        if depth > 0:
            return text[brace_pos:]

    # 模式 1：標準 JSON 字符串
    m = re.search(
        rf'"{field_name}"\s*:\s*"((?:[^"\\]|\\.)*)"', text, re.DOTALL
    )
    if m and m.group(1).strip():
        return m.group(1).strip()

    # 模式 2：含未轉義換行的長字符串
    next_fields = (
        r'(?="(?:question|answer|figure_description|has_figure|'
        r'has_handwriting|has_math_formula|steps|notes|'
        r'correct_answer|error_type|knowledge_points|'
        r'spelling_issues|word_list|potential_misspellings|'
        r'paragraph_count|estimated_word_count)"\s*:)'
    )
    m2 = re.search(
        rf'"{field_name}"\s*:\s*"([\s\S]*?)"\s*(?:,\s*{next_fields}|,?\s*\}})',
        text,
    )
    if m2 and m2.group(1).strip():
        return m2.group(1).strip()

    # 模式 3：數組值
    m3 = re.search(
        rf'"{field_name}"\s*:\s*\[([\s\S]*?)\]', text
    )
    if m3:
        items = re.findall(r'"((?:[^"\\]|\\.)*)"', m3.group(1))
        if items:
            return "\n".join(items)

    # 模式 4：純文本值
    m4 = re.search(
        rf'"{field_name}"\s*:\s*([^",\}}\]]+)', text
    )
    if m4 and m4.group(1).strip() not in ("null", "true", "false", ""):
        return m4.group(1).strip()

    return ""
