#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI 学习中心一键部署脚本
========================
git pull 之后运行此脚本，自动完成：
1. 数据库迁移（添加 anchor 列）
2. 上传 PDF 教材到 lc_contents
3. 更新 KG JSON 中的 content_id
4. 调用批量导入 API 导入全部知识图谱（节点 + 边 + 内容关联 + 锚点）

使用方式:
    python scripts/deploy_learning_center.py

前置条件:
    - MySQL 服务已启动
    - .env 文件中的数据库配置正确
    - 3 份 PDF 原件位于以下路径之一（脚本会自动搜索）:
        - 项目根目录 / data / Downloads 等
    - 服务器会在脚本中自动启动（如果未运行）
"""

import io
import json
import os
import re
import shutil
import sys
import time
import uuid
import subprocess
import urllib.request
import urllib.error

# Windows 终端 UTF-8 输出
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# ============================================================
# 配置
# ============================================================

# 项目根目录（脚本在 scripts/ 下，上一层是项目根）
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# PDF 文件的预期名称（用于搜索）
PDF_FILES = {
    "ai_agent": {
        "search_keywords": ["ai agent", "ai bench", "ulearning ai"],
        "search_filename": "ULearning AI Agent System and AI Bench User Manual",
        "title": "ULearning AI Agent System and AI Bench User Manual (Teacher)",
        "description": "AI Agent System & AI Bench teacher guide. Covers creating AI assistants, knowledge bases, commands, and using AI Bench in courses.",
        "kg_json": "kg_ai_agent_system.json",
    },
    "utest": {
        "search_keywords": ["utest", "u-test"],
        "search_filename": "utest_guide_teachers",
        "title": "UTest Teacher Guide (Teacher Version)",
        "description": "U-Test User Guide for teachers. Covers creating exam questions, exams, offerings, managing/delivering, proctoring, grading, and analysis.",
        "kg_json": "kg_utest_teacher_guide.json",
    },
    "ulearning_student": {
        "search_keywords": ["ulearning", "student guide"],
        "search_filename": "ulearning_guide_students",
        "title": "ULearning Student Guide (PC Version)",
        "description": "ULearning Student Guide covering login, LMS basics, announcements, courseware, resources, assignments, discussions, exams, and grades.",
        "kg_json": "kg_ulearning_student_guide.json",
    },
}

# 搜索 PDF 的目录列表
SEARCH_DIRS = [
    os.path.join(PROJECT_ROOT, "data"),
    os.path.join(PROJECT_ROOT, "pdfs"),
    os.path.join(PROJECT_ROOT, "docs"),
    os.path.expanduser("~/Downloads"),
    os.path.expanduser("~/Desktop"),
    os.path.expanduser("~/Documents"),
]


# ============================================================
# 工具函数
# ============================================================

def load_env():
    """从 .env 文件加载环境变量"""
    env_path = os.path.join(PROJECT_ROOT, ".env")
    config = {}
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    config[key.strip()] = value.strip()
    return config


def get_db_connection(config):
    """建立 MySQL 连接"""
    try:
        import pymysql
    except ImportError:
        print("  [!] pymysql 未安装，尝试 pip install pymysql...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pymysql", "-q"])
        import pymysql

    return pymysql.connect(
        host=config.get("DB_HOST", "localhost"),
        port=int(config.get("DB_PORT", "3306")),
        user=config.get("DB_USER", "root"),
        password=config.get("DB_PASSWORD", ""),
        database=config.get("DB_NAME", "school_ai_assistant"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )


def print_header(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


def print_step(step, msg):
    print(f"\n  [{step}] {msg}")


def print_ok(msg):
    print(f"      ✅ {msg}")


def print_warn(msg):
    print(f"      ⚠️  {msg}")


def print_fail(msg):
    print(f"      ❌ {msg}")


# ============================================================
# Step 1: 数据库迁移
# ============================================================

def run_migration(conn):
    """确保 lc_node_contents 表有 anchor 列"""
    print_step(1, "检查数据库迁移...")

    with conn.cursor() as cur:
        cur.execute("SHOW COLUMNS FROM lc_node_contents LIKE 'anchor'")
        result = cur.fetchone()

    if result:
        print_ok("anchor 列已存在，无需迁移")
        return

    migration_file = os.path.join(
        PROJECT_ROOT, "database_migration", "add_anchor_to_node_contents.sql"
    )
    if not os.path.exists(migration_file):
        print_fail(f"迁移文件不存在: {migration_file}")
        sys.exit(1)

    with open(migration_file, "r", encoding="utf-8") as f:
        sql_content = f.read()

    # 提取 ALTER TABLE 语句（跳过注释）
    sql_statements = []
    for line in sql_content.split("\n"):
        line = line.strip()
        if line and not line.startswith("--"):
            sql_statements.append(line)

    sql = " ".join(sql_statements).rstrip(";")
    if sql:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
        print_ok("迁移完成：lc_node_contents 新增 anchor JSON 列")


# ============================================================
# Step 2: 搜索并上传 PDF
# ============================================================

def find_pdf(pdf_config):
    """在多个目录中搜索匹配的 PDF 文件"""
    filename_hint = pdf_config["search_filename"].lower()
    keywords = [kw.lower() for kw in pdf_config["search_keywords"]]

    candidates = []

    for search_dir in SEARCH_DIRS:
        if not os.path.isdir(search_dir):
            continue
        try:
            for fname in os.listdir(search_dir):
                if not fname.lower().endswith(".pdf"):
                    continue
                fpath = os.path.join(search_dir, fname)
                fname_lower = fname.lower()

                # 精确文件名匹配
                if filename_hint in fname_lower:
                    candidates.append((2, fpath, fname))  # 高优先级
                    continue

                # 关键词匹配（至少匹配 2 个关键词）
                matched = sum(1 for kw in keywords if kw in fname_lower)
                if matched >= 2:
                    candidates.append((1, fpath, fname))
        except PermissionError:
            continue

    if not candidates:
        return None, None

    # 按优先级排序，取最佳匹配
    candidates.sort(key=lambda x: (-x[0], x[2]))
    return candidates[0][1], candidates[0][2]


def check_existing_content(conn, title_keyword):
    """检查 lc_contents 中是否已有匹配的内容"""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, title, file_path FROM lc_contents WHERE title LIKE %s AND is_deleted = 0",
            (f"%{title_keyword}%",),
        )
        return cur.fetchone()


def upload_pdf(conn, pdf_path, pdf_filename, pdf_config):
    """将 PDF 复制到 uploads 并插入 lc_contents 记录"""
    # 创建 uploads 目录
    upload_dir = os.path.join(PROJECT_ROOT, "uploads", "learning_center", "documents")
    os.makedirs(upload_dir, exist_ok=True)

    # 生成 UUID 文件名并复制
    file_uuid = str(uuid.uuid4())
    dest_filename = f"{file_uuid}.pdf"
    dest_path = os.path.join(upload_dir, dest_filename)
    shutil.copy2(pdf_path, dest_path)

    # 相对路径（与 app 上传逻辑一致）
    relative_path = f"uploads/learning_center/documents/{dest_filename}"
    file_size = os.path.getsize(dest_path)

    # 插入数据库记录
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO lc_contents
                (title, description, content_type, file_path, file_name, file_size, mime_type,
                 status, created_by, created_at, updated_at, is_deleted)
            VALUES (%s, %s, 'document', %s, %s, %s, 'application/pdf',
                    'published', 'admin', NOW(), NOW(), 0)
            """,
            (
                pdf_config["title"],
                pdf_config["description"],
                relative_path,
                pdf_filename,
                file_size,
            ),
        )
        conn.commit()
        content_id = cur.lastrowid

    return content_id


def setup_pdfs(conn):
    """搜索、上传所有 PDF 并返回 content_id 映射"""
    print_step(2, "搜索并上传 PDF 教材...")

    content_id_map = {}  # key -> content_id

    for key, pdf_config in PDF_FILES.items():
        print(f"\n      --- {pdf_config['title'][:50]} ---")

        # 先检查数据库中是否已存在
        # 用标题中的关键部分搜索
        search_term = pdf_config["title"].split("(")[0].strip()
        existing = check_existing_content(conn, search_term[:30])

        if existing:
            content_id_map[key] = existing["id"]
            print_ok(f"已存在 (content_id={existing['id']}): {existing['title'][:50]}")
            continue

        # 搜索 PDF 文件
        pdf_path, pdf_filename = find_pdf(pdf_config)

        if not pdf_path:
            print_warn(f"未找到 PDF 文件！请手动上传: {pdf_config['search_filename']}*.pdf")
            print(f"          搜索目录: {', '.join(d for d in SEARCH_DIRS if os.path.isdir(d))}")
            content_id_map[key] = None
            continue

        print(f"      找到: {pdf_path}")
        content_id = upload_pdf(conn, pdf_path, pdf_filename, pdf_config)
        content_id_map[key] = content_id
        print_ok(f"已上传 (content_id={content_id})")

    return content_id_map


# ============================================================
# Step 3: 更新 JSON 中的 content_id 并导入
# ============================================================

def update_json_content_ids(kg_json_path, old_to_new_content_id):
    """更新 JSON 文件中 content_links 的 content_id"""
    with open(kg_json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    content_links = data.get("content_links", [])
    if not content_links:
        return data

    for link in content_links:
        old_id = link.get("content_id")
        if old_id in old_to_new_content_id:
            link["content_id"] = old_to_new_content_id[old_id]

    return data


def get_auth_token(base_url, config):
    """通过 API 获取 JWT token"""
    # 尝试用 admin/admin123 登录
    login_data = json.dumps({"username": "admin", "password": "admin123"}).encode()
    req = urllib.request.Request(
        f"{base_url}/api/login",
        data=login_data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode())
            if result.get("success") and result.get("access_token"):
                return result["access_token"]
    except Exception as e:
        print_warn(f"登录失败: {e}")
    return None


def import_kg_via_api(base_url, token, data, clear_existing=False):
    """通过 API 导入知识图谱"""
    payload = dict(data)
    payload["clear_existing"] = clear_existing

    req_data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url}/api/admin/learning-center/knowledge-graph/import",
        data=req_data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def import_via_direct_db(conn, data):
    """
    直接通过数据库导入（备用方案，API 不可用时使用）。
    只导入 content_links 部分（假设节点和边已存在）。
    """
    content_links = data.get("content_links", [])
    if not content_links:
        return 0

    # 需要 temp_id → real_id 映射
    # 先查出所有节点的 title → id 映射
    with conn.cursor() as cur:
        cur.execute("SELECT id, title FROM lc_knowledge_nodes WHERE is_deleted = 0")
        nodes = {row["title"]: row["id"] for row in cur.fetchall()}

    # 用 nodes 中的 temp_id 对应的 title 查找
    # 但是我们只有 temp_id，不知道 title... 需要从 JSON nodes 中建立 temp_id → title
    node_map = {n["temp_id"]: n["title"] for n in data.get("nodes", [])}

    created = 0
    for link in content_links:
        temp_id = link.get("node")
        content_id = link.get("content_id")
        anchor = link.get("anchor")
        sort_order = link.get("sort_order", 0)

        title = node_map.get(temp_id)
        if not title:
            continue
        node_id = nodes.get(title)
        if not node_id:
            continue

        anchor_str = json.dumps(anchor, ensure_ascii=False) if anchor else None
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT IGNORE INTO lc_node_contents (node_id, content_id, sort_order, anchor)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (node_id, content_id, sort_order, anchor_str),
                )
            created += cur.rowcount
        except Exception:
            pass

    conn.commit()
    return created


def do_import(conn, content_id_map, base_url=None, token=None):
    """导入全部知识图谱"""
    print_step(3, "导入知识图谱（节点 + 边 + 内容关联）...")

    # 预定义的 content_id 映射（JSON 中的 → 当前数据库中的）
    # JSON 文件里用的 content_id 是开发机上的值，需要映射到当前机器的值
    ORIGINAL_CONTENT_IDS = {
        "ai_agent": 1,       # 开发机上 AI Agent PDF 的 content_id
        "utest": 4,          # 开发机上 UTest PDF 的 content_id
        "ulearning_student": 5,  # 开发机上 ULearning PDF 的 content_id
    }

    first_import = True  # 第一个 JSON 导入时 clear_existing=True

    for key, pdf_config in PDF_FILES.items():
        json_file = os.path.join(PROJECT_ROOT, "data", pdf_config["kg_json"])
        if not os.path.exists(json_file):
            print_warn(f"JSON 文件不存在: {json_file}")
            continue

        print(f"\n      --- {pdf_config['kg_json']} ---")

        # 读取 JSON
        with open(json_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        # 映射 content_id: 原始 → 当前
        original_cid = ORIGINAL_CONTENT_IDS.get(key)
        current_cid = content_id_map.get(key)

        if current_cid and original_cid and current_cid != original_cid:
            for link in data.get("content_links", []):
                if link.get("content_id") == original_cid:
                    link["content_id"] = current_cid
            print(f"      content_id 映射: {original_cid} → {current_cid}")
        elif not current_cid:
            # 没有对应 PDF，移除 content_links
            data["content_links"] = []
            print_warn("无对应 PDF，跳过 content_links")

        num_nodes = len(data.get("nodes", []))
        num_edges = len(data.get("edges", []))
        num_links = len(data.get("content_links", []))

        # 尝试 API 导入
        if base_url and token:
            try:
                result = import_kg_via_api(
                    base_url, token, data, clear_existing=first_import
                )
                if result.get("success"):
                    d = result["data"]
                    print_ok(
                        f"节点={d['created_nodes']}, "
                        f"边={d['created_edges']}, "
                        f"内容关联={d.get('created_links', 0)}, "
                        f"错误={len(d.get('errors', []))}"
                    )
                    if d.get("errors"):
                        for err in d["errors"][:3]:
                            print(f"          ⚠️  {err}")
                    first_import = False
                    continue
                else:
                    print_warn(f"API 返回失败: {result}")
            except Exception as e:
                print_warn(f"API 导入失败: {e}")

        # 备用：直接数据库导入（仅 content_links）
        print(f"      使用数据库直连导入 content_links...")
        created = import_via_direct_db(conn, data)
        print_ok(f"直连导入: {created} 条内容关联 (节点和边需通过 API 导入)")
        first_import = False


# ============================================================
# Step 4: 启动服务器（如果未运行）
# ============================================================

def ensure_server_running(config):
    """确保 FastAPI 服务器运行中，返回 base_url"""
    port = config.get("SERVER_PORT", "8002")
    base_url = f"http://localhost:{port}"

    # 检查是否已运行
    try:
        req = urllib.request.Request(f"{base_url}/health", method="GET")
        with urllib.request.urlopen(req, timeout=3) as resp:
            if resp.status == 200:
                print_ok(f"服务器已运行: {base_url}")
                return base_url
    except Exception:
        pass

    # 尝试启动服务器
    print(f"      服务器未运行，正在启动...")
    try:
        proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app",
             "--host", "0.0.0.0", "--port", port],
            cwd=PROJECT_ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        # 等待启动（最多 20 秒）
        for i in range(20):
            time.sleep(1)
            try:
                req = urllib.request.Request(f"{base_url}/health", method="GET")
                with urllib.request.urlopen(req, timeout=2) as resp:
                    if resp.status == 200:
                        print_ok(f"服务器已启动: {base_url} (PID={proc.pid})")
                        return base_url
            except Exception:
                pass
            print(f"      等待服务器启动... ({i+1}/20)")

        print_warn("服务器启动超时，将使用数据库直连方式导入 content_links")
    except Exception as e:
        print_warn(f"无法启动服务器: {e}")

    return None


# ============================================================
# 主流程
# ============================================================

def main():
    print_header("AI 学习中心一键部署脚本")
    print(f"  项目根目录: {PROJECT_ROOT}")

    # 加载配置
    config = load_env()
    print(f"  数据库: {config.get('DB_USER', 'root')}@{config.get('DB_HOST', 'localhost')}:{config.get('DB_PORT', '3306')}/{config.get('DB_NAME', 'school_ai_assistant')}")

    # 连接数据库
    try:
        conn = get_db_connection(config)
        print_ok("数据库连接成功")
    except Exception as e:
        print_fail(f"数据库连接失败: {e}")
        print("  请检查 .env 文件中的数据库配置，确保 MySQL 服务已启动。")
        sys.exit(1)

    try:
        # Step 1: 数据库迁移
        run_migration(conn)

        # Step 2: 搜索并上传 PDF
        content_id_map = setup_pdfs(conn)

        # 检查是否全部 PDF 都到位
        missing = [k for k, v in content_id_map.items() if v is None]
        if missing:
            print_warn(f"以下 PDF 未找到，对应的 content_links 将被跳过: {missing}")
            response = input("\n  是否继续？(y/n): ").strip().lower()
            if response != "y":
                print("  已取消。")
                return

        # Step 3: 启动服务器
        print_step("3a", "确保服务器运行...")
        base_url = ensure_server_running(config)
        token = None
        if base_url:
            token = get_auth_token(base_url, config)
            if token:
                print_ok("认证成功")
            else:
                print_warn("无法获取 token，将使用数据库直连方式")

        # Step 4: 导入知识图谱
        do_import(conn, content_id_map, base_url, token)

        # 最终统计
        print_header("部署完成！")

        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS cnt FROM lc_knowledge_nodes WHERE is_deleted = 0")
            nodes = cur.fetchone()["cnt"]
            cur.execute("SELECT COUNT(*) AS cnt FROM lc_knowledge_edges")
            edges = cur.fetchone()["cnt"]
            cur.execute("SELECT COUNT(*) AS cnt FROM lc_node_contents")
            links = cur.fetchone()["cnt"]
            cur.execute("SELECT COUNT(*) AS cnt FROM lc_contents WHERE is_deleted = 0")
            contents = cur.fetchone()["cnt"]

        print(f"  📊 最终统计:")
        print(f"      知识节点: {nodes}")
        print(f"      知识边:   {edges}")
        print(f"      教学内容: {contents}")
        print(f"      内容关联: {links} (含页码锚点)")
        print(f"\n  🚀 启动服务器:")
        print(f"      python -m uvicorn app.main:app --host 0.0.0.0 --port {config.get('SERVER_PORT', '8002')} --reload")
        print()

    finally:
        conn.close()


if __name__ == "__main__":
    main()
