#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
migrate_to_mysql.py - 将JSON数据迁移到MySQL数据库
"""

import json
import pymysql
import os
import sys
from pathlib import Path
from datetime import datetime
import uuid
import shutil
import bcrypt
from cryptography.fernet import Fernet

# 数据库连接配置
DB_CONFIG = {
    'host': '127.0.0.1',
    'port': 3306,
    'user': 'ai_assistant',
    'password': 'SecurePass123!',
    'database': 'school_ai_assistant',
    'charset': 'utf8mb4'
}


class DataMigration:
    """数据迁移工具"""

    def __init__(self, project_path=None):
        """
        初始化迁移工具
        project_path: 项目根目录路径，如果不提供则使用当前目录
        """
        self.project_path = Path(project_path) if project_path else Path.cwd()
        self.users_file = self.project_path / "users.json"
        self.user_data_dir = self.project_path / "user_data"

        # 创建备份目录
        self.backup_dir = self.project_path / "migration_backups" / datetime.now().strftime("%Y%m%d_%H%M%S")
        self.backup_dir.mkdir(parents=True, exist_ok=True)

        # 加密密钥
        self.encryption_key = self._get_or_create_encryption_key()
        self.cipher = Fernet(self.encryption_key)

        # 统计
        self.stats = {
            "users_migrated": 0,
            "conversations_migrated": 0,
            "messages_migrated": 0,
            "errors": []
        }

        # 用户ID映射
        self.user_mapping = {}

    def _get_or_create_encryption_key(self):
        """获取或创建加密密钥"""
        key_file = self.project_path / ".encryption_key"
        if key_file.exists():
            print("📔 使用现有加密密钥")
            return key_file.read_bytes()
        else:
            key = Fernet.generate_key()
            key_file.write_bytes(key)
            print("🔐 创建新的加密密钥")
            return key

    def check_files(self):
        """检查必要的文件是否存在"""
        print("\n🔍 检查文件...")

        if not self.users_file.exists():
            print(f"❌ 未找到 users.json 文件: {self.users_file}")
            return False

        if not self.user_data_dir.exists():
            print(f"⚠️ 未找到 user_data 目录: {self.user_data_dir}")
            # 可以继续，但可能没有对话数据

        print(f"✅ 找到 users.json: {self.users_file}")
        if self.user_data_dir.exists():
            user_dirs = list(self.user_data_dir.iterdir())
            print(f"✅ 找到 user_data 目录，包含 {len(user_dirs)} 个用户文件夹")

        return True

    def backup_data(self):
        """备份现有数据"""
        print("\n📦 备份数据...")

        try:
            # 备份users.json
            if self.users_file.exists():
                shutil.copy2(self.users_file, self.backup_dir / "users.json")
                print(f"  ✓ 备份 users.json")

            # 备份user_data
            if self.user_data_dir.exists():
                backup_user_data = self.backup_dir / "user_data"
                shutil.copytree(self.user_data_dir, backup_user_data, dirs_exist_ok=True)
                print(f"  ✓ 备份 user_data 目录")

            print(f"✅ 备份完成: {self.backup_dir}")
            return True

        except Exception as e:
            print(f"❌ 备份失败: {e}")
            return False

    def migrate_users(self):
        """迁移用户数据"""
        print("\n👥 迁移用户数据...")

        connection = pymysql.connect(**DB_CONFIG)
        cursor = connection.cursor()

        try:
            with open(self.users_file, 'r', encoding='utf-8') as f:
                users_data = json.load(f)

            # 兼容不同格式
            if isinstance(users_data, dict):
                if 'users' in users_data:
                    users = users_data['users']
                else:
                    users = users_data
            else:
                print("❌ 用户数据格式错误")
                return False

            print(f"  找到 {len(users)} 个用户")

            for username, user_info in users.items():
                try:
                    # 检查用户是否已存在
                    cursor.execute("SELECT user_id FROM users WHERE username = %s", (username,))
                    existing = cursor.fetchone()

                    if existing:
                        print(f"  ⚠️ 用户 {username} 已存在，跳过")
                        self.user_mapping[username] = existing[0]
                        continue

                    # 处理密码
                    if 'password_hash' in user_info:
                        password_hash = user_info['password_hash']
                    elif 'password' in user_info:
                        # 哈希明文密码
                        password_hash = bcrypt.hashpw(
                            user_info['password'].encode('utf-8'),
                            bcrypt.gensalt()
                        ).decode('utf-8')
                    else:
                        # 默认密码
                        password_hash = bcrypt.hashpw(
                            b'ChangeMe123!',
                            bcrypt.gensalt()
                        ).decode('utf-8')

                    # 加密敏感信息
                    email_encrypted = None
                    if user_info.get('email'):
                        email_encrypted = self.cipher.encrypt(
                            user_info['email'].encode()
                        ).decode()

                    phone_encrypted = None
                    if user_info.get('phone'):
                        phone_encrypted = self.cipher.encrypt(
                            user_info['phone'].encode()
                        ).decode()

                    # 处理时间字段
                    created_at = self._parse_datetime(user_info.get('created_at'))
                    last_login = self._parse_datetime(user_info.get('last_login'))

                    # 插入用户
                    cursor.execute("""
                        INSERT INTO users (
                            username, password_hash, display_name, 
                            email_encrypted, phone_encrypted, role,
                            is_active, created_at, last_login, login_count
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        username,
                        password_hash,
                        user_info.get('display_name', username),
                        email_encrypted,
                        phone_encrypted,
                        user_info.get('role', 'student'),
                        user_info.get('is_active', True),
                        created_at,
                        last_login,
                        user_info.get('login_count', 0)
                    ))

                    user_id = cursor.lastrowid
                    self.user_mapping[username] = user_id

                    # 记录密码历史
                    cursor.execute("""
                        INSERT INTO password_history (user_id, password_hash, changed_by)
                        VALUES (%s, %s, %s)
                    """, (user_id, password_hash, 'migration'))

                    # 审计日志
                    cursor.execute("""
                        INSERT INTO audit_logs (
                            event_type, user_id, username, action, status
                        ) VALUES (%s, %s, %s, %s, %s)
                    """, ('USER_MIGRATION', user_id, username, 'migrate_user', 'success'))

                    self.stats['users_migrated'] += 1
                    print(f"  ✓ 用户 {username} 迁移成功 (ID: {user_id})")

                except Exception as e:
                    print(f"  ✗ 用户 {username} 迁移失败: {e}")
                    self.stats['errors'].append(f"User {username}: {str(e)}")
                    cursor.execute("ROLLBACK")
                    continue

            connection.commit()
            print(f"✅ 用户迁移完成: {self.stats['users_migrated']} 个")
            return True

        except Exception as e:
            print(f"❌ 用户迁移失败: {e}")
            connection.rollback()
            return False

        finally:
            cursor.close()
            connection.close()

    def migrate_conversations(self):
        """迁移对话数据"""
        print("\n💬 迁移对话数据...")

        if not self.user_data_dir.exists():
            print("  ⚠️ 没有user_data目录，跳过对话迁移")
            return True

        connection = pymysql.connect(**DB_CONFIG)
        cursor = connection.cursor()

        try:
            for user_dir in self.user_data_dir.iterdir():
                if not user_dir.is_dir():
                    continue

                username = user_dir.name
                conversations_file = user_dir / "conversations.json"

                if not conversations_file.exists():
                    continue

                # 获取用户ID
                if username not in self.user_mapping:
                    cursor.execute("SELECT user_id FROM users WHERE username = %s", (username,))
                    result = cursor.fetchone()
                    if not result:
                        print(f"  ⚠️ 未找到用户 {username}，跳过")
                        continue
                    self.user_mapping[username] = result[0]

                user_id = self.user_mapping[username]

                try:
                    with open(conversations_file, 'r', encoding='utf-8') as f:
                        conversations = json.load(f)

                    print(f"  处理用户 {username} 的 {len(conversations)} 个对话")

                    for conv_id, conv_data in conversations.items():
                        try:
                            # 检查对话是否已存在
                            cursor.execute(
                                "SELECT conversation_id FROM conversations WHERE conversation_id = %s",
                                (conv_id,)
                            )
                            if cursor.fetchone():
                                print(f"    ⚠️ 对话 {conv_id[:8]}... 已存在")
                                continue

                            # 插入对话
                            cursor.execute("""
                                INSERT INTO conversations (
                                    conversation_id, user_id, title, subject_code,
                                    created_at, updated_at, message_count
                                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                            """, (
                                conv_id,
                                user_id,
                                conv_data.get('title', 'Untitled'),
                                conv_data.get('subject', 'general'),
                                self._parse_datetime(conv_data.get('created_at')),
                                self._parse_datetime(conv_data.get('updated_at')),
                                len(conv_data.get('messages', []))
                            ))

                            # 迁移消息
                            for msg in conv_data.get('messages', []):
                                content = msg.get('content', '')

                                # 检查敏感数据
                                content_encrypted = None
                                if self._contains_sensitive_data(content):
                                    content_encrypted = self.cipher.encrypt(
                                        content.encode()
                                    ).decode()
                                    content = "[已加密]"

                                cursor.execute("""
                                    INSERT INTO messages (
                                        conversation_id, role, content, 
                                        content_encrypted, thinking, 
                                        timestamp, model_used
                                    ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                                """, (
                                    conv_id,
                                    msg.get('role', 'user'),
                                    content,
                                    content_encrypted,
                                    msg.get('thinking'),
                                    self._parse_datetime(msg.get('timestamp')),
                                    msg.get('model', 'unknown')
                                ))

                                self.stats['messages_migrated'] += 1

                            self.stats['conversations_migrated'] += 1

                        except Exception as e:
                            print(f"    ✗ 对话 {conv_id[:8]}... 失败: {e}")
                            self.stats['errors'].append(f"Conv {conv_id}: {str(e)}")
                            continue

                    connection.commit()
                    print(f"  ✓ 用户 {username} 的对话迁移完成")

                except Exception as e:
                    print(f"  ✗ 用户 {username} 的对话处理失败: {e}")
                    self.stats['errors'].append(f"User convs {username}: {str(e)}")
                    connection.rollback()

            print(
                f"✅ 对话迁移完成: {self.stats['conversations_migrated']} 个对话, {self.stats['messages_migrated']} 条消息")
            return True

        except Exception as e:
            print(f"❌ 对话迁移失败: {e}")
            return False

        finally:
            cursor.close()
            connection.close()

    def _parse_datetime(self, dt_str):
        """解析日期时间字符串"""
        if not dt_str:
            return None

        try:
            # 尝试ISO格式
            return datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
        except:
            try:
                # 尝试其他格式
                return datetime.strptime(dt_str, '%Y-%m-%d %H:%M:%S')
            except:
                return None

    def _contains_sensitive_data(self, content):
        """检测敏感数据（简化版）"""
        import re

        # 检查email
        if re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', content):
            return True

        # 检查电话号码（简单模式）
        if re.search(r'\b\d{10,15}\b', content):
            return True

        return False

    def verify_migration(self):
        """验证迁移结果"""
        print("\n🔍 验证迁移结果...")

        connection = pymysql.connect(**DB_CONFIG)
        cursor = connection.cursor()

        try:
            # 统计数据
            cursor.execute("SELECT COUNT(*) FROM users")
            user_count = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM conversations")
            conv_count = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM messages")
            msg_count = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM audit_logs")
            audit_count = cursor.fetchone()[0]

            print(f"""
📊 数据库统计:
  • 用户: {user_count}
  • 对话: {conv_count}
  • 消息: {msg_count}
  • 审计日志: {audit_count}
            """)

            # 显示一些样本数据
            cursor.execute("""
                SELECT u.username, u.role, COUNT(c.conversation_id) as conv_count
                FROM users u
                LEFT JOIN conversations c ON u.user_id = c.user_id
                GROUP BY u.user_id
                LIMIT 5
            """)

            results = cursor.fetchall()
            if results:
                print("用户对话统计（前5个）:")
                for username, role, count in results:
                    print(f"  • {username} ({role}): {count} 个对话")

            return True

        except Exception as e:
            print(f"❌ 验证失败: {e}")
            return False

        finally:
            cursor.close()
            connection.close()

    def generate_report(self):
        """生成迁移报告"""
        report = f"""
========================================
        数据迁移报告
        {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
========================================

项目路径: {self.project_path}
备份位置: {self.backup_dir}

迁移统计:
---------
✓ 用户迁移: {self.stats['users_migrated']} 个
✓ 对话迁移: {self.stats['conversations_migrated']} 个  
✓ 消息迁移: {self.stats['messages_migrated']} 条
✗ 错误数量: {len(self.stats['errors'])} 个

"""

        if self.stats['errors']:
            report += "错误详情:\n---------\n"
            for error in self.stats['errors'][:10]:  # 只显示前10个错误
                report += f"• {error}\n"

            if len(self.stats['errors']) > 10:
                report += f"... 还有 {len(self.stats['errors']) - 10} 个错误\n"

        # 保存报告
        report_file = self.backup_dir / "migration_report.txt"
        report_file.write_text(report, encoding='utf-8')

        print(report)
        print(f"📄 报告已保存到: {report_file}")

    def run(self):
        """执行迁移"""
        print("=" * 60)
        print("🚀 开始数据迁移到MySQL")
        print("=" * 60)

        # 1. 检查文件
        if not self.check_files():
            print("❌ 文件检查失败，请确认项目路径")
            return False

        # 2. 备份
        if not self.backup_data():
            print("❌ 备份失败")
            return False

        # 3. 迁移用户
        if not self.migrate_users():
            print("❌ 用户迁移失败")
            return False

        # 4. 迁移对话
        self.migrate_conversations()

        # 5. 验证
        self.verify_migration()

        # 6. 生成报告
        self.generate_report()

        print("\n✅ 迁移完成！")
        return True


def main():
    """主函数"""
    print("MySQL数据迁移工具")
    print("-" * 40)

    # 获取项目路径
    if len(sys.argv) > 1:
        project_path = sys.argv[1]
    else:
        project_path = input("请输入项目路径（包含users.json的目录，直接回车使用当前目录）: ").strip()
        if not project_path:
            project_path = "."

    # 确认操作
    print(f"\n项目路径: {Path(project_path).absolute()}")
    response = input("\n确定要开始迁移吗？(yes/no): ")

    if response.lower() != 'yes':
        print("取消迁移")
        return

    # 执行迁移
    migration = DataMigration(project_path)
    success = migration.run()

    if success:
        print("\n下一步操作:")
        print("1. 检查数据库中的数据")
        print("2. 测试登录功能")
        print("3. 更新应用代码使用MySQL")
    else:
        print("\n迁移有错误，请检查报告")


if __name__ == "__main__":
    main()