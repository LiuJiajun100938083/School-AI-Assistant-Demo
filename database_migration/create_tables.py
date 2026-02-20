#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
create_tables.py - 创建MySQL数据库表结构
"""

import pymysql
from datetime import datetime

# 数据库连接配置
DB_CONFIG = {
    'host': '127.0.0.1',
    'port': 3306,
    'user': 'ai_assistant',
    'password': 'SecurePass123!',
    'database': 'school_ai_assistant',
    'charset': 'utf8mb4'
}


def create_tables():
    """创建所有必要的数据库表"""

    connection = pymysql.connect(**DB_CONFIG)
    cursor = connection.cursor()

    try:
        print("🔨 开始创建数据库表...")

        # 1. 用户表
        print("  创建 users 表...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                display_name VARCHAR(100),
                email VARCHAR(100),
                email_encrypted TEXT,
                phone VARCHAR(20),
                phone_encrypted TEXT,
                role ENUM('student', 'teacher', 'admin') DEFAULT 'student',
                class_id INT,
                is_active BOOLEAN DEFAULT TRUE,
                is_locked BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                last_login TIMESTAMP NULL,
                login_count INT DEFAULT 0,
                password_changed_at TIMESTAMP NULL,
                must_change_password BOOLEAN DEFAULT FALSE,
                data_consent BOOLEAN DEFAULT FALSE,
                data_consent_date TIMESTAMP NULL,
                INDEX idx_username (username),
                INDEX idx_role (role)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        # 2. 班级表
        print("  创建 classes 表...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS classes (
                class_id INT AUTO_INCREMENT PRIMARY KEY,
                class_code VARCHAR(20) UNIQUE NOT NULL,
                class_name VARCHAR(100) NOT NULL,
                grade VARCHAR(20),
                teacher_id INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (teacher_id) REFERENCES users(user_id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        # 添加外键到users表
        cursor.execute("""
            ALTER TABLE users 
            ADD CONSTRAINT fk_user_class 
            FOREIGN KEY (class_id) REFERENCES classes(class_id) ON DELETE SET NULL
        """)

        # 3. 对话表
        print("  创建 conversations 表...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                conversation_id VARCHAR(36) PRIMARY KEY,
                user_id INT NOT NULL,
                title VARCHAR(200),
                subject_code VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                message_count INT DEFAULT 0,
                is_archived BOOLEAN DEFAULT FALSE,
                is_deleted BOOLEAN DEFAULT FALSE,
                deleted_at TIMESTAMP NULL,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                INDEX idx_user_conversations (user_id, updated_at),
                INDEX idx_subject (subject_code)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        # 4. 消息表
        print("  创建 messages 表...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                message_id INT AUTO_INCREMENT PRIMARY KEY,
                conversation_id VARCHAR(36) NOT NULL,
                role ENUM('user', 'assistant', 'system') NOT NULL,
                content TEXT NOT NULL,
                content_encrypted TEXT,
                thinking TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                token_count INT,
                model_used VARCHAR(50),
                is_flagged BOOLEAN DEFAULT FALSE,
                FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
                INDEX idx_conversation_messages (conversation_id, timestamp)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        # 5. 审计日志表
        print("  创建 audit_logs 表...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                log_id INT AUTO_INCREMENT PRIMARY KEY,
                event_type VARCHAR(50) NOT NULL,
                user_id INT,
                username VARCHAR(50),
                ip_address VARCHAR(45),
                user_agent VARCHAR(255),
                action VARCHAR(100) NOT NULL,
                resource_type VARCHAR(50),
                resource_id VARCHAR(100),
                details JSON,
                status ENUM('success', 'failure', 'warning'),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
                INDEX idx_audit_timestamp (timestamp),
                INDEX idx_audit_user (user_id),
                INDEX idx_audit_event (event_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        # 6. 密码历史表
        print("  创建 password_history 表...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS password_history (
                history_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                changed_by VARCHAR(50),
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                INDEX idx_password_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        # 7. 会话表
        print("  创建 sessions 表...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                session_id VARCHAR(255) PRIMARY KEY,
                user_id INT NOT NULL,
                token_hash VARCHAR(255) NOT NULL,
                ip_address VARCHAR(45),
                user_agent VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                INDEX idx_session_user (user_id),
                INDEX idx_session_expires (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        # 8. 学习分析表（匿名化）
        print("  创建 learning_analytics 表...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS learning_analytics (
                analytics_id INT AUTO_INCREMENT PRIMARY KEY,
                user_hash VARCHAR(64) NOT NULL,
                subject_code VARCHAR(50),
                session_date DATE,
                metrics JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_analytics_date (session_date),
                INDEX idx_analytics_subject (subject_code)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        # 9. 数据访问日志（GDPR合规）
        print("  创建 data_access_logs 表...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS data_access_logs (
                access_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                accessed_user_id INT,
                access_type ENUM('read', 'write', 'delete') NOT NULL,
                data_category VARCHAR(50),
                purpose VARCHAR(200),
                legal_basis VARCHAR(100),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id),
                FOREIGN KEY (accessed_user_id) REFERENCES users(user_id),
                INDEX idx_access_user (user_id),
                INDEX idx_access_timestamp (timestamp)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        # 10. 数据删除请求表（GDPR Article 17）
        print("  创建 deletion_requests 表...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS deletion_requests (
                request_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                reason TEXT,
                status ENUM('pending', 'approved', 'completed', 'rejected') DEFAULT 'pending',
                processed_date TIMESTAMP NULL,
                processed_by INT,
                notes TEXT,
                FOREIGN KEY (user_id) REFERENCES users(user_id),
                FOREIGN KEY (processed_by) REFERENCES users(user_id),
                INDEX idx_deletion_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        connection.commit()
        print("✅ 所有表创建成功！")

        # 显示创建的表
        cursor.execute("SHOW TABLES")
        tables = cursor.fetchall()
        print(f"\n📊 数据库中的表（共 {len(tables)} 个）：")
        for table in tables:
            cursor.execute(f"SELECT COUNT(*) FROM {table[0]}")
            count = cursor.fetchone()[0]
            print(f"  - {table[0]}: {count} 条记录")

        return True

    except Exception as e:
        print(f"❌ 创建表时出错: {e}")
        connection.rollback()
        return False

    finally:
        cursor.close()
        connection.close()


def drop_all_tables():
    """删除所有表（危险操作，仅用于开发）"""
    response = input("⚠️ 警告：这将删除所有表和数据！确定吗？(yes/no): ")
    if response.lower() != 'yes':
        print("取消操作")
        return

    connection = pymysql.connect(**DB_CONFIG)
    cursor = connection.cursor()

    try:
        # 禁用外键检查
        cursor.execute("SET FOREIGN_KEY_CHECKS = 0")

        # 获取所有表
        cursor.execute("SHOW TABLES")
        tables = cursor.fetchall()

        # 删除所有表
        for table in tables:
            print(f"删除表: {table[0]}")
            cursor.execute(f"DROP TABLE IF EXISTS {table[0]}")

        # 重新启用外键检查
        cursor.execute("SET FOREIGN_KEY_CHECKS = 1")

        connection.commit()
        print("✅ 所有表已删除")

    except Exception as e:
        print(f"❌ 删除表时出错: {e}")
        connection.rollback()

    finally:
        cursor.close()
        connection.close()


def check_database_status():
    """检查数据库状态"""
    connection = pymysql.connect(**DB_CONFIG)
    cursor = connection.cursor()

    try:
        print("\n🔍 数据库状态检查")
        print("=" * 50)

        # 检查数据库版本
        cursor.execute("SELECT VERSION()")
        version = cursor.fetchone()[0]
        print(f"MySQL版本: {version}")

        # 检查数据库名称
        cursor.execute("SELECT DATABASE()")
        db = cursor.fetchone()[0]
        print(f"当前数据库: {db}")

        # 检查字符集
        cursor.execute("SHOW VARIABLES LIKE 'character_set_database'")
        charset = cursor.fetchone()
        print(f"字符集: {charset[1]}")

        # 检查排序规则
        cursor.execute("SHOW VARIABLES LIKE 'collation_database'")
        collation = cursor.fetchone()
        print(f"排序规则: {collation[1]}")

        # 检查表数量
        cursor.execute("SHOW TABLES")
        tables = cursor.fetchall()
        print(f"表数量: {len(tables)}")

        if tables:
            print("\n表详情:")
            for table in tables:
                cursor.execute(f"""
                    SELECT COUNT(*) as count,
                           (SELECT COUNT(*) FROM information_schema.COLUMNS 
                            WHERE TABLE_SCHEMA = DATABASE() 
                            AND TABLE_NAME = '{table[0]}') as columns
                    FROM {table[0]}
                """)
                result = cursor.fetchone()
                print(f"  - {table[0]}: {result[1]} 列, {result[0]} 行")

        print("=" * 50)

    except Exception as e:
        print(f"❌ 检查状态时出错: {e}")

    finally:
        cursor.close()
        connection.close()


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        if sys.argv[1] == 'drop':
            drop_all_tables()
        elif sys.argv[1] == 'status':
            check_database_status()
        else:
            print(f"未知命令: {sys.argv[1]}")
            print("可用命令: drop, status")
    else:
        # 默认创建表
        success = create_tables()
        if success:
            check_database_status()