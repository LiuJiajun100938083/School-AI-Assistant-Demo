#!/usr/bin/env python3
"""
批量导入知识图谱 JSON 到数据库（直连，无需启动服务器）

用法:
    python scripts/import_knowledge_graphs.py [--clear]

默认导入 data/kg_*.json 下的所有知识图谱文件。
自动通过 source_pdf 匹配已上传内容的 content_id。
"""

import argparse
import json
import os
import sys
from datetime import datetime

import pymysql

# ============================================================
# 配置
# ============================================================

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

KG_FILES = [
    "kg_hybrid_classroom.json",
    "kg_lti_zoom.json",
    "kg_virtual_meeting_room.json",
    "kg_utest_teacher_guide.json",
    "kg_ai_agent_system.json",
]

# 数据库连接 — 从环境变量读取，或用默认值
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "school_ai_assistant"),
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
}

ADMIN_USERNAME = "admin"


# ============================================================
# 数据库操作
# ============================================================

def get_connection():
    """获取数据库连接"""
    return pymysql.connect(**DB_CONFIG)


def match_content_id(cursor, source_pdf: str) -> int | None:
    """通过 PDF 文件名匹配已上传内容的 content_id"""
    cursor.execute(
        "SELECT id, file_name, title FROM lc_contents WHERE is_deleted = 0 AND status = 'published'"
    )
    rows = cursor.fetchall()

    pdf_stem = source_pdf.rsplit(".", 1)[0] if "." in source_pdf else source_pdf

    for row in rows:
        fname = row.get("file_name") or ""
        title = row.get("title") or ""
        if source_pdf in fname or pdf_stem in fname or pdf_stem in title:
            return row["id"]
    return None


def import_kg(cursor, data: dict, clear: bool = False) -> dict:
    """导入单个知识图谱"""
    meta = data.get("meta", {})
    source_pdf = meta.get("source_pdf", "")
    nodes = data["nodes"]
    edges = data.get("edges", [])
    content_links = data.get("content_links", [])
    now = datetime.now()

    stats = {"created_nodes": 0, "created_edges": 0, "created_links": 0, "skipped_links": 0}

    # --- Phase 1: 创建节点 ---
    temp_to_db = {}
    for node in nodes:
        cursor.execute(
            """INSERT INTO lc_knowledge_nodes
               (title, description, icon, color, position_x, position_y, is_pinned, created_by, created_at, updated_at, is_deleted)
               VALUES (%s, %s, %s, %s, 0, 0, 0, %s, %s, %s, 0)""",
            (
                node["title"].strip(),
                (node.get("description") or "").strip(),
                node.get("icon", "📌"),
                node.get("color", "#006633"),
                ADMIN_USERNAME,
                now,
                now,
            ),
        )
        temp_to_db[node["id"]] = cursor.lastrowid
        stats["created_nodes"] += 1

    # --- Phase 2: 创建边 ---
    for edge in edges:
        src = temp_to_db.get(edge["source"])
        tgt = temp_to_db.get(edge["target"])
        if not src or not tgt:
            continue
        try:
            cursor.execute(
                """INSERT INTO lc_knowledge_edges
                   (source_node_id, target_node_id, relation_type, label, weight)
                   VALUES (%s, %s, %s, %s, %s)""",
                (src, tgt, edge.get("relation_type", "related"), edge.get("label", ""), edge.get("weight", 1.0)),
            )
            stats["created_edges"] += 1
        except pymysql.IntegrityError:
            pass  # 重复边跳过

    # --- Phase 3: 匹配 content_id ---
    content_id = match_content_id(cursor, source_pdf) if source_pdf else None
    if content_id:
        print(f"    📎 匹配到 content_id={content_id} (PDF: {source_pdf})")
    elif source_pdf:
        print(f"    ⚠️  未匹配到 PDF: {source_pdf}，跳过内容关联")

    # --- Phase 4: 创建内容关联 ---
    for link in content_links:
        node_db_id = temp_to_db.get(link["node"])
        cid = link.get("content_id") or content_id
        if not node_db_id or not cid:
            stats["skipped_links"] += 1
            continue

        anchor = link.get("anchor")
        anchor_str = json.dumps(anchor, ensure_ascii=False) if anchor else None
        try:
            cursor.execute(
                """INSERT IGNORE INTO lc_node_contents
                   (node_id, content_id, sort_order, anchor)
                   VALUES (%s, %s, 0, %s)""",
                (node_db_id, cid, anchor_str),
            )
            if cursor.rowcount > 0:
                stats["created_links"] += 1
            else:
                stats["skipped_links"] += 1
        except Exception:
            stats["skipped_links"] += 1

    return stats


# ============================================================
# Main
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="批量导入知识图谱JSON（直连数据库）")
    parser.add_argument("--clear", action="store_true", help="导入前清空现有知识图谱")
    parser.add_argument("--files", nargs="*", help="指定JSON文件名（默认导入所有）")
    args = parser.parse_args()

    print("=" * 60)
    print("📚 知识图谱批量导入（直连数据库）")
    print("=" * 60)
    print(f"  数据库: {DB_CONFIG['user']}@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}")
    print(f"  数据目录: {DATA_DIR}")
    print()

    # 找文件
    files = args.files or KG_FILES
    kg_paths = []
    for fname in files:
        fpath = os.path.join(DATA_DIR, fname)
        if os.path.exists(fpath):
            kg_paths.append(fpath)
        else:
            print(f"  ⚠️  文件不存在，跳过: {fname}")

    if not kg_paths:
        print("❌ 没有找到可导入的JSON文件")
        sys.exit(1)

    # 预览
    print(f"📦 准备导入 {len(kg_paths)} 个知识图谱:\n")
    for p in kg_paths:
        with open(p, "r", encoding="utf-8") as f:
            d = json.load(f)
        meta = d.get("meta", {})
        print(f"  📄 {meta.get('title', os.path.basename(p))}")
        print(f"     {len(d['nodes'])} 节点, {len(d.get('edges', []))} 边, {len(d.get('content_links', []))} 关联")
    print()

    # 连接数据库
    try:
        conn = get_connection()
        print("✅ 数据库连接成功\n")
    except Exception as e:
        print(f"❌ 数据库连接失败: {e}")
        sys.exit(1)

    cursor = conn.cursor()
    total = {"created_nodes": 0, "created_edges": 0, "created_links": 0, "skipped_links": 0}

    try:
        # 清空（如需要）
        if args.clear:
            print("🗑️  清空现有知识图谱...")
            cursor.execute("DELETE FROM lc_node_contents")
            cursor.execute("DELETE FROM lc_knowledge_edges")
            cursor.execute("UPDATE lc_knowledge_nodes SET is_deleted = 1")
            conn.commit()
            print("  ✅ 已清空\n")

        # 逐个导入
        for i, fpath in enumerate(kg_paths, 1):
            with open(fpath, "r", encoding="utf-8") as f:
                d = json.load(f)
            meta = d.get("meta", {})
            title = meta.get("title", os.path.basename(fpath))

            print(f"[{i}/{len(kg_paths)}] 导入: {title}")
            stats = import_kg(cursor, d)
            conn.commit()

            print(f"  ✅ 节点: {stats['created_nodes']}, "
                  f"边: {stats['created_edges']}, "
                  f"关联: {stats['created_links']}, "
                  f"跳过: {stats['skipped_links']}")

            for k in total:
                total[k] += stats[k]

        print()
        print("=" * 60)
        print("📊 导入完成！总计:")
        print(f"  节点: {total['created_nodes']}")
        print(f"  边:   {total['created_edges']}")
        print(f"  关联: {total['created_links']}")
        print(f"  跳过: {total['skipped_links']}")
        print("=" * 60)

    except Exception as e:
        conn.rollback()
        print(f"\n❌ 导入出错，已回滚: {e}")
        import traceback
        traceback.print_exc()
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()
