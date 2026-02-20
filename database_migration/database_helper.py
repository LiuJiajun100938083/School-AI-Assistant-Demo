#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
database_helper.py - MySQL数据库操作助手
替代原有的JSON文件操作
"""

import pymysql
import bcrypt
import json
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from contextlib import contextmanager
import logging

logger = logging.getLogger(__name__)

# 数据库配置
DB_CONFIG = {
    'host': '127.0.0.1',
    'port': 3306,
    'user': 'ai_assistant',
    'password': 'SecurePass123!',
    'database': 'school_ai_assistant',
    'charset': 'utf8mb4'
}


class DatabaseManager:
    """数据库管理类"""

    def __init__(self):
        self.config = DB_CONFIG

    @contextmanager
    def get_connection(self):
        """获取数据库连接的上下文管理器"""
        connection = pymysql.connect(**self.config)
        try:
            yield connection
            connection.commit()
        except Exception as e:
            connection.rollback()
            logger.error(f"数据库操作失败: {e}")
            raise
        finally:
            connection.close()

    # ========== 用户认证相关 ==========

    def authenticate_user(self, username: str, password: str, ip_address: str = None) -> Tuple[
        bool, str, Optional[str], Optional[str]]:
        """
        验证用户登录
        返回: (成功, 消息, token, 角色)
        """
        with self.get_connection() as conn:
            cursor = conn.cursor()

            try:
                # 获取用户信息
                cursor.execute("""
                    SELECT user_id, password_hash, role, is_active, is_locked, display_name
                    FROM users WHERE username = %s
                """, (username,))

                user = cursor.fetchone()

                if not user:
                    # 记录失败登录
                    cursor.execute("""
                        INSERT INTO audit_logs (event_type, username, ip_address, action, status)
                        VALUES ('LOGIN_FAILURE', %s, %s, 'login', 'failure')
                    """, (username, ip_address))
                    return False, "用户名或密码错误", None, None

                user_id, password_hash, role, is_active, is_locked, display_name = user

                # 检查账户状态
                if is_locked:
                    return False, "账户已被锁定", None, None

                if not is_active:
                    return False, "账户未激活", None, None

                # 验证密码
                if not bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8')):
                    cursor.execute("""
                        INSERT INTO audit_logs (event_type, user_id, username, ip_address, action, status)
                        VALUES ('LOGIN_FAILURE', %s, %s, %s, 'login', 'failure')
                    """, (user_id, username, ip_address))
                    return False, "用户名或密码错误", None, None

                # 更新登录信息
                cursor.execute("""
                    UPDATE users 
                    SET last_login = %s, login_count = login_count + 1
                    WHERE user_id = %s
                """, (datetime.now(), user_id))

                # 记录成功登录
                cursor.execute("""
                    INSERT INTO audit_logs (event_type, user_id, username, ip_address, action, status)
                    VALUES ('LOGIN_SUCCESS', %s, %s, %s, 'login', 'success')
                """, (user_id, username, ip_address))

                # 生成简单的token（实际应该使用JWT）
                token = f"token_{username}_{datetime.now().timestamp()}"

                return True, "登录成功", token, role

            except Exception as e:
                logger.error(f"登录验证失败: {e}")
                return False, "登录失败", None, None

    def get_user_info(self, username: str) -> Optional[Dict]:
        """获取用户信息"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            cursor.execute("""
                SELECT user_id, username, display_name, role, created_at, 
                       last_login, login_count, is_active
                FROM users WHERE username = %s
            """, (username,))

            user = cursor.fetchone()

            if user:
                return {
                    'user_id': user[0],
                    'username': user[1],
                    'display_name': user[2],
                    'role': user[3],
                    'created_at': user[4].isoformat() if user[4] else None,
                    'last_login': user[5].isoformat() if user[5] else None,
                    'login_count': user[6],
                    'is_active': user[7]
                }
            return None

    # ========== 对话管理 ==========

    def get_user_conversations(self, username: str) -> List[Dict]:
        """获取用户的所有对话"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            cursor.execute("""
                SELECT c.conversation_id, c.title, c.subject_code, 
                       c.created_at, c.updated_at, c.message_count
                FROM conversations c
                JOIN users u ON c.user_id = u.user_id
                WHERE u.username = %s AND c.is_deleted = FALSE
                ORDER BY c.updated_at DESC
            """, (username,))

            conversations = []
            for row in cursor.fetchall():
                conversations.append({
                    'id': row[0],
                    'title': row[1],
                    'subject': row[2],
                    'created_at': row[3].isoformat() if row[3] else None,
                    'updated_at': row[4].isoformat() if row[4] else None,
                    'message_count': row[5]
                })

            return conversations

    def create_conversation(self, username: str, title: str, subject: str) -> Dict:
        """创建新对话"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            # 获取用户ID
            cursor.execute("SELECT user_id FROM users WHERE username = %s", (username,))
            user = cursor.fetchone()

            if not user:
                raise ValueError(f"用户 {username} 不存在")

            user_id = user[0]
            conversation_id = str(uuid.uuid4())

            # 创建对话
            cursor.execute("""
                INSERT INTO conversations (conversation_id, user_id, title, subject_code)
                VALUES (%s, %s, %s, %s)
            """, (conversation_id, user_id, title, subject))

            # 审计日志
            cursor.execute("""
                INSERT INTO audit_logs (event_type, user_id, username, action, resource_type, resource_id, status)
                VALUES ('CREATE_CONVERSATION', %s, %s, 'create', 'conversation', %s, 'success')
            """, (user_id, username, conversation_id))

            return {
                'conversation_id': conversation_id,
                'title': title,
                'subject': subject,
                'created_at': datetime.now().isoformat()
            }

    def get_conversation(self, username: str, conversation_id: str) -> Optional[Dict]:
        """获取对话详情"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            # 获取对话信息
            cursor.execute("""
                SELECT c.conversation_id, c.title, c.subject_code, 
                       c.created_at, c.updated_at, c.message_count
                FROM conversations c
                JOIN users u ON c.user_id = u.user_id
                WHERE c.conversation_id = %s AND u.username = %s
            """, (conversation_id, username))

            conv = cursor.fetchone()
            if not conv:
                return None

            # 获取消息
            cursor.execute("""
                SELECT role, content, thinking, timestamp
                FROM messages
                WHERE conversation_id = %s
                ORDER BY timestamp ASC
            """, (conversation_id,))

            messages = []
            for msg in cursor.fetchall():
                messages.append({
                    'role': msg[0],
                    'content': msg[1],
                    'thinking': msg[2],
                    'timestamp': msg[3].isoformat() if msg[3] else None
                })

            return {
                'conversation_id': conv[0],
                'title': conv[1],
                'subject': conv[2],
                'created_at': conv[3].isoformat() if conv[3] else None,
                'updated_at': conv[4].isoformat() if conv[4] else None,
                'message_count': conv[5],
                'messages': messages
            }

    def save_message(self, conversation_id: str, role: str, content: str, thinking: str = None, model: str = None):
        """保存消息到对话"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            # 检查对话是否存在
            cursor.execute("SELECT user_id FROM conversations WHERE conversation_id = %s", (conversation_id,))
            if not cursor.fetchone():
                raise ValueError(f"对话 {conversation_id} 不存在")

            # 插入消息
            cursor.execute("""
                INSERT INTO messages (conversation_id, role, content, thinking, model_used)
                VALUES (%s, %s, %s, %s, %s)
            """, (conversation_id, role, content, thinking, model))

            # 更新对话信息
            cursor.execute("""
                UPDATE conversations 
                SET updated_at = %s, message_count = message_count + 1
                WHERE conversation_id = %s
            """, (datetime.now(), conversation_id))

    def delete_conversation(self, username: str, conversation_id: str) -> bool:
        """删除对话（软删除）"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            # 验证权限
            cursor.execute("""
                SELECT c.conversation_id FROM conversations c
                JOIN users u ON c.user_id = u.user_id
                WHERE c.conversation_id = %s AND u.username = %s
            """, (conversation_id, username))

            if not cursor.fetchone():
                return False

            # 软删除
            cursor.execute("""
                UPDATE conversations 
                SET is_deleted = TRUE, deleted_at = %s
                WHERE conversation_id = %s
            """, (datetime.now(), conversation_id))

            return True

    # ========== 用户管理 ==========

    def add_user(self, username: str, password: str, display_name: str = None,
                 role: str = 'student', class_name: str = None) -> Tuple[bool, str]:
        """添加新用户"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            try:
                # 检查用户是否存在
                cursor.execute("SELECT user_id FROM users WHERE username = %s", (username,))
                if cursor.fetchone():
                    return False, "用户名已存在"

                # 哈希密码
                password_hash = bcrypt.hashpw(
                    password.encode('utf-8'),
                    bcrypt.gensalt()
                ).decode('utf-8')

                # 创建用户
                cursor.execute("""
                    INSERT INTO users (username, password_hash, display_name, role)
                    VALUES (%s, %s, %s, %s)
                """, (username, password_hash, display_name or username, role))

                user_id = cursor.lastrowid

                # 记录密码历史
                cursor.execute("""
                    INSERT INTO password_history (user_id, password_hash, changed_by)
                    VALUES (%s, %s, %s)
                """, (user_id, password_hash, 'system'))

                return True, "用户创建成功"

            except Exception as e:
                logger.error(f"创建用户失败: {e}")
                return False, f"创建失败: {str(e)}"

    def update_user_password(self, username: str, new_password: str) -> bool:
        """更新用户密码"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            try:
                # 获取用户ID
                cursor.execute("SELECT user_id FROM users WHERE username = %s", (username,))
                user = cursor.fetchone()

                if not user:
                    return False

                user_id = user[0]

                # 哈希新密码
                password_hash = bcrypt.hashpw(
                    new_password.encode('utf-8'),
                    bcrypt.gensalt()
                ).decode('utf-8')

                # 更新密码
                cursor.execute("""
                    UPDATE users 
                    SET password_hash = %s, password_changed_at = %s
                    WHERE user_id = %s
                """, (password_hash, datetime.now(), user_id))

                # 记录密码历史
                cursor.execute("""
                    INSERT INTO password_history (user_id, password_hash, changed_by)
                    VALUES (%s, %s, %s)
                """, (user_id, password_hash, 'user'))

                return True

            except Exception as e:
                logger.error(f"更新密码失败: {e}")
                return False

    def get_all_users(self) -> List[Dict]:
        """获取所有用户列表"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            cursor.execute("""
                SELECT username, display_name, role, created_at, last_login, is_active
                FROM users
                ORDER BY created_at DESC
            """)

            users = []
            for row in cursor.fetchall():
                users.append({
                    'username': row[0],
                    'display_name': row[1],
                    'role': row[2],
                    'created_at': row[3].isoformat() if row[3] else None,
                    'last_login': row[4].isoformat() if row[4] else None,
                    'is_active': row[5]
                })

            return users


# 创建全局数据库管理器实例
db_manager = DatabaseManager()


# ========== 兼容性函数（替代原有的JSON操作） ==========

def load_user_conversations(username: str) -> Dict:
    """
    加载用户对话（兼容旧代码）
    返回格式与原JSON格式兼容
    """
    conversations = {}
    for conv in db_manager.get_user_conversations(username):
        conversations[conv['id']] = {
            'title': conv['title'],
            'subject': conv['subject'],
            'messages': [],
            'created_at': conv['created_at'],
            'updated_at': conv['updated_at']
        }

    # 如果需要消息，单独加载
    for conv_id in conversations:
        conv_detail = db_manager.get_conversation(username, conv_id)
        if conv_detail:
            conversations[conv_id]['messages'] = conv_detail['messages']

    return conversations


def save_user_conversations(username: str, conversations: Dict):
    """
    保存用户对话（兼容旧代码）
    注意：新系统中应该使用save_message逐条保存
    """
    # 这个函数在新系统中不需要，因为数据直接保存到数据库
    # 保留这个函数只是为了兼容性
    logger.warning("save_user_conversations 已弃用，请使用 db_manager.save_message")
    pass


# ========== 测试函数 ==========

def test_database_connection():
    """测试数据库连接"""
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            result = cursor.fetchone()
            print(f"✅ 数据库连接成功: {result}")

            # 显示用户数量
            cursor.execute("SELECT COUNT(*) FROM users")
            count = cursor.fetchone()[0]
            print(f"  用户数量: {count}")

            # 显示对话数量
            cursor.execute("SELECT COUNT(*) FROM conversations")
            count = cursor.fetchone()[0]
            print(f"  对话数量: {count}")

            return True
    except Exception as e:
        print(f"❌ 数据库连接失败: {e}")
        return False


if __name__ == "__main__":
    # 测试连接
    test_database_connection()

    # 测试认证
    success, msg, token, role = db_manager.authenticate_user("jjliu", "jjliu")
    print(f"\n测试登录 jjliu: {success}, {msg}, 角色: {role}")

    # 测试获取用户信息
    user_info = db_manager.get_user_info("jjliu")
    if user_info:
        print(f"\n用户信息: {user_info['display_name']} ({user_info['role']})")

    # 测试获取对话
    conversations = db_manager.get_user_conversations("jjliu")
    print(f"\n用户 jjliu 的对话数量: {len(conversations)}")