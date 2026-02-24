#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
游戏上传 - Repository 层

封装 uploaded_games 表的所有数据库操作。
遵循项目 BaseRepository 模式，通过参数化查询防止 SQL 注入。
"""

import json
import logging
from typing import Any, Dict, List, Optional

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class GameUploadRepository(BaseRepository):
    """游戏上传 Repository"""

    TABLE = "uploaded_games"

    # ============================================================
    # 表初始化
    # ============================================================

    def init_table(self) -> None:
        """初始化 uploaded_games 表（幂等）"""
        create_table_sql = """
        CREATE TABLE IF NOT EXISTS uploaded_games (
            id INT AUTO_INCREMENT PRIMARY KEY,
            uuid VARCHAR(36) NOT NULL UNIQUE,
            name VARCHAR(100) NOT NULL,
            name_en VARCHAR(100),
            description TEXT NOT NULL,
            subject VARCHAR(20) NOT NULL,
            icon VARCHAR(10) DEFAULT '🎮',
            difficulty JSON,
            tags JSON,
            uploader_id INT NOT NULL,
            is_public BOOLEAN DEFAULT FALSE,
            visible_to JSON COMMENT '可见班级列表，如["2A","3B"]，空数组=所有班级',
            teacher_only BOOLEAN DEFAULT FALSE COMMENT '仅教师/管理员可见',
            file_size INT DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            is_deleted BOOLEAN DEFAULT FALSE,

            INDEX idx_subject (subject),
            INDEX idx_uploader (uploader_id),
            INDEX idx_public (is_public),
            INDEX idx_deleted (is_deleted),
            INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='教师上传的游戏'
        """

        # 迁移：为已有表添加新列（兼容所有 MySQL 版本）
        new_columns = {
            'visible_to': "ALTER TABLE uploaded_games ADD COLUMN visible_to JSON COMMENT '可见班级列表' AFTER is_public",
            'teacher_only': "ALTER TABLE uploaded_games ADD COLUMN teacher_only BOOLEAN DEFAULT FALSE COMMENT '仅教师/管理员可见' AFTER visible_to",
        }

        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(create_table_sql)

            # 查询已有列，只添加缺失的列
            cursor.execute("SHOW COLUMNS FROM uploaded_games")
            existing_columns = {row['Field'] for row in cursor.fetchall()}

            for col_name, alter_sql in new_columns.items():
                if col_name not in existing_columns:
                    try:
                        cursor.execute(alter_sql)
                        logger.info("已添加列: %s", col_name)
                    except Exception as e:
                        logger.warning("添加列 %s 失败: %s", col_name, e)

        logger.info("uploaded_games 表初始化成功")

        # 初始化分享 token 表
        with self.transaction() as conn2:
            self._init_share_table(conn2)

    def _init_share_table(self, conn) -> None:
        """初始化 game_share_tokens 表（幂等）"""
        create_sql = """
        CREATE TABLE IF NOT EXISTS game_share_tokens (
            id INT AUTO_INCREMENT PRIMARY KEY,
            token VARCHAR(32) NOT NULL UNIQUE,
            game_uuid VARCHAR(36) NOT NULL,
            creator_id INT NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_token (token),
            INDEX idx_game (game_uuid),
            INDEX idx_expires (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='游戏分享 Token'
        """
        cursor = conn.cursor()
        cursor.execute(create_sql)
        logger.info("game_share_tokens 表初始化成功")

    # ============================================================
    # 分享 Token
    # ============================================================

    def create_share_token(self, data: Dict[str, Any]) -> int:
        """创建分享 token 记录"""
        sql = """
        INSERT INTO game_share_tokens (token, game_uuid, creator_id, expires_at)
        VALUES (%s, %s, %s, %s)
        """
        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(sql, (
                data['token'], data['game_uuid'],
                data['creator_id'], data['expires_at'],
            ))
            return cursor.lastrowid

    def find_share_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        查询分享 token（JOIN 游戏表获取游戏信息）

        返回 token + 游戏数据，不检查过期（由 Service 层判断）
        """
        return self.raw_query_one(
            """
            SELECT t.token, t.expires_at, t.created_at as share_created_at,
                   g.uuid, g.name, g.name_en, g.description, g.subject,
                   g.icon, g.difficulty, g.tags, g.file_size,
                   COALESCE(u.display_name, u.username) as uploader_name
            FROM game_share_tokens t
            JOIN uploaded_games g ON t.game_uuid = g.uuid AND g.is_deleted = FALSE
            LEFT JOIN users u ON g.uploader_id = u.id
            WHERE t.token = %s
            """,
            (token,),
        )

    def cleanup_expired_tokens(self) -> int:
        """清理过期的分享 token"""
        sql = "DELETE FROM game_share_tokens WHERE expires_at < NOW()"
        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(sql)
            count = cursor.rowcount
            if count > 0:
                logger.info("已清理 %d 个过期分享 token", count)
            return count

    # ============================================================
    # 查询
    # ============================================================

    def find_by_uuid(self, game_uuid: str) -> Optional[Dict[str, Any]]:
        """根据 UUID 查询游戏（含上传者名称，排除已删除）"""
        return self.raw_query_one(
            """
            SELECT g.*, COALESCE(u.display_name, u.username) as uploader_name
            FROM uploaded_games g
            LEFT JOIN users u ON g.uploader_id = u.id
            WHERE g.uuid = %s AND g.is_deleted = FALSE
            """,
            (game_uuid,),
        )

    def list_games(
        self,
        user_id: int,
        user_role: str,
        subject: Optional[str] = None,
        only_mine: bool = False,
        user_class: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        获取游戏列表

        权限规则：
        - 学生：公开 + 非teacher_only + 班级匹配
        - 教师：公开 + teacher_only + 自己上传
        - 管理员：全部
        """
        conditions = ["g.is_deleted = FALSE"]
        params: list = []

        # 学科筛选
        if subject and subject != 'all':
            conditions.append("g.subject = %s")
            params.append(subject)

        # 权限筛选
        if user_role == 'student':
            conditions.append("g.is_public = TRUE")
            conditions.append("g.teacher_only = FALSE")
        elif user_role == 'teacher':
            if only_mine:
                conditions.append("g.uploader_id = %s")
                params.append(user_id)
            else:
                conditions.append("(g.is_public = TRUE OR g.teacher_only = TRUE OR g.uploader_id = %s)")
                params.append(user_id)
        elif only_mine:
            # admin + only_mine
            conditions.append("g.uploader_id = %s")
            params.append(user_id)

        where_clause = " AND ".join(conditions)

        return self.raw_query(
            f"""
            SELECT g.*, COALESCE(u.display_name, u.username) as uploader_name
            FROM uploaded_games g
            LEFT JOIN users u ON g.uploader_id = u.id
            WHERE {where_clause}
            ORDER BY g.created_at DESC
            """,
            tuple(params),
        )

    def create_game(self, data: Dict[str, Any]) -> int:
        """创建游戏记录"""
        return self.insert(data)

    def update_game(self, game_uuid: str, data: Dict[str, Any]) -> int:
        """更新游戏记录"""
        return self.update(data, "uuid = %s", (game_uuid,))

    def soft_delete_game(self, game_uuid: str) -> int:
        """软删除游戏"""
        return self.soft_delete("uuid = %s", (game_uuid,))

    def toggle_visibility(self, game_uuid: str, new_visibility: bool) -> int:
        """切换游戏可见性"""
        return self.update(
            {"is_public": new_visibility},
            "uuid = %s",
            (game_uuid,),
        )

    # ============================================================
    # 学科配置（从数据库动态获取）
    # ============================================================

    def get_subjects(self) -> Dict[str, str]:
        """
        动态获取学科列表：优先从数据库 subjects 表读取，失败则回退到默认值。
        """
        try:
            rows = self.raw_query("SELECT subject_code, subject_name FROM subjects")
            if rows:
                db_subjects = {
                    r['subject_code']: r['subject_name']
                    for r in rows if r.get('subject_code')
                }
                if db_subjects:
                    merged = DEFAULT_SUBJECTS.copy()
                    merged.update(db_subjects)
                    return merged
        except Exception as e:
            logger.warning("从数据库加载学科失败，使用默认列表: %s", e)
        return DEFAULT_SUBJECTS.copy()

    def get_subjects_with_icons(self) -> Dict[str, Dict[str, str]]:
        """获取带图标的学科列表，用于前端显示。"""
        default_icons = {
            'chinese': '📖', 'math': '📐', 'english': '🔤',
            'history': '📜', 'ict': '💻', 'physics': '⚡',
            'chemistry': '🧪', 'biology': '🧬', 'ces': '🏛️',
        }
        try:
            rows = self.raw_query(
                "SELECT subject_code, subject_name, config FROM subjects"
            )
            if rows:
                result = {}
                for r in rows:
                    code = r.get('subject_code', '')
                    if not code:
                        continue
                    config = r.get('config')
                    if isinstance(config, str):
                        try:
                            config = json.loads(config)
                        except (json.JSONDecodeError, TypeError):
                            config = {}
                    if not isinstance(config, dict):
                        config = {}
                    icon = config.get('icon', default_icons.get(code, '📚'))
                    result[code] = {"name": r.get('subject_name', code), "icon": icon}
                if result:
                    for code, name in DEFAULT_SUBJECTS.items():
                        if code not in result:
                            result[code] = {"name": name, "icon": default_icons.get(code, "📚")}
                    return result
        except Exception as e:
            logger.warning("从数据库加载学科(含图标)失败，使用默认列表: %s", e)
        return {
            code: {"name": name, "icon": default_icons.get(code, "📚")}
            for code, name in DEFAULT_SUBJECTS.items()
        }


# ==================================================================================
#                                   常量
# ==================================================================================

DEFAULT_SUBJECTS: Dict[str, str] = {
    'chinese': '中文',
    'math': '數學',
    'english': '英文',
    'history': '歷史',
    'ict': 'ICT',
    'physics': '物理',
    'chemistry': '化學',
    'biology': '生物',
    'ces': '公民',
}
