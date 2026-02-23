#!/usr/bin/env python3
"""
批量导入知识图谱 JSON 到学习中心

用法:
    python scripts/import_knowledge_graphs.py [--base-url URL] [--clear]

默认导入 data/kg_*.json 下的所有知识图谱文件。
需要服务器正在运行。
"""

import argparse
import json
import os
import sys
import requests

# 默认配置
DEFAULT_BASE_URL = "http://localhost:8000"
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

# 导入顺序（可自定义）
KG_FILES = [
    "kg_hybrid_classroom.json",
    "kg_lti_zoom.json",
    "kg_virtual_meeting_room.json",
    "kg_utest_teacher_guide.json",
    "kg_ai_agent_system.json",
]


def get_token(base_url: str) -> str:
    """获取管理员JWT token"""
    # 尝试常见的管理员凭证
    credentials = [
        {"username": "admin", "password": "admin123"},
        {"username": "admin", "password": "password"},
        {"username": "teacher", "password": "teacher123"},
    ]

    for cred in credentials:
        try:
            resp = requests.post(
                f"{base_url}/api/auth/login",
                json=cred,
                timeout=10,
            )
            if resp.status_code == 200:
                data = resp.json()
                token = data.get("data", {}).get("token") or data.get("token")
                if token:
                    print(f"  ✅ 登录成功 (user={cred['username']})")
                    return token
        except Exception:
            continue

    print("  ❌ 无法获取token，请手动指定 --token 参数")
    sys.exit(1)


def import_kg_file(base_url: str, token: str, filepath: str, clear: bool = False) -> dict:
    """导入单个知识图谱JSON文件"""
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    meta = data.get("meta", {})
    source_pdf = meta.get("source_pdf", "")

    payload = {
        "clear_existing": clear,
        "source_pdf": source_pdf,
        "nodes": data["nodes"],
        "edges": data.get("edges", []),
        "content_links": data.get("content_links", []),
    }

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    resp = requests.post(
        f"{base_url}/api/admin/learning-center/knowledge-graph/batch-import",
        json=payload,
        headers=headers,
        timeout=30,
    )

    if resp.status_code == 200:
        result = resp.json().get("data", {})
        return result
    else:
        print(f"  ❌ HTTP {resp.status_code}: {resp.text[:200]}")
        return {}


def main():
    parser = argparse.ArgumentParser(description="批量导入知识图谱JSON文件")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="API 基础URL")
    parser.add_argument("--token", default=None, help="JWT token（不提供则自动登录）")
    parser.add_argument("--clear", action="store_true", help="导入前清空现有知识图谱")
    parser.add_argument("--files", nargs="*", help="指定要导入的JSON文件名（默认导入所有）")
    args = parser.parse_args()

    print("=" * 60)
    print("📚 知识图谱批量导入工具")
    print("=" * 60)
    print(f"  服务器: {args.base_url}")
    print(f"  数据目录: {DATA_DIR}")
    print()

    # 获取token
    token = args.token
    if not token:
        print("🔐 获取登录token...")
        token = get_token(args.base_url)

    # 确定要导入的文件
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

    print(f"\n📦 准备导入 {len(kg_paths)} 个知识图谱:")
    for p in kg_paths:
        with open(p, "r", encoding="utf-8") as f:
            d = json.load(f)
        meta = d.get("meta", {})
        print(f"  📄 {meta.get('title', os.path.basename(p))}")
        print(f"     {len(d['nodes'])} 节点, {len(d.get('edges', []))} 边, {len(d.get('content_links', []))} 关联")

    print()

    # 逐个导入
    total_stats = {"created_nodes": 0, "created_edges": 0, "created_links": 0, "skipped_links": 0}

    for i, fpath in enumerate(kg_paths, 1):
        with open(fpath, "r", encoding="utf-8") as f:
            d = json.load(f)
        meta = d.get("meta", {})
        title = meta.get("title", os.path.basename(fpath))

        print(f"[{i}/{len(kg_paths)}] 导入: {title}")
        result = import_kg_file(args.base_url, token, fpath, clear=(args.clear and i == 1))

        if result:
            print(f"  ✅ 节点: {result.get('created_nodes', 0)}, "
                  f"边: {result.get('created_edges', 0)}, "
                  f"关联: {result.get('created_links', 0)}, "
                  f"跳过: {result.get('skipped_links', 0)}")
            for key in total_stats:
                total_stats[key] += result.get(key, 0)
        else:
            print(f"  ❌ 导入失败")

    print()
    print("=" * 60)
    print("📊 导入完成！总计:")
    print(f"  节点: {total_stats['created_nodes']}")
    print(f"  边:   {total_stats['created_edges']}")
    print(f"  关联: {total_stats['created_links']}")
    print(f"  跳过: {total_stats['skipped_links']}")
    print("=" * 60)


if __name__ == "__main__":
    main()
