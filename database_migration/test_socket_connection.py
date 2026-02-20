# test_socket_connection.py
import pymysql


def test_socket_connection():
    try:
        # macOS上MySQL的socket通常在这个位置
        connection = pymysql.connect(
            unix_socket='/tmp/mysql.sock',  # 或 /var/mysql/mysql.sock
            user='ai_assistant',
            password='SecurePass123!',
            database='school_ai_assistant',
            charset='utf8mb4'
        )
        print("✅ 通过Socket连接成功!")

        with connection.cursor() as cursor:
            cursor.execute("SELECT VERSION()")
            version = cursor.fetchone()
            print(f"数据库版本: {version[0]}")

        connection.close()
        return True

    except Exception as e:
        print(f"❌ Socket连接失败: {e}")
        # 尝试其他常见socket路径
        socket_paths = [
            '/tmp/mysql.sock',
            '/var/mysql/mysql.sock',
            '/var/run/mysqld/mysqld.sock',
            '/usr/local/mysql/mysql.sock'
        ]

        print("\n尝试查找socket文件...")
        for path in socket_paths:
            import os
            if os.path.exists(path):
                print(f"✓ 找到socket文件: {path}")
                # 尝试使用这个socket连接
                try:
                    conn = pymysql.connect(
                        unix_socket=path,
                        user='ai_assistant',
                        password='SecurePass123!',
                        database='school_ai_assistant'
                    )
                    print(f"✅ 使用 {path} 连接成功!")
                    conn.close()
                    return True
                except:
                    continue

        return False


if __name__ == "__main__":
    test_socket_connection()
