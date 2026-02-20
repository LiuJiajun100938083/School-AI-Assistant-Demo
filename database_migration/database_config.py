# database_config.py
import os
from urllib.parse import quote_plus

# MySQL配置 - 修改这里！
DB_HOST = '127.0.0.1'  # 改为127.0.0.1而不是localhost
DB_PORT = 3306
DB_NAME = 'school_ai_assistant'
DB_USER = 'ai_assistant'
DB_PASSWORD = 'SecurePass123!'

# 构建连接URL
DATABASE_URL = f"mysql+pymysql://{DB_USER}:{quote_plus(DB_PASSWORD)}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"

print(f"数据库连接URL已配置: mysql://{DB_USER}:***@{DB_HOST}:{DB_PORT}/{DB_NAME}")