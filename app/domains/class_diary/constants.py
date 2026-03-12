"""
課室日誌 — 行為原因代碼 (reason_code) 標準化
"""

from typing import Dict, List, Tuple

# ── 各類別行為原因 ──
# 每個 reason: (code, text)
# code 用於聚合和統計分析，text 用於前端顯示

REASON_CODES: Dict[str, List[Dict[str, str]]] = {
    "praise": [
        {"code": "ACTIVE", "text": "上課積極"},
        {"code": "ANSWER", "text": "勇於回答問題"},
        {"code": "ATTENTIVE", "text": "認真聽講"},
        {"code": "HELPFUL", "text": "樂於助人"},
        {"code": "OUTSTANDING", "text": "表現出色"},
        {"code": "SELF_STUDY", "text": "主動學習"},
    ],
    "classroom": [
        {"code": "CHAT", "text": "聊天"},
        {"code": "INATTENTIVE", "text": "不認真"},
        {"code": "HORSEPLAY", "text": "嬉戲打鬧"},
        {"code": "DISRUPT", "text": "擾亂課堂秩序"},
        {"code": "SLEEP", "text": "睡覺"},
        {"code": "PHONE", "text": "使用手機"},
        {"code": "IPAD", "text": "違規使用iPad"},
    ],
    "appearance": [
        {"code": "TIE", "text": "領帶不整"},
        {"code": "SHIRT", "text": "未將恤衫塞入西褲"},
        {"code": "SHOES", "text": "未穿校鞋"},
        {"code": "JACKET", "text": "校褸不整"},
        {"code": "HAIR", "text": "頭髮過長/染髮"},
        {"code": "UNIFORM", "text": "未穿整齊校服"},
    ],
    "medical": [
        {"code": "HEADACHE", "text": "頭痛"},
        {"code": "STOMACH", "text": "肚痛"},
        {"code": "INJURY", "text": "受傷"},
        {"code": "UNWELL", "text": "身體不適"},
        {"code": "FEVER", "text": "發燒"},
    ],
}

# ── 反查表 ──

# code → (category, text)
REASON_CODE_LOOKUP: Dict[str, Tuple[str, str]] = {}
for _cat, _reasons in REASON_CODES.items():
    for _r in _reasons:
        REASON_CODE_LOOKUP[_r["code"]] = (_cat, _r["text"])

# text → code (用於舊格式轉換)
REASON_TEXT_TO_CODE: Dict[str, str] = {}
for _reasons in REASON_CODES.values():
    for _r in _reasons:
        REASON_TEXT_TO_CODE[_r["text"]] = _r["code"]
