"""
佈告板模板庫 — 靜態 seed
==========================
教師建板時可以選「空白」或套用一個模板,模板會預先產生 sections + 示例 posts。
內容宣告式,易擴充。
"""

from __future__ import annotations

from typing import Any, Dict, List


TEMPLATES: List[Dict[str, Any]] = [
    {
        "id": "blank",
        "name": "空白",
        "description": "從頭開始",
        "layout": "grid",
        "theme": "default",
        "sections": [],
        "posts": [],
    },
    {
        "id": "reading_reflection",
        "name": "讀後感分享",
        "description": "每位學生分享一本最近讀的書",
        "layout": "grid",
        "theme": "paper",
        "sections": [],
        "posts": [
            {"kind": "text", "title": "範例:《小王子》", "body": "書中最打動我的句子:「真正重要的東西,用眼睛是看不見的。」\n\n讀後感:..."},
        ],
    },
    {
        "id": "group_project",
        "name": "分組作業板",
        "description": "老師可在建板後把 section 改成 group 並指派組員",
        "layout": "shelf",
        "theme": "grid_light",
        "sections": [
            {"name": "A 組", "kind": "column", "order_index": 0},
            {"name": "B 組", "kind": "column", "order_index": 1},
            {"name": "C 組", "kind": "column", "order_index": 2},
            {"name": "D 組", "kind": "column", "order_index": 3},
        ],
        "posts": [],
    },
    {
        "id": "brainstorm",
        "name": "頭腦風暴",
        "description": "自由畫布,貼點子、拖動重組",
        "layout": "canvas",
        "theme": "cork",
        "sections": [],
        "posts": [
            {"kind": "text", "title": "問題", "body": "今天要討論的主題是...", "canvas_x": 80, "canvas_y": 80},
            {"kind": "text", "title": "想法 1", "body": "", "canvas_x": 380, "canvas_y": 80},
            {"kind": "text", "title": "想法 2", "body": "", "canvas_x": 680, "canvas_y": 80},
        ],
    },
    {
        "id": "exit_ticket",
        "name": "下課 Exit Ticket",
        "description": "今天學到了什麼?有什麼疑問?",
        "layout": "shelf",
        "theme": "sky",
        "sections": [
            {"name": "我學到了...", "kind": "column", "order_index": 0},
            {"name": "我還想知道...", "kind": "column", "order_index": 1},
            {"name": "我覺得困難的是...", "kind": "column", "order_index": 2},
        ],
        "posts": [],
    },
    {
        "id": "class_wall",
        "name": "班級互動牆",
        "description": "自由發帖、留言、互動",
        "layout": "grid",
        "theme": "mint",
        "sections": [],
        "posts": [],
    },
    {
        "id": "vocab_wall",
        "name": "英文單字牆",
        "description": "每人貼一個新學的單字 + 例句",
        "layout": "grid",
        "theme": "sky",
        "sections": [],
        "posts": [
            {"kind": "text", "title": "範例: serendipity", "body": "意外的美好發現\n例句: Meeting you was pure serendipity."},
        ],
    },
    {
        "id": "qna",
        "name": "Q&A 板",
        "description": "學生提問、老師回答、同學互答",
        "layout": "grid",
        "theme": "lemon",
        "sections": [],
        "posts": [],
    },
]

_MAP: Dict[str, Dict[str, Any]] = {t["id"]: t for t in TEMPLATES}


def list_templates() -> List[Dict[str, Any]]:
    """回傳輕量版(不含 posts/sections 細節),供列表頁展示"""
    return [
        {
            "id": t["id"],
            "name": t["name"],
            "description": t["description"],
            "layout": t["layout"],
            "theme": t["theme"],
        }
        for t in TEMPLATES
    ]


def get_template(template_id: str) -> Dict[str, Any]:
    """取單一模板 (含 sections/posts)。找不到回 blank。"""
    return _MAP.get(template_id) or _MAP["blank"]
