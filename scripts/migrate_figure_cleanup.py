#!/usr/bin/env python3
"""
Phase 1 (P0-1): 歷史數據遷移 — Step 2 (Python 掃尾)

處理 SQL 正則不可靠的部分：
1. 清除 manual_question_text 中 [圖形描述：...] 前綴
2. 若 figure_description 列仍為空，從前綴中提取 JSON 填入
3. 為所有有 figure_description 的記錄生成 figure_description_readable

使用方式：
  python scripts/migrate_figure_cleanup.py [--dry-run]
"""

import json
import re
import sys
import os

# 添加項目根目錄到 Python 路徑
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pymysql

# 匹配 [圖形描述：...]\n 前綴（貪婪匹配到最後一個 ]）
FIGURE_PREFIX_PATTERN = re.compile(
    r'^\[圖形描述[：:]\s*(.*?)\]\s*\n?',
    re.DOTALL
)


def generate_readable_description(fig_json_str: str, schema_version: int = 1) -> str:
    """
    純函數：將 figure_description JSON 轉為人類可讀文字。
    與 VisionService.generate_readable_description() 保持一致。
    """
    if not fig_json_str or not fig_json_str.strip():
        return ""

    try:
        fig = json.loads(fig_json_str) if isinstance(fig_json_str, str) else fig_json_str
    except (json.JSONDecodeError, TypeError):
        return "含幾何圖形"

    if not isinstance(fig, dict):
        return "含幾何圖形"

    if not fig.get("has_figure", True):
        return ""

    if schema_version >= 2:
        return _readable_v2(fig)
    return _readable_v1(fig)


def _readable_v1(fig: dict) -> str:
    """v1 schema (舊 elements 版)"""
    parts = []

    # 提取 elements
    elements = fig.get("elements", [])
    if elements:
        points = []
        segments = []
        others = []
        for el in elements:
            el_type = el.get("type", "")
            label = el.get("label", el.get("name", ""))
            if el_type == "point" and label:
                points.append(label)
            elif el_type in ("line_segment", "segment", "line") and label:
                segments.append(label)
            elif label:
                others.append(f"{el_type}: {label}")

        if points:
            parts.append(f"點：{'、'.join(points)}")
        if segments:
            parts.append(f"線段：{'、'.join(segments)}")
        if others:
            parts.extend(others)

    # 提取 relationships
    rels = fig.get("relationships", [])
    if rels:
        for rel in rels:
            rel_type = rel.get("type", "")
            desc = rel.get("description", "")
            if desc:
                parts.append(desc)
            elif rel_type:
                entities = rel.get("entities", [])
                parts.append(f"{rel_type}: {', '.join(str(e) for e in entities)}")

    # 提取 measurements
    measurements = fig.get("measurements", [])
    if measurements:
        for m in measurements:
            target = m.get("target", "")
            prop = m.get("property", "")
            value = m.get("value", "")
            if target and value:
                parts.append(f"{target} {prop} = {value}")

    # 提取 figure_type
    fig_type = fig.get("figure_type", "")
    if fig_type and not parts:
        parts.append(f"圖形類型：{fig_type}")

    # 回退：overall_description
    if not parts:
        overall = fig.get("overall_description", "")
        if overall:
            return overall
        return "含幾何圖形"

    return "；".join(parts)


def _readable_v2(fig: dict) -> str:
    """v2 schema (新 4 層約束版)"""
    parts = []

    # objects 層
    objects = fig.get("objects", [])
    if objects:
        by_type = {}
        for obj in objects:
            t = obj.get("type", "unknown")
            label = obj.get("label", obj.get("id", ""))
            by_type.setdefault(t, []).append(label)
        type_labels = {"point": "點", "segment": "線段", "line": "直線",
                       "ray": "射線", "angle": "角", "circle": "圓",
                       "triangle": "三角形", "polygon": "多邊形"}
        for t, labels in by_type.items():
            name = type_labels.get(t, t)
            parts.append(f"{name}：{'、'.join(labels)}")

    # measurements 層
    measurements = fig.get("measurements", [])
    if measurements:
        m_parts = []
        for m in measurements:
            target = m.get("target", "")
            prop = m.get("property", "")
            value = m.get("value", "")
            if target and value:
                if prop == "degrees":
                    m_parts.append(f"∠{target} = {value}°" if not str(value).endswith("°") else f"∠{target} = {value}")
                elif prop == "length":
                    m_parts.append(f"{target} = {value}")
                else:
                    m_parts.append(f"{target} {prop} = {value}")
        if m_parts:
            parts.append("；".join(m_parts))

    # relationships 層
    rels = fig.get("relationships", [])
    if rels:
        rel_parts = []
        for rel in rels:
            rel_type = rel.get("type", "")
            source = rel.get("source", "")
            inferred_mark = "?" if source == "inferred" else ""

            if rel_type == "parallel":
                entities = rel.get("entities", [])
                if len(entities) == 2:
                    rel_parts.append(f"{entities[0]} // {entities[1]}{inferred_mark}")
            elif rel_type == "perpendicular":
                entities = rel.get("entities", [])
                if len(entities) == 2:
                    rel_parts.append(f"{entities[0]} ⊥ {entities[1]}{inferred_mark}")
            elif rel_type == "midpoint":
                subj = rel.get("subject", "")
                of = rel.get("of", "")
                rel_parts.append(f"{subj} 是 {of} 中點{inferred_mark}")
            elif rel_type == "collinear":
                pts = rel.get("points", [])
                rel_parts.append(f"{'、'.join(pts)} 共線{inferred_mark}")
            elif rel_type == "congruent":
                entities = rel.get("entities", [])
                if len(entities) == 2:
                    rel_parts.append(f"{entities[0]} ≅ {entities[1]}{inferred_mark}")
            elif rel_type == "similar":
                entities = rel.get("entities", [])
                if len(entities) == 2:
                    rel_parts.append(f"{entities[0]} ∼ {entities[1]}{inferred_mark}")
            elif rel_type == "tangent":
                entities = rel.get("entities", [])
                at = rel.get("at", "")
                if len(entities) == 2:
                    t = f"，切點 {at}" if at else ""
                    rel_parts.append(f"{entities[0]} 切 {entities[1]}{t}{inferred_mark}")
            elif rel_type == "on_segment":
                subj = rel.get("subject", "")
                target = rel.get("target", "")
                rel_parts.append(f"{subj} 在 {target} 上{inferred_mark}")
            elif rel_type == "bisector":
                subj = rel.get("subject", "")
                target = rel.get("target", "")
                rel_parts.append(f"{subj} 平分 {target}{inferred_mark}")
            elif rel_type == "equal":
                items = rel.get("items", [])
                if len(items) == 2:
                    a = f"{items[0].get('ref', '')}({items[0].get('prop', '')})"
                    b = f"{items[1].get('ref', '')}({items[1].get('prop', '')})"
                    rel_parts.append(f"{a} = {b}{inferred_mark}")
            else:
                # 未知類型，盡量展示
                entities = rel.get("entities", [])
                if entities:
                    rel_parts.append(f"{rel_type}: {', '.join(str(e) for e in entities)}{inferred_mark}")

        if rel_parts:
            parts.append("；".join(rel_parts))

    # task 層
    task = fig.get("task", {})
    if task:
        goals = task.get("goals", [])
        known = task.get("known_conditions", [])
        if known:
            parts.append(f"已知：{'、'.join(known)}")
        if goals:
            parts.append(f"求：{'、'.join(goals)}")

    if not parts:
        overall = fig.get("overall_description", "")
        if overall:
            return overall
        return "含幾何圖形"

    return "；".join(parts)


def get_db_connection():
    """獲取數據庫連接"""
    return pymysql.connect(
        host='127.0.0.1',
        port=3306,
        user='ai_assistant',
        password='SecurePass123!',
        database='school_ai_assistant',
        charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor,
    )


def run_migration(dry_run: bool = False):
    """執行遷移"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 統計
    stats = {
        "total": 0,
        "prefix_found": 0,
        "prefix_cleaned": 0,
        "fig_extracted_from_prefix": 0,
        "fig_from_tags": 0,
        "readable_generated": 0,
        "still_has_prefix": 0,
        "errors": [],
    }

    try:
        # 查找所有未刪除記錄
        cursor.execute("""
            SELECT mistake_id, manual_question_text, figure_description,
                   figure_description_readable, figure_schema_version, tags
            FROM student_mistakes
            WHERE is_deleted = 0
        """)
        rows = cursor.fetchall()
        stats["total"] = len(rows)

        for row in rows:
            mid = row["mistake_id"]
            question = row["manual_question_text"] or ""
            fig_desc = row["figure_description"] or ""
            readable = row["figure_description_readable"] or ""

            updates = {}

            # Step 1: 檢查 manual_question_text 是否含 [圖形描述：...] 前綴
            match = FIGURE_PREFIX_PATTERN.match(question)
            if match:
                stats["prefix_found"] += 1
                prefix_content = match.group(1).strip()
                clean_question = question[match.end():].strip()

                # 如果 figure_description 列為空，從前綴中提取
                if not fig_desc and prefix_content:
                    updates["figure_description"] = prefix_content
                    updates["figure_schema_version"] = 1
                    fig_desc = prefix_content
                    stats["fig_extracted_from_prefix"] += 1

                # 清除前綴
                updates["manual_question_text"] = clean_question
                stats["prefix_cleaned"] += 1

            # Step 2: 如果 figure_description 列仍為空，嘗試從 tags 回退
            if not fig_desc:
                tags_raw = row.get("tags")
                if tags_raw:
                    try:
                        tags_obj = json.loads(tags_raw) if isinstance(tags_raw, str) else tags_raw
                        if isinstance(tags_obj, dict):
                            td = tags_obj.get("figure_description", "")
                            if td:
                                updates["figure_description"] = td
                                updates["figure_schema_version"] = 1
                                fig_desc = td
                                stats["fig_from_tags"] += 1
                    except (json.JSONDecodeError, TypeError):
                        pass

            # Step 3: 生成 readable（如果有 figure_description 但沒有 readable）
            if fig_desc and not readable:
                version = updates.get("figure_schema_version", row.get("figure_schema_version", 1))
                try:
                    new_readable = generate_readable_description(fig_desc, version)
                    if new_readable:
                        updates["figure_description_readable"] = new_readable
                        stats["readable_generated"] += 1
                except Exception as e:
                    stats["errors"].append(f"{mid}: readable 生成失敗: {e}")

            # 執行更新
            if updates and not dry_run:
                set_clauses = ", ".join(f"{k} = %s" for k in updates)
                values = list(updates.values()) + [mid]
                cursor.execute(
                    f"UPDATE student_mistakes SET {set_clauses} WHERE mistake_id = %s",
                    values,
                )

        if not dry_run:
            conn.commit()

        # 最終驗證：檢查是否仍有殘留前綴
        cursor.execute("""
            SELECT COUNT(*) AS cnt
            FROM student_mistakes
            WHERE is_deleted = 0
              AND manual_question_text LIKE '[圖形描述%%'
        """)
        stats["still_has_prefix"] = cursor.fetchone()["cnt"]

    except Exception as e:
        conn.rollback()
        print(f"\n❌ 遷移異常: {e}")
        raise
    finally:
        cursor.close()
        conn.close()

    # 打印審計報告
    print("\n" + "=" * 60)
    print("  Figure Description 遷移審計報告")
    print("=" * 60)
    print(f"  模式：{'🔍 DRY-RUN（不實際寫入）' if dry_run else '✅ 已執行寫入'}")
    print(f"  總記錄數：{stats['total']}")
    print(f"  含 [圖形描述：] 前綴的記錄：{stats['prefix_found']}")
    print(f"  成功清理前綴：{stats['prefix_cleaned']}")
    print(f"  從前綴提取 figure_description：{stats['fig_extracted_from_prefix']}")
    print(f"  從 tags 回退提取：{stats['fig_from_tags']}")
    print(f"  生成 readable 描述：{stats['readable_generated']}")
    print(f"  仍含舊前綴（異常）：{stats['still_has_prefix']}")
    if stats["errors"]:
        print(f"\n  ⚠ 錯誤列表（{len(stats['errors'])} 條）：")
        for err in stats["errors"][:20]:
            print(f"    - {err}")
    print("=" * 60)

    if stats["still_has_prefix"] > 0:
        pct = stats["still_has_prefix"] / stats["total"] * 100 if stats["total"] else 0
        print(f"\n⚠ 仍有 {stats['still_has_prefix']} 條記錄含舊前綴（{pct:.1f}%），請人工檢查")


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    print(f"開始遷移... {'(DRY-RUN 模式)' if dry else ''}")
    run_migration(dry_run=dry)
