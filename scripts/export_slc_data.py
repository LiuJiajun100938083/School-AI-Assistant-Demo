#!/usr/bin/env python3
"""
匯出 SLC（學校學習中心）知識圖譜 + 學習路徑為 JSON，方便在其他環境重新匯入。

用法:
    python scripts/export_slc_data.py                          # 匯出所有科目
    python scripts/export_slc_data.py --subject ICT            # 只匯出 ICT
    python scripts/export_slc_data.py --subject ICT --out data # 輸出到 data/ 目錄

匯出格式與批量匯入 API 完全相容:
    POST /api/admin/school-learning-center/knowledge-graph/batch-import
    POST /api/admin/school-learning-center/paths/batch-import
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

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
DEFAULT_OUT_DIR = os.path.join(PROJECT_DIR, "data")

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "school_ai_assistant"),
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
}


# ============================================================
# 資料庫查詢
# ============================================================

def get_connection():
    return pymysql.connect(**DB_CONFIG)


def export_knowledge_graph(conn, subject_code):
    """匯出知識圖譜（nodes + edges + content_links）"""
    cur = conn.cursor()

    # 1. Nodes
    cur.execute("""
        SELECT id, title, description, icon, color
        FROM slc_knowledge_nodes
        WHERE subject_code = %s AND (is_deleted = 0 OR is_deleted IS NULL)
        ORDER BY id
    """, (subject_code,))
    db_nodes = cur.fetchall()

    if not db_nodes:
        return None

    # 建立 db_id → temp_id 映射
    id_map = {}
    nodes = []
    for i, n in enumerate(db_nodes, 1):
        temp_id = f"node_{i}"
        id_map[n["id"]] = temp_id
        nodes.append({
            "id": temp_id,
            "title": n["title"],
            "description": n["description"] or "",
            "icon": n["icon"] or "📌",
            "color": n["color"] or "#006633",
        })

    # 2. Edges
    cur.execute("""
        SELECT source_node_id, target_node_id, relation_type, label, weight
        FROM slc_knowledge_edges
        WHERE subject_code = %s AND (is_deleted = 0 OR is_deleted IS NULL)
        ORDER BY id
    """, (subject_code,))
    db_edges = cur.fetchall()

    edges = []
    for e in db_edges:
        src = id_map.get(e["source_node_id"])
        tgt = id_map.get(e["target_node_id"])
        if src and tgt:
            edges.append({
                "source": src,
                "target": tgt,
                "relation_type": e["relation_type"] or "related",
                "label": e["label"] or "",
                "weight": float(e["weight"] or 1.0),
            })

    # 3. Content links (node ↔ content + anchor)
    cur.execute("""
        SELECT nc.node_id, nc.content_id, nc.anchor,
               c.file_name, c.title AS content_title
        FROM slc_node_contents nc
        LEFT JOIN slc_contents c ON c.id = nc.content_id
        WHERE nc.node_id IN (
            SELECT id FROM slc_knowledge_nodes
            WHERE subject_code = %s AND (is_deleted = 0 OR is_deleted IS NULL)
        )
        ORDER BY nc.node_id, nc.sort_order
    """, (subject_code,))
    db_links = cur.fetchall()

    content_links = []
    # 記錄用到的 source_pdf（取最常見的檔名）
    pdf_names = {}
    for lk in db_links:
        node_temp = id_map.get(lk["node_id"])
        if not node_temp:
            continue
        anchor = lk["anchor"]
        if isinstance(anchor, str):
            try:
                anchor = json.loads(anchor)
            except Exception:
                anchor = None
        content_links.append({
            "node": node_temp,
            "content_id": lk["content_id"],
            "anchor": anchor,
        })
        fname = lk["file_name"] or lk["content_title"] or ""
        if fname:
            pdf_names[fname] = pdf_names.get(fname, 0) + 1

    # 找出最常見的 source_pdf
    source_pdf = ""
    if pdf_names:
        source_pdf = max(pdf_names, key=pdf_names.get)

    result = {
        "meta": {
            "subject_code": subject_code,
            "source_pdf": source_pdf,
            "exported_at": datetime.now().isoformat(),
            "description": f"SLC knowledge graph for {subject_code}",
        },
        "subject_code": subject_code,
        "source_pdf": source_pdf,
        "nodes": nodes,
        "edges": edges,
        "content_links": content_links,
    }

    return result


def export_learning_paths(conn, subject_code):
    """匯出學習路徑（paths + steps）"""
    cur = conn.cursor()

    # 1. Paths
    cur.execute("""
        SELECT id, title, description, icon, difficulty, estimated_hours, tags
        FROM slc_learning_paths
        WHERE subject_code = %s AND (is_deleted = 0 OR is_deleted IS NULL)
        ORDER BY id
    """, (subject_code,))
    db_paths = cur.fetchall()

    if not db_paths:
        return None

    paths = []
    for p in db_paths:
        path_id = p["id"]

        # 2. Steps for this path
        cur.execute("""
            SELECT ps.step_order, ps.title, ps.description,
                   ps.content_id, ps.node_id,
                   n.title AS node_title,
                   c.file_name AS content_file_name
            FROM slc_path_steps ps
            LEFT JOIN slc_knowledge_nodes n ON n.id = ps.node_id
            LEFT JOIN slc_contents c ON c.id = ps.content_id
            WHERE ps.path_id = %s
            ORDER BY ps.step_order
        """, (path_id,))
        db_steps = cur.fetchall()

        steps = []
        for s in db_steps:
            step = {
                "step_order": s["step_order"] or 0,
                "title": s["title"] or "",
                "description": s["description"] or "",
            }
            # 用 node_match（標題匹配）代替硬編碼 node_id，更具可攜性
            if s["node_title"]:
                step["node_match"] = s["node_title"]
            # 用 source_pdf（檔名匹配）代替硬編碼 content_id
            if s["content_file_name"]:
                step["source_pdf"] = s["content_file_name"]
            elif s["content_id"]:
                step["content_id"] = s["content_id"]
            steps.append(step)

        tags = p["tags"]
        if isinstance(tags, str):
            try:
                tags = json.loads(tags)
            except Exception:
                tags = []

        paths.append({
            "id": f"path_{path_id}",
            "title": p["title"],
            "description": p["description"] or "",
            "difficulty": p["difficulty"] or "beginner",
            "estimated_hours": float(p["estimated_hours"] or 1.0),
            "icon": p["icon"] or "🎯",
            "tags": tags or [],
            "steps": steps,
        })

    result = {
        "meta": {
            "subject_code": subject_code,
            "exported_at": datetime.now().isoformat(),
            "description": f"SLC learning paths for {subject_code}",
        },
        "subject_code": subject_code,
        "paths": paths,
    }

    return result


def get_subjects_with_data(conn):
    """取得有知識圖譜數據的科目列表"""
    cur = conn.cursor()
    cur.execute("""
        SELECT DISTINCT subject_code
        FROM slc_knowledge_nodes
        WHERE is_deleted = 0 OR is_deleted IS NULL
        ORDER BY subject_code
    """)
    return [r["subject_code"] for r in cur.fetchall()]


# ============================================================
# 主流程
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="匯出 SLC 知識圖譜 + 學習路徑為 JSON")
    parser.add_argument("--subject", type=str, default=None, help="科目代碼（如 ICT），不指定則匯出所有")
    parser.add_argument("--out", type=str, default=DEFAULT_OUT_DIR, help="輸出目錄")
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)

    print(f"連接數據庫 {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']} ...")
    conn = get_connection()

    try:
        if args.subject:
            subjects = [args.subject]
        else:
            subjects = get_subjects_with_data(conn)
            if not subjects:
                print("沒有找到任何有知識圖譜數據的科目")
                return

        for subj in subjects:
            print(f"\n{'='*50}")
            print(f"匯出科目: {subj}")
            print(f"{'='*50}")

            # 匯出知識圖譜
            kg = export_knowledge_graph(conn, subj)
            if kg:
                kg_file = os.path.join(args.out, f"slc_kg_{subj.lower()}.json")
                with open(kg_file, "w", encoding="utf-8") as f:
                    json.dump(kg, f, ensure_ascii=False, indent=2)
                print(f"  知識圖譜: {len(kg['nodes'])} nodes, {len(kg['edges'])} edges, {len(kg['content_links'])} links")
                print(f"  → {kg_file}")
            else:
                print(f"  知識圖譜: 無數據")

            # 匯出學習路徑
            paths = export_learning_paths(conn, subj)
            if paths:
                paths_file = os.path.join(args.out, f"slc_paths_{subj.lower()}.json")
                with open(paths_file, "w", encoding="utf-8") as f:
                    json.dump(paths, f, ensure_ascii=False, indent=2)
                total_steps = sum(len(p["steps"]) for p in paths["paths"])
                print(f"  學習路徑: {len(paths['paths'])} paths, {total_steps} steps")
                print(f"  → {paths_file}")
            else:
                print(f"  學習路徑: 無數據")

        print(f"\n匯出完成！")
        print(f"\n重新匯入方法:")
        print(f"  curl -X POST http://HOST/api/admin/school-learning-center/knowledge-graph/batch-import \\")
        print(f"       -H 'Authorization: Bearer TOKEN' -H 'Content-Type: application/json' \\")
        print(f"       -d @data/slc_kg_ict.json")
        print(f"  curl -X POST http://HOST/api/admin/school-learning-center/paths/batch-import \\")
        print(f"       -H 'Authorization: Bearer TOKEN' -H 'Content-Type: application/json' \\")
        print(f"       -d @data/slc_paths_ict.json")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
