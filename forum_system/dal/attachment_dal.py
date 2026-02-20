"""
附件数据访问层
=============

处理forum_attachments表的所有数据库操作。
"""

import logging
from typing import Dict, List, Optional
import os

from .base_dal import BaseDAL, DatabaseConnection
from ..models.schemas import FileType

logger = logging.getLogger(__name__)


class AttachmentDAL(BaseDAL):
    """附件数据访问层"""

    TABLE_NAME = "forum_attachments"
    PRIMARY_KEY = "attachment_id"

    # ========== 查询方法 ==========

    def get_by_id(self, attachment_id: int) -> Optional[Dict]:
        """根据ID获取附件"""
        sql = f"""
            SELECT * FROM {self.TABLE_NAME}
            WHERE attachment_id = %s AND is_deleted = FALSE
        """
        return DatabaseConnection.execute_query(sql, (attachment_id,), fetch_one=True)

    def get_post_attachments(self, post_id: int) -> List[Dict]:
        """获取主题的所有附件"""
        sql = f"""
            SELECT * FROM {self.TABLE_NAME}
            WHERE post_id = %s AND is_deleted = FALSE
            ORDER BY created_at ASC
        """
        return DatabaseConnection.execute_query(sql, (post_id,)) or []

    def get_reply_attachments(self, reply_id: int) -> List[Dict]:
        """获取回复的所有附件"""
        sql = f"""
            SELECT * FROM {self.TABLE_NAME}
            WHERE reply_id = %s AND is_deleted = FALSE
            ORDER BY created_at ASC
        """
        return DatabaseConnection.execute_query(sql, (reply_id,)) or []

    def get_attachments_by_ids(self, attachment_ids: List[int]) -> List[Dict]:
        """批量获取附件"""
        if not attachment_ids:
            return []

        placeholders = ','.join(['%s'] * len(attachment_ids))
        sql = f"""
            SELECT * FROM {self.TABLE_NAME}
            WHERE attachment_id IN ({placeholders}) AND is_deleted = FALSE
        """
        return DatabaseConnection.execute_query(sql, tuple(attachment_ids)) or []

    # ========== 写入方法 ==========

    def create_attachment(
        self,
        file_name: str,
        file_path: str,
        file_size: int,
        file_type: FileType,
        mime_type: str,
        upload_username: str,
        post_id: Optional[int] = None,
        reply_id: Optional[int] = None
    ) -> int:
        """
        创建附件记录

        Returns:
            新附件ID
        """
        data = {
            'file_name': file_name,
            'file_path': file_path,
            'file_size': file_size,
            'file_type': file_type.value,
            'mime_type': mime_type,
            'upload_username': upload_username,
            'post_id': post_id,
            'reply_id': reply_id
        }

        return self.insert(data)

    def link_to_post(self, attachment_id: int, post_id: int) -> int:
        """将附件关联到主题"""
        sql = f"""
            UPDATE {self.TABLE_NAME}
            SET post_id = %s
            WHERE attachment_id = %s
        """
        return DatabaseConnection.execute_write(
            sql,
            (post_id, attachment_id),
            return_lastrowid=False
        )

    def link_to_reply(self, attachment_id: int, reply_id: int) -> int:
        """将附件关联到回复"""
        sql = f"""
            UPDATE {self.TABLE_NAME}
            SET reply_id = %s
            WHERE attachment_id = %s
        """
        return DatabaseConnection.execute_write(
            sql,
            (reply_id, attachment_id),
            return_lastrowid=False
        )

    def soft_delete(self, attachment_id: int) -> int:
        """软删除附件"""
        sql = f"""
            UPDATE {self.TABLE_NAME}
            SET is_deleted = TRUE, deleted_at = NOW()
            WHERE attachment_id = %s
        """
        return DatabaseConnection.execute_write(sql, (attachment_id,), return_lastrowid=False)

    # ========== 辅助方法 ==========

    def get_uploader(self, attachment_id: int) -> Optional[str]:
        """获取上传者用户名"""
        sql = f"SELECT upload_username FROM {self.TABLE_NAME} WHERE attachment_id = %s"
        result = DatabaseConnection.execute_query(sql, (attachment_id,), fetch_one=True)
        return result['upload_username'] if result else None

    def get_file_path(self, attachment_id: int) -> Optional[str]:
        """获取文件路径"""
        sql = f"SELECT file_path FROM {self.TABLE_NAME} WHERE attachment_id = %s"
        result = DatabaseConnection.execute_query(sql, (attachment_id,), fetch_one=True)
        return result['file_path'] if result else None

    @staticmethod
    def determine_file_type(mime_type: str) -> FileType:
        """根据MIME类型确定文件类型"""
        if mime_type.startswith('image/'):
            return FileType.IMAGE
        elif mime_type.startswith('video/'):
            return FileType.VIDEO
        elif mime_type.startswith('audio/'):
            return FileType.AUDIO
        elif mime_type in [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain',
            'text/markdown',
        ]:
            return FileType.DOCUMENT
        else:
            return FileType.OTHER


# 单例实例
attachment_dal = AttachmentDAL()
