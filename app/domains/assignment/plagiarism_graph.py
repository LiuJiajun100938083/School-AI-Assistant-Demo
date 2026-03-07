#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Plagiarism Detection — Graph Analysis
======================================
Pure functions for source identification and edge direction inference
in plagiarism clusters.

Dependencies: standard library only. No project-internal imports.
``get_clusters`` itself remains on PlagiarismService because it needs
repo access.
"""

from collections import defaultdict
from typing import Any, Dict, List


def identify_source(
    component: List[int],
    degree: Dict[int, int],
    weighted_degree: Dict[int, float],
    sub_meta: Dict[int, Dict[str, Any]],
    edges: List[Dict[str, Any]],
) -> int:
    """
    多信號綜合評分，識別最可能的抄襲源頭。

    信號權重:
      1. 度數 (40%): 與最多人相似 → 更可能是被抄的源頭
      2. 提交時間 (30%): 越早提交 → 越可能是源頭
      3. 代碼長度 (20%): 代碼越長/越完整 → 越可能是原創
      4. 平均相似度 (10%): 與他人平均相似度越高 → 越像被大量抄襲
    """
    if len(component) < 2:
        return component[0] if component else 0

    max_degree = max(degree[n] for n in component) or 1

    # 收集提交時間（排序用）
    times = {}
    for sid in component:
        ts = sub_meta.get(sid, {}).get("submitted_at")
        if ts:
            times[sid] = ts

    # 按提交時間排名: 最早 = 1.0, 最晚 = 0.0
    time_rank: Dict[int, float] = {}
    if times:
        sorted_by_time = sorted(times.items(), key=lambda x: x[1])
        n_timed = len(sorted_by_time)
        for rank, (sid, _) in enumerate(sorted_by_time):
            time_rank[sid] = 1.0 - (rank / max(n_timed - 1, 1))

    # 代碼長度排名: 最長 = 1.0, 最短 = 0.0
    lengths = {sid: sub_meta.get(sid, {}).get("text_len", 0) for sid in component}
    max_len = max(lengths.values()) or 1
    min_len = min(lengths.values())
    len_range = max_len - min_len or 1

    scores: Dict[int, float] = {}
    for sid in component:
        # 1) 度數分 (0~1)
        deg_score = degree[sid] / max_degree

        # 2) 時間分 (0~1, 越早越高; 無時間 → 0.5 中立)
        t_score = time_rank.get(sid, 0.5)

        # 3) 長度分 (0~1, 越長越高)
        l_score = (lengths[sid] - min_len) / len_range

        # 4) 平均相似度分 (0~1)
        avg = (weighted_degree[sid] / degree[sid] / 100) if degree[sid] > 0 else 0

        scores[sid] = (
            0.40 * deg_score
            + 0.30 * t_score
            + 0.20 * l_score
            + 0.10 * avg
        )

    return max(component, key=lambda n: scores[n])


def direct_edges(
    edges: List[Dict[str, Any]],
    source_id: int,
    degree: Dict[int, int],
    sub_meta: Dict[int, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    為每條邊推斷方向（from_id → to_id），用於樹圖展示。

    方向推斷邏輯:
    - 度數高的 → 度數低的
    - 度數相同時，提交早的 → 提交晚的
    - 再相同時，代碼長的 → 代碼短的
    """
    directed = []
    for e in edges:
        a_id, b_id = e["a_id"], e["b_id"]

        # 判定 a → b 還是 b → a
        # 用元組比較: (度數倒序, 時間正序, 長度倒序)
        def _rank(sid):
            deg = degree.get(sid, 0)
            ts = sub_meta.get(sid, {}).get("submitted_at")
            # 時間越早排越前（值越小越好），沒時間排最後
            ts_val = ts if ts else None
            tlen = sub_meta.get(sid, {}).get("text_len", 0)
            return (-deg, ts_val if ts_val else "9999", -tlen)

        a_rank = _rank(a_id)
        b_rank = _rank(b_id)

        # a_id/b_id 與 a_name/b_name 一一對應
        name_map = {a_id: e.get("a_name", ""), b_id: e.get("b_name", "")}

        if a_rank <= b_rank:
            from_id, to_id = a_id, b_id
        else:
            from_id, to_id = b_id, a_id

        directed.append({
            "from_id": from_id, "to_id": to_id,
            "from_name": name_map.get(from_id, ""),
            "to_name": name_map.get(to_id, ""),
            # 保留舊字段兼容
            "a_id": e["a_id"], "b_id": e["b_id"],
            "a_name": e.get("a_name", ""), "b_name": e.get("b_name", ""),
            "score": e["score"],
        })
    return directed
