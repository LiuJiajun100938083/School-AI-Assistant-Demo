"""
協作佈告板 — 連結元資料 (LinkMeta) Provider
==============================================
職責: 從 URL 抓取 og:title / og:description / og:image / og:site_name。

分層:
  - `LinkMeta` dataclass: 不可變結構，to_dict 序列化
  - `parse_og_meta(html, url)`: 純函式，靜態 HTML → LinkMeta
  - `LinkMetaProvider` protocol: 可替換介面
  - `HttpLinkMetaProvider`: 預設實作，fetcher 可注入（測試友好）

設計原則:
  - 解析與抓取分離：parse_og_meta 可零網路測試
  - 抓取失敗返回 minimal LinkMeta 而不 raise（讓貼文仍可建立）
  - fetcher 介面 `(url, timeout) -> html_text`，預設用 urllib
"""

from __future__ import annotations

import logging
import re
from dataclasses import asdict, dataclass, field
from typing import Callable, Optional, Protocol
from urllib.parse import urljoin

logger = logging.getLogger(__name__)


# ============================================================
# LinkMeta dataclass
# ============================================================

@dataclass
class LinkMeta:
    url: str
    title: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    site_name: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


# ============================================================
# 純函式解析
# ============================================================

# 使用正則，不引 bs4 依賴（保持輕量）。
# 對於 og tag，property 或 name 都支援，content 雙引號或單引號都支援。
_META_RE = re.compile(
    r'<meta\s+[^>]*?(?:property|name)\s*=\s*["\']([^"\']+)["\'][^>]*?content\s*=\s*["\']([^"\']*)["\']',
    re.IGNORECASE | re.DOTALL,
)
_META_RE_REV = re.compile(
    r'<meta\s+[^>]*?content\s*=\s*["\']([^"\']*)["\'][^>]*?(?:property|name)\s*=\s*["\']([^"\']+)["\']',
    re.IGNORECASE | re.DOTALL,
)
_TITLE_RE = re.compile(r"<title[^>]*>([^<]*)</title>", re.IGNORECASE | re.DOTALL)


def _extract_meta_map(html: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for key, val in _META_RE.findall(html):
        result.setdefault(key.lower(), val.strip())
    for val, key in _META_RE_REV.findall(html):
        result.setdefault(key.lower(), val.strip())
    return result


def parse_og_meta(html: str, url: str) -> LinkMeta:
    """從 HTML 文本抽取 open graph / 基礎 meta

    規則:
      - og:title 優先於 <title>
      - og:description 優先於 meta[name=description]
      - og:image 相對路徑 → 絕對
    """
    if not html:
        return LinkMeta(url=url)

    meta = _extract_meta_map(html)

    title = meta.get("og:title")
    if not title:
        m = _TITLE_RE.search(html)
        if m:
            title = m.group(1).strip() or None

    description = meta.get("og:description") or meta.get("description")
    image = meta.get("og:image")
    if image:
        image = urljoin(url, image)
    site_name = meta.get("og:site_name")

    return LinkMeta(
        url=url,
        title=title or None,
        description=description or None,
        image=image or None,
        site_name=site_name or None,
    )


# ============================================================
# Provider 介面
# ============================================================

class LinkMetaProvider(Protocol):
    def fetch(self, url: str) -> LinkMeta: ...


# ============================================================
# 預設 HTTP 實作
# ============================================================

Fetcher = Callable[[str, float], str]


def _default_fetcher(url: str, timeout: float) -> str:
    """最小化 fetcher — 用 stdlib urllib 避免引入依賴"""
    from urllib.request import Request, urlopen

    req = Request(url, headers={"User-Agent": "PKMS-LinkMeta/1.0"})
    with urlopen(req, timeout=timeout) as resp:  # noqa: S310 (trusted teacher input)
        raw = resp.read(512 * 1024)  # 只取前 512KB，避免大檔
        charset = resp.headers.get_content_charset() or "utf-8"
        return raw.decode(charset, errors="replace")


class HttpLinkMetaProvider:
    """HTTP 抓取 → parse_og_meta

    失敗時返回 minimal LinkMeta(url=url)，不 raise。
    """

    def __init__(self, timeout: float = 5.0, fetcher: Optional[Fetcher] = None):
        self._timeout = timeout
        self._fetcher = fetcher or _default_fetcher

    def fetch(self, url: str) -> LinkMeta:
        try:
            html = self._fetcher(url, self._timeout)
            return parse_og_meta(html, url)
        except Exception as e:  # noqa: BLE001
            logger.warning("LinkMeta fetch failed for %s: %s", url, e)
            return LinkMeta(url=url)
