"""
佈告板主題 — 靜態配置葉節點
==============================
20+ 預設主題,可配置,service 層查 name → 取樣式字典。
前端也讀同一份清單(透過 API /themes)。
"""

from __future__ import annotations

from typing import Dict, List, TypedDict


class Theme(TypedDict):
    id: str
    name: str
    background: str      # CSS background 屬性 (顏色/漸層/圖 URL)
    card_bg: str         # 貼文卡片背景
    text: str            # 主要文字色


BOARD_THEMES: List[Theme] = [
    {"id": "default",     "name": "預設",       "background": "#F5F5F7", "card_bg": "#ffffff", "text": "#1d1d1f"},
    {"id": "paper",       "name": "牛皮紙",     "background": "#f4ebd0", "card_bg": "#fffdf7", "text": "#3a2d1f"},
    {"id": "blackboard",  "name": "黑板",       "background": "#2b3a2d", "card_bg": "#f8f8f8", "text": "#1d1d1f"},
    {"id": "cork",        "name": "軟木板",     "background": "#c99765", "card_bg": "#fff8ec", "text": "#2b1b0e"},
    {"id": "grid_light",  "name": "淺色格線",   "background": "#fafafa", "card_bg": "#ffffff", "text": "#1d1d1f"},
    {"id": "grid_dark",   "name": "深色格線",   "background": "#1f2937", "card_bg": "#2a3441", "text": "#f3f4f6"},
    {"id": "sky",         "name": "天空藍",     "background": "linear-gradient(180deg,#dbeafe,#eff6ff)", "card_bg": "#ffffff", "text": "#0f172a"},
    {"id": "sunset",      "name": "日落",       "background": "linear-gradient(180deg,#fde68a,#fca5a5)", "card_bg": "#ffffff", "text": "#1d1d1f"},
    {"id": "forest",      "name": "森林",       "background": "linear-gradient(180deg,#bbf7d0,#dcfce7)", "card_bg": "#ffffff", "text": "#14532d"},
    {"id": "peach",       "name": "蜜桃",       "background": "#fde2e4", "card_bg": "#ffffff", "text": "#7c2d12"},
    {"id": "lavender",    "name": "薰衣草",     "background": "#e9d5ff", "card_bg": "#ffffff", "text": "#3b0764"},
    {"id": "mint",        "name": "薄荷",       "background": "#d1fae5", "card_bg": "#ffffff", "text": "#064e3b"},
    {"id": "lemon",       "name": "檸檬",       "background": "#fef3c7", "card_bg": "#ffffff", "text": "#78350f"},
    {"id": "ocean",       "name": "海洋",       "background": "linear-gradient(180deg,#bae6fd,#e0f2fe)", "card_bg": "#ffffff", "text": "#0c4a6e"},
    {"id": "coral",       "name": "珊瑚",       "background": "linear-gradient(180deg,#fecaca,#fed7aa)", "card_bg": "#ffffff", "text": "#7f1d1d"},
    {"id": "midnight",    "name": "午夜",       "background": "#0f172a", "card_bg": "#1e293b", "text": "#f1f5f9"},
    {"id": "rose",        "name": "玫瑰",       "background": "#fce7f3", "card_bg": "#ffffff", "text": "#831843"},
    {"id": "sage",        "name": "鼠尾草",     "background": "#ecfccb", "card_bg": "#ffffff", "text": "#365314"},
    {"id": "gold",        "name": "黃金",       "background": "linear-gradient(180deg,#fef08a,#fde68a)", "card_bg": "#ffffff", "text": "#713f12"},
    {"id": "sakura",      "name": "櫻花",       "background": "linear-gradient(180deg,#fbcfe8,#f9a8d4)", "card_bg": "#ffffff", "text": "#831843"},
]

_THEME_MAP: Dict[str, Theme] = {t["id"]: t for t in BOARD_THEMES}


def get_theme(theme_id: str) -> Theme:
    """取主題,找不到回預設。"""
    return _THEME_MAP.get(theme_id) or _THEME_MAP["default"]


def list_themes() -> List[Theme]:
    return list(BOARD_THEMES)
