"""
@mention 解析 — 純函式葉節點
==============================
從一段文字抽出 @username 列表。

規則:
  - username 由英數/底線/連字符/中文組成,長度 1–32
  - @ 前必須是字串開頭或空白字元
  - 回傳去重的 list,保留首次出現順序

用於:
  - 建評論時記錄 mentions JSON
  - 未來前端 autocomplete / 高亮渲染
"""

from __future__ import annotations

import re
from typing import List

# @ 前哨: 行首 或 whitespace
_MENTION_RE = re.compile(
    r"(?:^|(?<=\s))@([A-Za-z0-9_\-\u4e00-\u9fff]{1,32})"
)


def extract_mentions(text: str) -> List[str]:
    """抽取 @mention,去重保序。失敗或空字串回 []。"""
    if not text:
        return []
    seen: List[str] = []
    seen_set = set()
    for m in _MENTION_RE.finditer(text):
        name = m.group(1)
        if name and name not in seen_set:
            seen.append(name)
            seen_set.add(name)
    return seen
