"""課堂點名 / 隨機分組 — 純函式葉節點

職責:
  - 從已載入的學生列表中執行隨機抽取
  - 把學生列表切成 K 組 或 每組 N 人
  - 加密等級隨機(secrets.SystemRandom),公平且不可預測

不碰 DB、不讀檔案、不解析 HTTP。載入學生的責任在 router/service 層。
"""

import secrets
from typing import Any, Dict, List, Sequence

from app.domains.tools.exceptions import ToolInputError

# 加密安全的 RNG — 對課堂公平性足夠
_RNG = secrets.SystemRandom()

# 參數上限,防止前端送無上限的數字
MAX_PICK = 200
MAX_GROUPS = 100


# ============================================================
# 抽人
# ============================================================

def pick_random_students(
    students: Sequence[Dict[str, Any]],
    *,
    n: int,
    exclude_ids: Sequence[int] = (),
    allow_repeat: bool = False,
) -> List[Dict[str, Any]]:
    """
    從 students 池中隨機抽取 n 個學生。

    Args:
        students: 學生 dict 列表,每個必須有 "id" 欄位
        n: 要抽幾個
        exclude_ids: 排除池子(通常是「已抽過」的 id 列表)
        allow_repeat: True 時 exclude_ids 被忽略,可重複抽到同一人

    Returns:
        被抽中的學生 dict 列表,順序隨機

    Raises:
        ToolInputError: n 不合法 或 池子耗盡
    """
    if n is None or n < 1:
        raise ToolInputError("TOOL_INPUT_INVALID", "n 必須 ≥ 1")
    if n > MAX_PICK:
        raise ToolInputError("TOOL_INPUT_TOO_LARGE", f"一次最多抽 {MAX_PICK} 人")

    if allow_repeat:
        pool = list(students)
    else:
        excluded = set(exclude_ids or ())
        pool = [s for s in students if s.get("id") not in excluded]

    if not pool:
        raise ToolInputError("ROLL_CALL_POOL_EMPTY", "池子已空,沒有可抽的學生")

    if allow_repeat:
        # 有放回抽樣 — 直接用 RNG.choice n 次
        return [_RNG.choice(pool) for _ in range(n)]

    # 無放回抽樣 — 若 n > pool 就抽到滿池為止(而不是 raise)
    k = min(n, len(pool))
    return _RNG.sample(pool, k)


# ============================================================
# 分組
# ============================================================

def group_by_size(
    students: Sequence[Dict[str, Any]],
    *,
    size: int,
) -> List[List[Dict[str, Any]]]:
    """
    把 students 洗牌後,每組 size 人分組,最後一組可能不滿。

    Args:
        students: 學生列表
        size: 每組人數

    Returns:
        List[List[student]]
    """
    if size is None or size < 1:
        raise ToolInputError("TOOL_INPUT_INVALID", "每組人數必須 ≥ 1")
    if size > MAX_PICK:
        raise ToolInputError("TOOL_INPUT_TOO_LARGE", f"每組最多 {MAX_PICK} 人")

    pool = list(students)
    if not pool:
        return []

    _RNG.shuffle(pool)
    groups: List[List[Dict[str, Any]]] = []
    for i in range(0, len(pool), size):
        groups.append(pool[i : i + size])
    return groups


def group_by_count(
    students: Sequence[Dict[str, Any]],
    *,
    count: int,
) -> List[List[Dict[str, Any]]]:
    """
    把 students 洗牌後平均分成 count 組(剩餘的輪流加入前幾組)。

    Args:
        students: 學生列表
        count: 組數

    Returns:
        List[List[student]],長度等於 count(若人數 < count 則多出來的空組被丟棄)
    """
    if count is None or count < 1:
        raise ToolInputError("TOOL_INPUT_INVALID", "組數必須 ≥ 1")
    if count > MAX_GROUPS:
        raise ToolInputError("TOOL_INPUT_TOO_LARGE", f"最多分 {MAX_GROUPS} 組")

    pool = list(students)
    if not pool:
        return []

    _RNG.shuffle(pool)
    groups: List[List[Dict[str, Any]]] = [[] for _ in range(count)]
    for idx, student in enumerate(pool):
        groups[idx % count].append(student)

    # 若學生比組數少,尾端會有空組 — 過濾掉,避免前端顯示空卡片
    return [g for g in groups if g]
