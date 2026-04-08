"""
貼文排序 / 搜尋 / 標籤過濾 — 純函式葉節點
============================================
Service 層從 repo 拿到 posts list 後,交給這裡做純記憶體過濾 + 排序。
不碰 DB,好測。
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

SORT_LATEST = "latest"
SORT_OLDEST = "oldest"
SORT_MOST_LIKED = "most_liked"
SORT_AUTHOR = "author"
SORT_ORDER_INDEX = "order_index"  # 預設:遵循 order_index 欄位

SORT_CHOICES = frozenset({
    SORT_LATEST, SORT_OLDEST, SORT_MOST_LIKED, SORT_AUTHOR, SORT_ORDER_INDEX,
})


def _key_latest(p: Dict[str, Any]):
    return p.get("created_at") or 0

def _key_oldest(p: Dict[str, Any]):
    return p.get("created_at") or 0

def _key_most_liked(p: Dict[str, Any]):
    return p.get("like_count", 0) or 0

def _key_author(p: Dict[str, Any]):
    return (p.get("author_name") or "").lower()

def _key_order(p: Dict[str, Any]):
    return (p.get("order_index", 0), p.get("id", 0))


_KEY_MAP: Dict[str, Tuple[Callable[[Dict[str, Any]], Any], bool]] = {
    SORT_LATEST:      (_key_latest, True),    # desc
    SORT_OLDEST:      (_key_oldest, False),
    SORT_MOST_LIKED:  (_key_most_liked, True),
    SORT_AUTHOR:      (_key_author, False),
    SORT_ORDER_INDEX: (_key_order, False),
}


def sort_posts(posts: Iterable[Dict[str, Any]], mode: str = SORT_ORDER_INDEX) -> List[Dict[str, Any]]:
    """依 mode 排序。pinned=True 永遠排在最前,pinned 內部再依 mode 排。"""
    mode = mode if mode in SORT_CHOICES else SORT_ORDER_INDEX
    key_fn, reverse = _KEY_MAP[mode]
    pinned = [p for p in posts if p.get("pinned")]
    normal = [p for p in posts if not p.get("pinned")]
    pinned.sort(key=key_fn, reverse=reverse)
    normal.sort(key=key_fn, reverse=reverse)
    return pinned + normal


def search_posts(posts: Iterable[Dict[str, Any]], query: str) -> List[Dict[str, Any]]:
    """不分大小寫,匹配 title / body / author_name。空 query 回全部。"""
    q = (query or "").strip().lower()
    if not q:
        return list(posts)
    out: List[Dict[str, Any]] = []
    for p in posts:
        hay = " ".join(str(p.get(k) or "") for k in ("title", "body", "author_name"))
        if q in hay.lower():
            out.append(p)
    return out


def filter_by_tags(posts: Iterable[Dict[str, Any]], tags: Optional[List[str]]) -> List[Dict[str, Any]]:
    """回傳含 ANY 指定 tag 的貼文。空 tags 回全部。"""
    if not tags:
        return list(posts)
    tagset = {t.lower() for t in tags if t}
    out: List[Dict[str, Any]] = []
    for p in posts:
        ptags = p.get("tags") or []
        if any((t or "").lower() in tagset for t in ptags):
            out.append(p)
    return out


def apply_view(
    posts: Iterable[Dict[str, Any]],
    *,
    sort: str = SORT_ORDER_INDEX,
    query: str = "",
    tags: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """一次套用 search + tag filter + sort。"""
    lst = list(posts)
    lst = search_posts(lst, query)
    lst = filter_by_tags(lst, tags)
    lst = sort_posts(lst, sort)
    return lst
