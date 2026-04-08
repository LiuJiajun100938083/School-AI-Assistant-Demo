"""
連結分類器 — 純函式葉節點
============================
職責: 給一個 URL,判斷是否為 YouTube / Vimeo / 一般連結,並回傳嵌入 iframe URL。
零 I/O,可零 fixture 單元測。
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional
from urllib.parse import parse_qs, urlparse


@dataclass
class EmbeddedMedia:
    kind: str          # 'youtube' / 'vimeo' / 'link'
    embed_url: str     # iframe src (空字串表示非 embedded)
    thumbnail: str     # 預覽圖 URL (可空)
    provider: str      # 'youtube' / 'vimeo' / ''


# ----- YouTube --------------------------------------------------------------

_YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"}
_YOUTUBE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


def _parse_youtube(url: str) -> Optional[str]:
    """從 YouTube URL 抽出 11 字元 video id,失敗回 None"""
    try:
        u = urlparse(url)
    except Exception:
        return None
    host = (u.netloc or "").lower()
    if host not in _YOUTUBE_HOSTS:
        return None
    # https://youtu.be/VIDEO_ID
    if "youtu.be" in host:
        vid = u.path.lstrip("/").split("/")[0]
        return vid if _YOUTUBE_ID_RE.match(vid) else None
    # https://www.youtube.com/watch?v=VIDEO_ID
    if u.path == "/watch":
        qs = parse_qs(u.query)
        vid = (qs.get("v") or [""])[0]
        return vid if _YOUTUBE_ID_RE.match(vid) else None
    # https://www.youtube.com/embed/VIDEO_ID
    if u.path.startswith("/embed/"):
        vid = u.path[len("/embed/"):].split("/")[0]
        return vid if _YOUTUBE_ID_RE.match(vid) else None
    # https://www.youtube.com/shorts/VIDEO_ID
    if u.path.startswith("/shorts/"):
        vid = u.path[len("/shorts/"):].split("/")[0]
        return vid if _YOUTUBE_ID_RE.match(vid) else None
    return None


# ----- Vimeo ----------------------------------------------------------------

_VIMEO_HOSTS = {"vimeo.com", "www.vimeo.com", "player.vimeo.com"}
_VIMEO_ID_RE = re.compile(r"^\d+$")


def _parse_vimeo(url: str) -> Optional[str]:
    try:
        u = urlparse(url)
    except Exception:
        return None
    host = (u.netloc or "").lower()
    if host not in _VIMEO_HOSTS:
        return None
    parts = [p for p in u.path.split("/") if p]
    # /123456 或 /video/123456
    for p in parts:
        if _VIMEO_ID_RE.match(p):
            return p
    return None


# ----- Public API -----------------------------------------------------------

def classify_url(url: str) -> EmbeddedMedia:
    """
    分類 URL 並回傳可嵌入資訊。
    - YouTube → 'youtube' kind, embed iframe URL, thumbnail
    - Vimeo   → 'vimeo'   kind, embed iframe URL
    - 其他    → 'link' kind, 空 embed_url
    """
    if not url:
        return EmbeddedMedia(kind="link", embed_url="", thumbnail="", provider="")

    yt = _parse_youtube(url)
    if yt:
        return EmbeddedMedia(
            kind="youtube",
            embed_url=f"https://www.youtube.com/embed/{yt}",
            thumbnail=f"https://i.ytimg.com/vi/{yt}/hqdefault.jpg",
            provider="youtube",
        )

    vm = _parse_vimeo(url)
    if vm:
        return EmbeddedMedia(
            kind="vimeo",
            embed_url=f"https://player.vimeo.com/video/{vm}",
            thumbnail="",
            provider="vimeo",
        )

    return EmbeddedMedia(kind="link", embed_url="", thumbnail="", provider="")
