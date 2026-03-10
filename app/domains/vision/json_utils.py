"""
JSON 提取、修復、驗證工具
========================
從 VisionService 拆出的純函數模組。
處理 Qwen3-VL 輸出的 JSON 解析、LaTeX 轉義修復、截斷修復等。
"""

import json
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)


# ================================================================
#  底層工具
# ================================================================

def compute_closers(s: str) -> str:
    """掃描 JSON 片段，返回需要的閉合符號（}] 等）。"""
    in_str = False
    esc = False
    stack = []
    for ch in s:
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
            stack.append('}')
        elif ch == '[':
            stack.append(']')
        elif ch in ('}', ']'):
            if stack and stack[-1] == ch:
                stack.pop()
    stack.reverse()
    return ''.join(stack)


# ================================================================
#  JSON 解析 / 修復
# ================================================================

def safe_json_loads(json_str: str) -> dict:
    """
    安全解析 JSON，處理模型常見的格式問題。

    處理 LaTeX 反斜槓衝突、裸換行、控制字元等。
    """

    def _fix_latex_escapes(s: str) -> str:
        """將 LaTeX 命令的反斜槓雙重轉義，保護不被 json.loads 吞掉。"""
        def _replace(m: re.Match) -> str:
            seq = m.group(1)
            if len(seq) > 1:
                return '\\\\' + seq
            return m.group(0)
        return re.sub(r'(?<!\\)\\([a-zA-Z]+)', _replace, s)

    # 第 0 步：清理控制字元
    cleaned = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', json_str)
    cleaned = cleaned.strip()

    # 第一次嘗試：修復 LaTeX 轉義後解析
    fixed = _fix_latex_escapes(cleaned)
    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass

    # 第二次嘗試：修復字串值內的裸換行符
    def _fix_newlines_in_strings(s: str) -> str:
        """遍歷字元，在字串值內部將裸換行替換為 \\n"""
        result = []
        in_str = False
        esc = False
        for ch in s:
            if esc:
                result.append(ch)
                esc = False
                continue
            if ch == '\\' and in_str:
                result.append(ch)
                esc = True
                continue
            if ch == '"':
                in_str = not in_str
                result.append(ch)
                continue
            if in_str and ch == '\n':
                result.append('\\n')
                continue
            if in_str and ch == '\r':
                result.append('\\r')
                continue
            if in_str and ch == '\t':
                result.append('\\t')
                continue
            result.append(ch)
        return ''.join(result)

    fixed2 = _fix_newlines_in_strings(fixed)
    try:
        return json.loads(fixed2)
    except json.JSONDecodeError:
        pass

    # 第三次嘗試：把所有反斜槓統一雙重轉義（更激進）
    try:
        aggressive = cleaned.replace('\\', '\\\\')
        return json.loads(aggressive)
    except json.JSONDecodeError:
        pass

    # 第四次嘗試：截斷修復
    repaired = repair_truncated_json(cleaned)
    if repaired is not None:
        return repaired

    # 最終回退：拋出原始錯誤讓上層處理
    return json.loads(json_str)


def repair_truncated_json(s: str):
    """
    嘗試修復被截斷的 JSON 字符串。

    模型輸出經常在末尾被截斷，導致 JSON 不完整。
    """
    if not s or not s.strip().startswith("{"):
        return None

    s = s.strip()

    # 掃描字符串，追蹤狀態
    in_str = False
    esc = False
    open_stack = []
    last_comma_pos = -1

    for i, ch in enumerate(s):
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
            open_stack.append('{')
        elif ch == '[':
            open_stack.append('[')
        elif ch == '}':
            if open_stack and open_stack[-1] == '{':
                open_stack.pop()
        elif ch == ']':
            if open_stack and open_stack[-1] == '[':
                open_stack.pop()
        elif ch == ',':
            last_comma_pos = i

    # 如果已經平衡，不需要修復
    if not open_stack and not in_str:
        return None

    candidates = []

    # 策略 1：截斷到最後一個逗號，再閉合
    if in_str or open_stack:
        if last_comma_pos > 0:
            truncated = s[:last_comma_pos]
            closers = compute_closers(truncated)
            candidates.append(truncated + closers)

    # 策略 2：直接閉合
    attempt = s
    if in_str:
        attempt += '"'
    closers = compute_closers(attempt)
    candidates.append(attempt + closers)

    for candidate in candidates:
        try:
            return json.loads(candidate)
        except (json.JSONDecodeError, ValueError):
            continue

    return None


# ================================================================
#  文本清理 / 推理判定
# ================================================================

def strip_thinking_tags(content: str) -> str:
    """移除 <think>...</think> 標籤"""
    return re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()


def looks_like_pure_reasoning(text: str) -> bool:
    """
    多特徵判斷文本是否為純推理（非 JSON / 非結構化輸出）。

    特徵：
    1. 無 { 字符
    2. 以推理起手式開頭（中英文）
    3. { 出現位置很晚 (>50%)
    4. 無 exam-relevant JSON 鍵名
    5. 包含冒號列表敘述風格
    """
    stripped = text.strip()
    if not stripped:
        return True

    if '{' not in stripped:
        return True

    clean = re.sub(r'^<think>\s*', '', stripped, flags=re.IGNORECASE).strip()
    lower = clean.lower()

    reasoning_starts = (
        "got it", "let me", "okay", "ok,", "first", "the ",
        "i ", "looking", "starting", "alright", "now,", "so,",
        "let's", "sure", "here",
        "好的", "讓我", "我來", "首先", "看看", "這", "根據",
        "嗯", "先", "需要", "分析", "觀察",
        "我需要", "圖片內容", "圖片中", "這是一份",
        "試卷", "接下來",
    )
    starts_with_reasoning = any(lower.startswith(p) for p in reasoning_starts)

    first_brace = clean.find('{')
    brace_late = first_brace > len(clean) * 0.5

    scan_window = clean[first_brace:first_brace + 800] if first_brace >= 0 else ""
    has_exam_keys = any(
        k in scan_window
        for k in ('"questions"', '"question"', '"items"', '"paper_title"', '"answer"')
    )

    narrative_indicators = sum(1 for p in ("：", ":\n", "- ", "* ", "。\n") if p in clean[:500])
    is_narrative = narrative_indicators >= 3

    if starts_with_reasoning:
        if brace_late:
            return True
        if not has_exam_keys:
            return True
        if is_narrative and not has_exam_keys:
            return True

    if is_narrative and not has_exam_keys and brace_late:
        return True

    return False


# ================================================================
#  JSON 提取
# ================================================================

def extract_json_from_thinking(text: str) -> str:
    """
    從 thinking 模式的混合文本中智能提取 JSON 塊。

    策略：找到所有 '{' 位置，從每個位置做括號匹配，
    嘗試解析為 JSON，返回第一個含 'question' 或 'answer' 鍵的有效 JSON 字符串。
    """
    # 先嘗試 ```json ... ``` 塊
    if "```json" in text:
        block = text.split("```json")[1].split("```")[0].strip()
        if block:
            return block
    if "```" in text:
        parts = text.split("```")
        if len(parts) >= 3:
            block = parts[1].strip()
            if block.startswith("{"):
                return block

    # 從每個 '{' 位置做括號匹配
    candidates = []
    i = 0
    while i < len(text):
        if text[i] == '{':
            depth = 0
            in_str = False
            esc = False
            for j in range(i, len(text)):
                ch = text[j]
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
                        candidate = text[i:j + 1]
                        if ('"question"' in candidate or '"answer"' in candidate):
                            candidates.append(candidate)
                        break
        i += 1

    if candidates:
        candidates.sort(key=len, reverse=True)
        return candidates[0]

    # 回退：嘗試找到任何足夠大的 {...} 塊
    all_candidates = []
    i = 0
    while i < len(text):
        if text[i] == '{':
            depth = 0
            in_str = False
            esc = False
            for j in range(i, len(text)):
                ch = text[j]
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
                        candidate = text[i:j + 1]
                        if len(candidate) > 100:
                            all_candidates.append(candidate)
                        break
        i += 1

    if all_candidates:
        all_candidates.sort(key=len, reverse=True)
        return all_candidates[0]

    # 最終回退：傳統 find/rfind
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return text[start:end + 1]

    return text


def extract_json_from_reasoning(text: str) -> str:
    """
    從模型的推理文本中提取嵌入的 JSON 對象。

    嘗試找到包含 "question" 字段的最大合法 JSON 對象。
    """
    # 優先提取 ```json ... ``` 包裹的 JSON
    m = re.search(r"```json\s*(.*?)```", text, re.DOTALL)
    if m:
        candidate = m.group(1).strip()
        try:
            safe_json_loads(candidate)
            return candidate
        except (json.JSONDecodeError, ValueError):
            pass

    # 收集所有包含 "question" 的 { 起始位置
    candidates_start = []
    for i, ch in enumerate(text):
        if ch == '{':
            rest = text[i:]
            if '"question"' in rest[:500]:
                candidates_start.append(i)

    # 逐個嘗試括號匹配 + 解析
    for start in candidates_start:
        depth = 0
        in_string = False
        escape_next = False
        for i in range(start, len(text)):
            ch = text[i]
            if escape_next:
                escape_next = False
                continue
            if ch == '\\' and in_string:
                escape_next = True
                continue
            if ch == '"' and not escape_next:
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    candidate = text[start:i + 1]
                    try:
                        safe_json_loads(candidate)
                        return candidate
                    except (json.JSONDecodeError, ValueError):
                        break

    return ""


# ================================================================
#  Exam schema 驗證
# ================================================================

def try_parse_exam_json(text: str) -> Optional[dict]:
    """嘗試解析 JSON，失敗返回 None"""
    try:
        result = json.loads(text)
        return result if isinstance(result, dict) else None
    except (json.JSONDecodeError, ValueError):
        return None


def validate_exam_json(text: str) -> bool:
    """
    驗證文本是否為合法的 exam OCR JSON（schema 層級檢查）。

    不只是 json.loads 成功，還要滿足最低 schema:
    - 是 dict
    - 包含 questions / items / paper_title 之一
    """
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return False
    if not isinstance(data, dict):
        return False
    exam_keys = {"questions", "items", "paper_title", "total_score"}
    if not exam_keys.intersection(data.keys()):
        return False
    qs = data.get("questions") or data.get("items")
    if isinstance(qs, list) and len(qs) > 0:
        return True
    if data.get("paper_title"):
        return True
    return False


def validate_ocr_json(text: str) -> bool:
    """
    驗證文本是否為合法的 OCR JSON（普通題目識別格式）。

    最低 schema:
    - 是 dict
    - 包含 question 欄位（非空）
    """
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return False
    if not isinstance(data, dict):
        return False
    if data.get("question"):
        return True
    return False


def validate_vision_json(text: str) -> bool:
    """通用驗證：試卷 JSON 或 OCR JSON 任一格式合法即通過。"""
    return validate_exam_json(text) or validate_ocr_json(text)
