#!/usr/bin/env python3
"""
從 Excel 導入 class_number（班號）到 users 表

數據源：學號+班號對應.xlsx
欄位：ClassName, ClassNumber, UserLogin
匹配：UserLogin → users.username
"""

import os
import sys

import openpyxl
import pymysql

EXCEL_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "Downloads", "學號+班號對應.xlsx")
if not os.path.exists(EXCEL_PATH):
    EXCEL_PATH = "/Users/liujiajun/Downloads/學號+班號對應.xlsx"

DB_CONFIG = {
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "password": "",
    "database": "school_ai_assistant",
    "charset": "utf8mb4",
}


def main():
    # 讀取 Excel
    wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True)
    ws = wb.active

    rows = []
    header = [cell.value for cell in next(ws.iter_rows(min_row=1, max_row=1))]
    col_map = {h: i for i, h in enumerate(header)}

    for row in ws.iter_rows(min_row=2, values_only=True):
        class_name = str(row[col_map["ClassName"]]).strip() if row[col_map["ClassName"]] else ""
        class_number = row[col_map["ClassNumber"]]
        user_login = str(row[col_map["UserLogin"]]).strip() if row[col_map["UserLogin"]] else ""
        if user_login:
            rows.append((class_name, int(class_number) if class_number else None, user_login))

    wb.close()
    print(f"Excel 讀取完成：{len(rows)} 行數據")

    # 連接數據庫並更新
    conn = pymysql.connect(**DB_CONFIG)
    cursor = conn.cursor()

    matched = 0
    not_found = []

    for class_name, class_number, username in rows:
        cursor.execute(
            "UPDATE users SET class_name = %s, class_number = %s WHERE username = %s",
            (class_name, class_number, username),
        )
        if cursor.rowcount > 0:
            matched += 1
        else:
            not_found.append(username)

    conn.commit()
    cursor.close()
    conn.close()

    print(f"\n匹配更新：{matched} 筆")
    print(f"未匹配（用戶不存在）：{len(not_found)} 筆")
    if not_found and len(not_found) <= 20:
        for u in not_found:
            print(f"  - {u}")
    elif not_found:
        print(f"  前 20 筆：{not_found[:20]}")
        print(f"  ...共 {len(not_found)} 筆")


if __name__ == "__main__":
    main()
