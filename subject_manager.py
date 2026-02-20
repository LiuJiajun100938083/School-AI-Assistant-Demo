# subject_manager.py - 修改为使用 MySQL
import json
import logging
from typing import Dict, Optional
from app.bridge import get_db

logger = logging.getLogger(__name__)


class SubjectManager:
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.subjects = self.load_subjects()
        self._ensure_tables_exist()

    # -----------------------------
    # DB bootstrap
    # -----------------------------
    def _ensure_tables_exist(self):
        """确保数据库表存在"""
        with get_db() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS subjects (
                        subject_code VARCHAR(64) NOT NULL,
                        subject_name VARCHAR(255) NOT NULL,
                        config LONGTEXT NULL,
                        PRIMARY KEY (subject_code)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                    """
                )
                conn.commit()
            finally:
                cursor.close()

    # -----------------------------
    # Load / Save
    # -----------------------------
    def load_subjects(self) -> Dict[str, Dict]:
        """从 MySQL 加载学科配置（以 subject_code 为键）"""
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT subject_code, subject_name, config
                FROM subjects
                ORDER BY subject_code
                """
            )
            subjects: Dict[str, Dict] = {}
            for row in cursor.fetchall():
                subjects[row['subject_code']] = {
                    'name': row['subject_name'],
                    'config': json.loads(row['config']) if row['config'] else {},
                }
            if not subjects:
                subjects = self._init_default_subjects()
            return subjects

    def save_subjects(self, subjects: Dict[str, Dict] = None) -> None:
        """保存学科配置到 MySQL（批量 UPSERT）"""
        if subjects is None:
            subjects = self.subjects
        with get_db() as conn:
            cursor = conn.cursor()
            for code, data in subjects.items():
                cursor.execute(
                    """
                    INSERT INTO subjects (subject_code, subject_name, config)
                    VALUES (%s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        subject_name = VALUES(subject_name),
                        config = VALUES(config)
                    """,
                    (
                        code,
                        data.get('name', ''),
                        json.dumps(data.get('config', {}), ensure_ascii=False),
                    ),
                )
            conn.commit()

    # -----------------------------
    # Single-item helpers (兼容常用 API)
    # -----------------------------
    def get_subject(self, code: str) -> Optional[Dict]:
        """获取单个学科信息"""
        with get_db() as conn:
            try:
                cursor = conn.cursor(dictionary=True)  # 使用字典游标
            except TypeError:
                cursor = conn.cursor()  # 回退到普通游标

            cursor.execute(
                "SELECT subject_code, subject_name, config FROM subjects WHERE subject_code = %s",
                (code,)
            )
            row = cursor.fetchone()

            if not row:
                return None

            # 判断row是字典还是元组
            if isinstance(row, dict):
                # 字典格式
                config = row.get('config', '{}')
                try:
                    config_dict = json.loads(config) if config else {}
                except:
                    config_dict = {}

                return {
                    "code": row['subject_code'],
                    "name": row['subject_name'],
                    "config": config_dict,
                    "icon": config_dict.get('icon', '📚')
                }
            else:
                # 元组格式 (subject_code, subject_name, config)
                config = row[2] if len(row) > 2 else '{}'
                try:
                    config_dict = json.loads(config) if config else {}
                except:
                    config_dict = {}

                return {
                    "code": row[0],
                    "name": row[1],
                    "config": config_dict,
                    "icon": config_dict.get('icon', '📚')
                }

    def list_subjects(self) -> Dict[str, Dict]:
        """列出所有学科（字典形式）"""
        return self.load_subjects()

    def add_subject(
            self,
            code: str,
            name: str,
            icon: str = "",
            description: str = "",
            keywords: Optional[list] = None,
            prompt: Optional[str] = None,
    ) -> tuple[bool, str]:  # 修改返回类型为元组
        """添加新学科（返回成功状态和消息）"""
        if self.get_subject(code):
            return False, f"学科代码 '{code}' 已存在"  # 返回元组

        cfg = {
            "icon": icon or "📚",
            "description": description,
            "keywords": keywords or [],
            "doc_count": 0,
        }
        if prompt:
            cfg["prompt"] = prompt

        try:
            self.save_subjects({code: {"name": name, "config": cfg}})
            return True, f"成功添加学科: {name} ({code})"  # 返回元组
        except Exception as e:
            return False, f"添加学科失败: {str(e)}"  # 返回元组

    def update_subject(self, code: str, **kwargs) -> bool:
        """更新学科信息（name/icon/description/keywords/prompt）"""
        existing = self.get_subject(code)
        if not existing:
            return False
        name = kwargs.get("name", existing["name"])
        cfg = existing["config"] or {}
        if "icon" in kwargs and kwargs["icon"] is not None:
            cfg["icon"] = kwargs["icon"]
        if "description" in kwargs and kwargs["description"] is not None:
            cfg["description"] = kwargs["description"]
        if "keywords" in kwargs and kwargs["keywords"] is not None:
            cfg["keywords"] = kwargs["keywords"]
        if "prompt" in kwargs and kwargs["prompt"] is not None:
            cfg["prompt"] = kwargs["prompt"]
        self.save_subjects({code: {"name": name, "config": cfg}})
        return True

    def delete_subject(self, code: str) -> bool:
        """删除学科（保护核心学科）"""
        core_subjects = {"ict", "ces", "history"}
        if code in core_subjects:
            return False
        with get_db() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("DELETE FROM subjects WHERE subject_code = %s", (code,))
                conn.commit()
                return cursor.rowcount > 0
            finally:
                cursor.close()

    def get_prompt(self, code: str) -> Optional[str]:
        """从 config 中提取 prompt"""
        subject = self.get_subject(code)
        if not subject:
            return None
        return (subject.get("config") or {}).get("prompt")

    def update_prompt(self, code: str, prompt: str) -> bool:
        """更新指定学科的 prompt（写入 config）"""
        subj = self.get_subject(code)
        if not subj:
            return False
        cfg = subj.get("config") or {}
        cfg["prompt"] = prompt
        self.save_subjects({code: {"name": subj["name"], "config": cfg}})
        return True

    def update_doc_count(self, code: str, increment: int = 1) -> bool:
        """更新学科文档数量（写入 config.doc_count）"""
        try:
            with get_db() as conn:
                cursor = conn.cursor()

                # 先获取当前的 config
                cursor.execute(
                    "SELECT config FROM subjects WHERE subject_code = %s",
                    (code,)
                )
                result = cursor.fetchone()

                if not result:
                    logger.error(f"学科 {code} 不存在")
                    return False

                # 解析现有配置
                try:
                    config = json.loads(result['config'] if isinstance(result, dict) else result[0]) if result else {}
                except:
                    config = {}

                # 更新文档计数
                current_count = int(config.get('doc_count', 0))
                new_count = current_count + int(increment)
                config['doc_count'] = new_count

                # 保存回数据库
                cursor.execute(
                    """
                    UPDATE subjects 
                    SET config = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE subject_code = %s
                    """,
                    (json.dumps(config, ensure_ascii=False), code)
                )
                conn.commit()

                logger.info(f"✅ 学科 {code} 文档数量更新: {current_count} -> {new_count}")
                return True

        except Exception as e:
            logger.error(f"更新文档计数失败: {e}")
            return False

    def get_statistics(self):
        """获取学科统计信息"""
        if not get_db:
            # 如果没有数据库连接，返回默认值
            return {
                'total_subjects': len(self.subjects),
                'subjects_with_content': 0,
                'total_documents': 0
            }

        try:
            with get_db() as conn:
                cursor = conn.cursor()

                # 统计学科总数
                cursor.execute("SELECT COUNT(*) as total FROM subjects")
                result = cursor.fetchone()
                total_subjects = result['total'] if isinstance(result, dict) else result[0]

                # 统计有文档的学科数
                cursor.execute("""
                    SELECT COUNT(*) as count 
                    FROM subjects 
                    WHERE JSON_EXTRACT(config, '$.doc_count') > 0
                """)
                result = cursor.fetchone()
                subjects_with_content = result['count'] if isinstance(result, dict) else result[0]

                # 统计总文档数
                cursor.execute("""
                    SELECT COALESCE(SUM(CAST(JSON_EXTRACT(config, '$.doc_count') AS UNSIGNED)), 0) as total_docs
                    FROM subjects
                    WHERE JSON_EXTRACT(config, '$.doc_count') IS NOT NULL
                """)
                result = cursor.fetchone()
                total_documents = (result['total_docs'] if isinstance(result, dict) else result[0]) or 0

                return {
                    'total_subjects': int(total_subjects),
                    'subjects_with_content': int(subjects_with_content),  # 统一使用这个键名
                    'total_documents': int(total_documents)
                }

        except Exception as e:
            logger.error(f"获取统计信息失败: {e}")
            # 返回默认值，避免程序崩溃
            return {
                'total_subjects': 0,
                'subjects_with_content': 0,
                'total_documents': 0
            }

    # -----------------------------
    # Defaults
    # -----------------------------
    def _init_default_subjects(self) -> Dict[str, Dict]:
        """初始化默认学科配置（简版，可按需扩展）"""
        default_subjects: Dict[str, Dict] = {
            "chinese": {"name": "语文", "config": {}},
            "math": {"name": "数学", "config": {}},
            "english": {"name": "英语", "config": {}},
        }
        self.save_subjects(default_subjects)
        return default_subjects


# 全局实例与便捷函数（兼容旧接口）
subject_manager = SubjectManager()

def get_subject_prompt(subject_code: str) -> str:
    """获取学科提示词（若无则返回通用提示）"""
    prompt = subject_manager.get_prompt(subject_code)
    if prompt:
        return prompt
    info = subject_manager.get_subject(subject_code)
    if info:
        name = info.get("name", "该学科")
        desc = (info.get("config") or {}).get("description", "")
        return (
            f"你是我的{name}學習伙伴，幫助我一起學習中學的{name}課程內容。"
            f"學科描述：{desc}。請使用{name}科目的資料回答。"
        )
    return "你是一个AI学习助手，请帮助学生学习。"

def get_subject_info(subject_code: str) -> Dict:
    """获取学科信息（兼容旧接口的返回结构）"""
    info = subject_manager.get_subject(subject_code)
    if not info:
        return {"name": "未知学科", "icon": "📚", "description": ""}
    cfg = info.get("config") or {}
    return {
        "name": info.get("name", "未知学科"),
        "icon": cfg.get("icon", "📚"),
        "description": cfg.get("description", ""),
    }


def delete_subject(self, code: str) -> bool:
    """删除学科"""
    with get_db() as conn:
        cursor = conn.cursor()
        try:
            # 先检查是否存在
            cursor.execute("SELECT subject_code FROM subjects WHERE subject_code = %s", (code,))
            if not cursor.fetchone():
                logger.warning(f"学科 {code} 不存在")
                return False

            # 执行删除
            cursor.execute("DELETE FROM subjects WHERE subject_code = %s", (code,))
            conn.commit()

            # 检查是否删除成功
            deleted = cursor.rowcount > 0
            if deleted:
                logger.info(f"成功删除学科 {code}")
            else:
                logger.error(f"删除学科 {code} 失败，rowcount=0")

            return deleted

        except Exception as e:
            logger.error(f"删除学科异常: {e}")
            conn.rollback()
            return False
        finally:
            cursor.close()