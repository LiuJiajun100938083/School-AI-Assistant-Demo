# test_connection.py
import pymysql
from database_config import DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT


def test_mysql_connection():
    try:
        # 建立连接 - 使用127.0.0.1
        connection = pymysql.connect(
            host='127.0.0.1',  # 明确使用127.0.0.1
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            charset='utf8mb4'
        )
        print("✅ MySQL连接成功!")

        with connection.cursor() as cursor:
            cursor.execute("SELECT VERSION()")
            version = cursor.fetchone()
            print(f"数据库版本: {version[0]}")

            cursor.execute("SELECT DATABASE()")
            db = cursor.fetchone()
            print(f"当前数据库: {db[0]}")

            # 测试创建表的权限
            cursor.execute("SHOW TABLES")
            tables = cursor.fetchall()
            print(f"现有表数量: {len(tables)}")

        connection.close()
        return True

    except Exception as e:
        print(f"❌ 连接失败: {e}")
        return False


if __name__ == "__main__":
    test_mysql_connection()