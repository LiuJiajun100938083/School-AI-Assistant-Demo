# attendance_api.py - 早读和留堂点名系统 API
"""
早读和留堂点名系统
- 支持CSV导入学生数据
- 拍卡签到（CardID识别）
- 早读/留堂名单管理
- 固定早读名单保存
- 导出Excel（带颜色标记）
- 留堂历史记录
"""

import csv
import io
import logging
import os
import uuid
from urllib.parse import quote
from datetime import datetime, time, timedelta
from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
import pymysql

# Excel导出
try:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    EXCEL_AVAILABLE = True
except ImportError:
    EXCEL_AVAILABLE = False
    print("⚠️ openpyxl未安装，Excel导出功能不可用")

from app.core.dependencies import verify_token, require_teacher_or_admin as verify_admin_or_teacher
from app.bridge import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/attendance", tags=["点名系统"])


# ============ 认证（支持URL token） ============

async def verify_token_from_query_or_header(
        token: str = Query(None),
        credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer(auto_error=False))
):
    """支持从URL参数或Header获取token的认证（用于导出等 window.open 场景）"""
    # 使用 bridge 模块的兼容层
    from app.bridge import decode_jwt_token

    # 优先从URL参数获取token
    actual_token = token
    if not actual_token and credentials:
        actual_token = credentials.credentials

    if not actual_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = decode_jwt_token(actual_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    username = payload.get("username")
    role = payload.get("role")

    if not username:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    if role not in ['admin', 'teacher']:
        raise HTTPException(status_code=403, detail="Admin or teacher privileges required")

    return username, role


# ============ 数据模型 ============

class ActivitySessionRequest(BaseModel):
    """课外活动会话请求"""
    session_date: str  # YYYY-MM-DD
    activity_name: str
    start_time: str  # HH:MM
    end_time: str  # HH:MM
    late_threshold: int = 10  # 迟到阈值(分钟)
    early_threshold: int = 10  # 早退阈值(分钟)
    student_ids: List[str]


class ActivityScanRequest(BaseModel):
    """课外活动扫描请求"""
    session_id: int
    card_id: str


class ActivityCheckoutRequest(BaseModel):
    """课外活动签退请求"""
    session_id: int
    user_login: str


class ActivityGroupRequest(BaseModel):
    """课外活动固定组别请求"""
    name: str
    student_ids: List[str]


class StudentInfo(BaseModel):
    """学生信息"""
    class_name: str
    class_number: int
    user_login: str
    english_name: str
    chinese_name: str
    card_id: str


class AttendanceSession(BaseModel):
    """点名会话"""
    session_type: str  # 'morning' 或 'detention'
    session_date: str  # YYYY-MM-DD
    student_ids: List[str]  # UserLogin列表
    notes: Optional[str] = None
    open_mode: Optional[bool] = False  # 是否为开放点名模式


class CardScanRequest(BaseModel):
    """拍卡请求"""
    session_id: int
    card_id: str


class ManualScanRequest(BaseModel):
    """手动签到请求（忘带卡）"""
    session_id: int
    user_login: str  # 使用user_login而不是card_id


class DetentionCheckinRequest(BaseModel):
    """留堂签到请求"""
    session_id: int
    card_id: str
    planned_periods: Optional[int] = None  # 1, 2, 或 3（与planned_minutes二选一）
    planned_minutes: Optional[int] = None  # 自定义分钟数（与planned_periods二选一）
    detention_reason: Optional[str] = None  # 留堂原因: homework/morning/其他


class DetentionManualCheckinRequest(BaseModel):
    """留堂手动签到请求"""
    session_id: int
    user_login: str
    planned_periods: Optional[int] = None  # 1, 2, 或 3（与planned_minutes二选一）
    planned_minutes: Optional[int] = None  # 自定义分钟数（与planned_periods二选一）
    detention_reason: Optional[str] = None  # 留堂原因: homework/morning/其他


class ModifyPeriodsRequest(BaseModel):
    """修改节数/分钟数请求"""
    session_id: int
    user_login: str
    new_periods: Optional[int] = None  # 1, 2, 或 3（与new_minutes二选一）
    new_minutes: Optional[int] = None  # 自定义分钟数（与new_periods二选一）


# 新增 修改结束时间请求模型
class ModifyEndTimeRequest(BaseModel):
    """修改结束时间请求"""
    session_id: int
    user_login: str
    new_end_time: str  # 格式 HH:MM


class FixedListRequest(BaseModel):
    """固定名单请求"""
    list_name: str
    student_ids: List[str]
    list_type: str = 'morning'  # 'morning' 或 'detention'


# ============ 数据库初始化 ============

def init_attendance_tables():
    """初始化点名系统数据库表"""
    with get_db() as db:
        cursor = db.cursor()

        # 1. 学生信息表（从CSV导入）
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS attendance_students (
                id INT AUTO_INCREMENT PRIMARY KEY,
                class_name VARCHAR(10) NOT NULL COMMENT '班级 如1A, 2B',
                class_number INT NOT NULL COMMENT '班号',
                user_login VARCHAR(50) NOT NULL UNIQUE COMMENT '学号，唯一标识',
                english_name VARCHAR(100) NOT NULL COMMENT '英文名',
                chinese_name VARCHAR(100) NOT NULL COMMENT '中文名',
                card_id VARCHAR(50) COMMENT '学生证CardID',
                is_active BOOLEAN DEFAULT TRUE COMMENT '是否在籍',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_class (class_name),
                INDEX idx_card (card_id),
                INDEX idx_user_login (user_login)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='点名系统学生信息表'
        """)

        # 2. 点名会话表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS attendance_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                session_type ENUM('morning', 'detention') NOT NULL COMMENT '早读或留堂',
                session_date DATE NOT NULL COMMENT '点名日期',
                start_time TIME COMMENT '开始时间',
                end_time TIME COMMENT '结束时间',
                target_time TIME NOT NULL DEFAULT '07:30:00' COMMENT '应到时间（早读默认7:30）',
                late_threshold TIME NOT NULL DEFAULT '07:40:00' COMMENT '严重迟到阈值',
                makeup_minutes INT DEFAULT 35 COMMENT '严重迟到需补时间（分钟）',
                status ENUM('active', 'completed', 'cancelled') DEFAULT 'active',
                created_by VARCHAR(50) COMMENT '创建者',
                notes TEXT COMMENT '备注',
                open_mode BOOLEAN DEFAULT FALSE COMMENT '开放点名模式',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_date (session_date),
                INDEX idx_type (session_type),
                INDEX idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='点名会话表'
        """)

        # 3. 点名会话-学生关联表（被选中参加的学生）
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS attendance_session_students (
                id INT AUTO_INCREMENT PRIMARY KEY,
                session_id INT NOT NULL,
                user_login VARCHAR(50) NOT NULL COMMENT '学号',
                added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
                UNIQUE KEY unique_session_student (session_id, user_login),
                INDEX idx_session (session_id),
                INDEX idx_student (user_login)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='点名会话学生关联表'
        """)

        # 4. 点名记录表（兼容早读 + 留堂，含非登记标记与留堂专用字段）
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS attendance_records (
                id INT AUTO_INCREMENT PRIMARY KEY,
                session_id INT NOT NULL,
                user_login VARCHAR(50) NOT NULL COMMENT '学号',
                card_id VARCHAR(50) COMMENT '拍卡的CardID',
                scan_time DATETIME NOT NULL COMMENT '签到时间（第一次拍卡）',
                checkout_time DATETIME COMMENT '签退时间（第二次拍卡，留堂用）',

                status ENUM(
                    'present', 'late', 'very_late', 'absent',
                    'detention_active', 'detention_completed'
                ) NOT NULL COMMENT '状态',

                late_minutes INT DEFAULT 0 COMMENT '迟到分钟数',
                makeup_minutes INT DEFAULT 0 COMMENT '需补时间（分钟）',

                is_registered BOOLEAN DEFAULT TRUE COMMENT '是否为登记学生',

                -- 留堂专用字段
                planned_periods INT DEFAULT 0 COMMENT '计划留堂节数(1/2/3)',
                planned_end_time DATETIME COMMENT '计划结束时间',
                actual_minutes INT DEFAULT 0 COMMENT '实际留堂分钟数',
                actual_periods INT DEFAULT 0 COMMENT '实际完成节数',

                notes TEXT COMMENT '备注',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

                FOREIGN KEY (session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
                UNIQUE KEY unique_session_record (session_id, user_login),
                INDEX idx_session (session_id),
                INDEX idx_student (user_login),
                INDEX idx_scan_time (scan_time)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='点名记录表'
        """)

        # 4b. 兼容旧数据库：升级 attendance_records 表结构（留堂字段/状态/更新时间）
        # 说明：CREATE TABLE IF NOT EXISTS 不会修改已存在的表，因此这里做一次 best-effort 的结构升级。
        alter_sqls = [
            "ALTER TABLE attendance_sessions ADD COLUMN open_mode BOOLEAN DEFAULT FALSE COMMENT '开放点名模式' AFTER notes",
            "ALTER TABLE attendance_records ADD COLUMN checkout_time DATETIME NULL COMMENT '签退时间（第二次拍卡，留堂用）' AFTER scan_time",
            "ALTER TABLE attendance_records ADD COLUMN planned_periods INT DEFAULT 0 COMMENT '计划留堂节数(1/2/3)' AFTER is_registered",
            "ALTER TABLE attendance_records ADD COLUMN planned_end_time DATETIME NULL COMMENT '计划结束时间' AFTER planned_periods",
            "ALTER TABLE attendance_records ADD COLUMN actual_minutes INT DEFAULT 0 COMMENT '实际留堂分钟数' AFTER planned_end_time",
            "ALTER TABLE attendance_records ADD COLUMN actual_periods INT DEFAULT 0 COMMENT '实际完成节数' AFTER actual_minutes",
            "ALTER TABLE attendance_records ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
            "ALTER TABLE attendance_records MODIFY COLUMN status ENUM('present','late','very_late','absent','detention_active','detention_completed') NOT NULL COMMENT '状态'",
            "ALTER TABLE attendance_records ADD COLUMN detention_reason VARCHAR(50) NULL COMMENT '留堂原因(homework/morning等)' AFTER actual_periods",
            "ALTER TABLE attendance_records ADD COLUMN planned_minutes INT DEFAULT NULL COMMENT '计划留堂分钟数(自定义分钟模式)' AFTER planned_periods",
        ]
        for sql in alter_sqls:
            try:
                cursor.execute(sql)
            except Exception:
                # 列已存在 / 版本不支持 / 其他兼容性问题：忽略并继续
                pass

        # 5. 固定名单表（用于保存常用的早读名单）
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS attendance_fixed_lists (
                id INT AUTO_INCREMENT PRIMARY KEY,
                list_name VARCHAR(100) NOT NULL COMMENT '名单名称',
                list_type ENUM('morning', 'detention') DEFAULT 'morning' COMMENT '名单类型',
                created_by VARCHAR(50) COMMENT '创建者',
                is_default BOOLEAN DEFAULT FALSE COMMENT '是否为默认名单',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_list_name (list_name, list_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='固定名单表'
        """)

        # 6. 固定名单-学生关联表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS attendance_fixed_list_students (
                id INT AUTO_INCREMENT PRIMARY KEY,
                list_id INT NOT NULL,
                user_login VARCHAR(50) NOT NULL COMMENT '学号',
                added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (list_id) REFERENCES attendance_fixed_lists(id) ON DELETE CASCADE,
                UNIQUE KEY unique_list_student (list_id, user_login),
                INDEX idx_list (list_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='固定名单学生关联表'
        """)

        # 7. 留堂历史记录表（按学号追踪）
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS detention_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_login VARCHAR(50) NOT NULL COMMENT '学号',
                session_id INT COMMENT '关联的点名会话',
                detention_date DATE NOT NULL COMMENT '留堂日期',
                reason TEXT COMMENT '留堂原因',
                duration_minutes INT DEFAULT 35 COMMENT '留堂时长（分钟）',
                completed BOOLEAN DEFAULT FALSE COMMENT '是否完成',
                completed_at DATETIME COMMENT '完成时间',
                created_by VARCHAR(50) COMMENT '创建者',
                notes TEXT COMMENT '备注',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user (user_login),
                INDEX idx_date (detention_date),
                INDEX idx_completed (completed)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='留堂历史记录表'
        """)

        # 8. 点名导出记录表（保存到服务器的导出历史）
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS attendance_exports (
                id INT AUTO_INCREMENT PRIMARY KEY,
                session_id INT NOT NULL COMMENT '关联的点名会话ID',
                session_type ENUM('morning', 'detention') NOT NULL COMMENT '早读或留堂',
                session_date DATE NOT NULL COMMENT '点名日期',

                created_by VARCHAR(50) NOT NULL COMMENT '创建者用户名/学号',
                created_by_name VARCHAR(100) COMMENT '创建者显示名',

                file_name VARCHAR(255) NOT NULL COMMENT '显示文件名',
                file_path VARCHAR(500) NOT NULL COMMENT '服务器文件路径',
                file_size BIGINT DEFAULT 0 COMMENT '文件大小（字节）',

                student_count INT DEFAULT 0 COMMENT '应到人数',
                present_count INT DEFAULT 0 COMMENT '到场人数',
                late_count INT DEFAULT 0 COMMENT '迟到人数（早读）',
                absent_count INT DEFAULT 0 COMMENT '缺席人数',

                notes TEXT COMMENT '备注',

                is_deleted BOOLEAN DEFAULT FALSE COMMENT '是否已删除（软删除）',
                deleted_at DATETIME NULL COMMENT '删除时间',

                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

                INDEX idx_created_by (created_by),
                INDEX idx_session (session_id),
                INDEX idx_date (session_date),
                INDEX idx_type (session_type),
                INDEX idx_deleted (is_deleted)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='点名导出记录表'
        """)

        # 9. 课外活动固定组别表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS activity_groups (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL COMMENT '组别名称',
                created_by VARCHAR(50) COMMENT '创建者',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_group_name (name)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='课外活动固定组别表'
        """)

        # 10. 课外活动组别-学生关联表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS activity_group_students (
                id INT AUTO_INCREMENT PRIMARY KEY,
                group_id INT NOT NULL,
                user_login VARCHAR(50) NOT NULL COMMENT '学号',
                added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES activity_groups(id) ON DELETE CASCADE,
                UNIQUE KEY unique_group_student (group_id, user_login),
                INDEX idx_group (group_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='课外活动组别学生关联表'
        """)

        # 11. 课外活动会话表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS activity_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                session_date DATE NOT NULL COMMENT '活动日期',
                activity_name VARCHAR(200) NOT NULL COMMENT '活动名称',
                start_time TIME NOT NULL COMMENT '应到时间',
                end_time TIME NOT NULL COMMENT '结束时间',
                late_threshold INT DEFAULT 10 COMMENT '迟到阈值(分钟)',
                early_threshold INT DEFAULT 10 COMMENT '早退阈值(分钟)',
                status ENUM('active', 'completed', 'cancelled') DEFAULT 'active',
                created_by VARCHAR(50) COMMENT '创建者',
                notes TEXT COMMENT '备注',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_date (session_date),
                INDEX idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='课外活动会话表'
        """)

        # 12. 课外活动会话-学生关联表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS activity_session_students (
                id INT AUTO_INCREMENT PRIMARY KEY,
                session_id INT NOT NULL,
                user_login VARCHAR(50) NOT NULL COMMENT '学号',
                added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES activity_sessions(id) ON DELETE CASCADE,
                UNIQUE KEY unique_session_student (session_id, user_login),
                INDEX idx_session (session_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='课外活动会话学生关联表'
        """)

        # 13. 课外活动签到记录表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS activity_records (
                id INT AUTO_INCREMENT PRIMARY KEY,
                session_id INT NOT NULL,
                user_login VARCHAR(50) NOT NULL COMMENT '学号',
                card_id VARCHAR(50) COMMENT '拍卡的CardID',

                check_in_time DATETIME COMMENT '签到时间',
                check_in_status ENUM('on_time', 'late', 'not_arrived') DEFAULT 'not_arrived' COMMENT '签到状态',

                check_out_time DATETIME COMMENT '签退时间',
                check_out_status ENUM('normal', 'early', 'not_arrived', 'still_here') DEFAULT 'not_arrived' COMMENT '签退状态',

                late_minutes INT DEFAULT 0 COMMENT '迟到分钟数',
                early_minutes INT DEFAULT 0 COMMENT '早退分钟数',

                notes TEXT COMMENT '备注',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

                FOREIGN KEY (session_id) REFERENCES activity_sessions(id) ON DELETE CASCADE,
                UNIQUE KEY unique_session_record (session_id, user_login),
                INDEX idx_session (session_id),
                INDEX idx_student (user_login)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='课外活动签到记录表'
        """)

        db.commit()
        logger.info("✅ 点名系统数据库表初始化完成")


def format_remaining_time(seconds: float) -> str:
    """格式化剩余时间"""
    if seconds <= 0:
        return "已超时"
    minutes = int(seconds / 60)
    secs = int(seconds % 60)
    if minutes > 0:
        return f"{minutes}分{secs}秒"
    return f"{secs}秒"


# ============ API 端点 ============

@router.on_event("startup")
async def startup_init_tables():
    """启动时初始化表"""
    try:
        init_attendance_tables()
    except Exception as e:
        logger.error(f"初始化点名表失败: {e}")


@router.post("/init-tables")
async def api_init_tables(user_info=Depends(verify_admin_or_teacher)):
    """手动初始化数据库表"""
    try:
        init_attendance_tables()
        return {"success": True, "message": "数据库表初始化成功"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"初始化失败: {str(e)}")


# ---------- 学生管理 ----------

@router.post("/upload-students")
async def upload_students_csv(
        file: UploadFile = File(...),
        user_info=Depends(verify_admin_or_teacher)
):
    """
    上传CSV或Excel文件导入学生数据
    支持格式: .csv (逗号或Tab分隔), .xlsx
    列名: ClassName, ClassNumber, UserLogin, EnglishName, ChineseName, CardID
    """
    filename = file.filename.lower()
    if not (filename.endswith('.csv') or filename.endswith('.xlsx') or filename.endswith('.xls')):
        raise HTTPException(status_code=400, detail="请上传 CSV 或 Excel (.xlsx) 文件")

    try:
        content = await file.read()
        students = []

        # 处理 Excel 文件
        if filename.endswith('.xlsx') or filename.endswith('.xls'):
            try:
                import openpyxl
                from io import BytesIO

                wb = openpyxl.load_workbook(BytesIO(content), data_only=True)
                ws = wb.active

                # 获取表头
                headers = [cell.value for cell in ws[1]]
                header_map = {}
                for i, h in enumerate(headers):
                    if h:
                        h_lower = str(h).lower().strip()
                        if 'classname' in h_lower or h == '班级':
                            header_map['class_name'] = i
                        elif 'classnumber' in h_lower or h == '班号':
                            header_map['class_number'] = i
                        elif 'userlogin' in h_lower or h == '学号':
                            header_map['user_login'] = i
                        elif 'englishname' in h_lower or h == '英文名':
                            header_map['english_name'] = i
                        elif 'chinesename' in h_lower or h == '中文名':
                            header_map['chinese_name'] = i
                        elif 'cardid' in h_lower or h == '卡号':
                            header_map['card_id'] = i

                # 读取数据行
                for row in ws.iter_rows(min_row=2, values_only=True):
                    if not any(row):
                        continue

                    user_login = str(row[header_map.get('user_login', 2)] or '').strip()
                    if user_login:
                        class_number_val = row[header_map.get('class_number', 1)] or 0
                        students.append({
                            'class_name': str(row[header_map.get('class_name', 0)] or '').strip(),
                            'class_number': int(class_number_val) if str(class_number_val).isdigit() else 0,
                            'user_login': user_login,
                            'english_name': str(row[header_map.get('english_name', 3)] or '').strip(),
                            'chinese_name': str(row[header_map.get('chinese_name', 4)] or '').strip(),
                            'card_id': str(row[header_map.get('card_id', 5)] or '').strip() or None
                        })

            except ImportError:
                raise HTTPException(status_code=400, detail="服务器未安装 openpyxl，无法处理 Excel 文件，请上传 CSV")
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Excel 文件解析失败: {str(e)}")

        # 处理 CSV 文件
        else:
            # 尝试多种编码
            text = None
            for encoding in ['utf-8', 'utf-8-sig', 'gbk', 'gb2312', 'big5', 'cp1252']:
                try:
                    text = content.decode(encoding)
                    break
                except UnicodeDecodeError:
                    continue

            if text is None:
                raise HTTPException(status_code=400, detail="无法识别文件编码，请将文件另存为 UTF-8 编码")

            # 自动检测分隔符
            first_line = text.split('\n')[0]
            if '\t' in first_line:
                delimiter = '\t'
            elif ',' in first_line:
                delimiter = ','
            elif ';' in first_line:
                delimiter = ';'
            else:
                delimiter = ','

            # 解析CSV
            reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)

            for row in reader:
                class_name = row.get('ClassName', row.get('班级', '')).strip()
                class_number = row.get('ClassNumber', row.get('班号', '0')).strip()
                user_login = row.get('UserLogin', row.get('学号', '')).strip()
                english_name = row.get('EnglishName', row.get('英文名', '')).strip()
                chinese_name = row.get('ChineseName', row.get('中文名', '')).strip()
                card_id = row.get('CardID', row.get('卡号', '')).strip()

                if user_login:
                    students.append({
                        'class_name': class_name,
                        'class_number': int(class_number) if class_number.isdigit() else 0,
                        'user_login': user_login,
                        'english_name': english_name,
                        'chinese_name': chinese_name,
                        'card_id': card_id if card_id else None
                    })

        if not students:
            raise HTTPException(status_code=400, detail="文件中没有有效的学生数据")

        # 写入数据库
        with get_db() as db:
            cursor = db.cursor()
            cursor.execute("UPDATE attendance_students SET is_active = FALSE")

            for student in students:
                cursor.execute("""
                    INSERT INTO attendance_students 
                    (class_name, class_number, user_login, english_name, chinese_name, card_id, is_active)
                    VALUES (%s, %s, %s, %s, %s, %s, TRUE)
                    ON DUPLICATE KEY UPDATE
                    class_name = VALUES(class_name),
                    class_number = VALUES(class_number),
                    english_name = VALUES(english_name),
                    chinese_name = VALUES(chinese_name),
                    card_id = VALUES(card_id),
                    is_active = TRUE,
                    updated_at = CURRENT_TIMESTAMP
                """, (
                    student['class_name'],
                    student['class_number'],
                    student['user_login'],
                    student['english_name'],
                    student['chinese_name'],
                    student['card_id']
                ))

            db.commit()

        return {
            "success": True,
            "message": f"成功导入 {len(students)} 名学生",
            "count": len(students)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"上传学生数据失败: {e}")
        raise HTTPException(status_code=500, detail=f"导入失败: {str(e)}")


@router.get("/students")
async def get_students(
        class_name: Optional[str] = None,
        search: Optional[str] = None,
        user_info=Depends(verify_admin_or_teacher)
):
    """获取学生列表，支持按班级筛选和搜索"""
    with get_db() as db:
        cursor = db.cursor(pymysql.cursors.DictCursor)

        sql = """
            SELECT id, class_name, class_number, user_login, 
                   english_name, chinese_name, card_id
            FROM attendance_students 
            WHERE is_active = TRUE
        """
        params = []

        if class_name:
            sql += " AND class_name = %s"
            params.append(class_name)

        if search:
            sql += " AND (english_name LIKE %s OR chinese_name LIKE %s OR user_login LIKE %s)"
            search_pattern = f"%{search}%"
            params.extend([search_pattern, search_pattern, search_pattern])

        sql += " ORDER BY class_name, class_number"

        cursor.execute(sql, params)
        students = cursor.fetchall()

        return {"success": True, "students": students}


@router.get("/classes")
async def get_classes(user_info=Depends(verify_admin_or_teacher)):
    """获取所有班级列表"""
    with get_db() as db:
        cursor = db.cursor()
        cursor.execute("""
            SELECT DISTINCT class_name 
            FROM attendance_students 
            WHERE is_active = TRUE 
            ORDER BY class_name
        """)
        results = cursor.fetchall()
        # 兼容 DictCursor 和普通 cursor
        if results and isinstance(results[0], dict):
            classes = [row['class_name'] for row in results]
        else:
            classes = [row[0] for row in results]

        return {"success": True, "classes": classes}


# ---------- 点名会话管理 ----------

@router.post("/sessions")
async def create_session(
        session: AttendanceSession,
        user_info=Depends(verify_admin_or_teacher)
):
    """创建点名会话（早读或留堂）"""
    try:
        with get_db() as db:
            cursor = db.cursor()

            # 设置默认时间
            if session.session_type == 'morning':
                target_time = '07:30:00'
                late_threshold = '07:40:00'
            else:
                target_time = '15:30:00'
                late_threshold = '15:45:00'

            # 创建会话（注意：这里不能缩进到 else 里面！）
            cursor.execute("""
                INSERT INTO attendance_sessions 
                (session_type, session_date, target_time, late_threshold, created_by, notes, start_time, open_mode)
                VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIME(), %s)
            """, (
                session.session_type,
                session.session_date,
                target_time,
                late_threshold,
                user_info[0],
                session.notes,
                session.open_mode or False
            ))

            # 获取新插入的会话ID（兼容 DictCursor）
            cursor.execute("SELECT LAST_INSERT_ID() as id")
            result = cursor.fetchone()
            session_id = result['id'] if isinstance(result, dict) else result[0]

            # 添加学生到会话
            for user_login in session.student_ids:
                cursor.execute("""
                    INSERT INTO attendance_session_students (session_id, user_login)
                    VALUES (%s, %s)
                """, (session_id, user_login))

            # 如果是留堂，记录到留堂历史
            if session.session_type == 'detention':
                for user_login in session.student_ids:
                    cursor.execute("""
                        INSERT INTO detention_history 
                        (user_login, session_id, detention_date, created_by, reason)
                        VALUES (%s, %s, %s, %s, %s)
                    """, (
                        user_login,
                        session_id,
                        session.session_date,
                        user_info[0],
                        session.notes
                    ))

            db.commit()

            # 返回消息
            type_text = '早读' if session.session_type == 'morning' else '留堂'
            if session.open_mode:
                msg = f"成功创建{type_text}点名会话（开放模式）"
            else:
                msg = f"成功创建{type_text}点名会话，共 {len(session.student_ids)} 名学生"

            return {
                "success": True,
                "session_id": session_id,
                "open_mode": session.open_mode,
                "message": msg
            }

    except Exception as e:
        logger.error(f"创建点名会话失败: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"创建失败: {str(e)}")


@router.get("/sessions")
async def get_sessions(
        session_type: Optional[str] = None,
        date: Optional[str] = None,
        status: str = 'active',
        user_info=Depends(verify_admin_or_teacher)
):
    """获取点名会话列表"""
    with get_db() as db:
        cursor = db.cursor(pymysql.cursors.DictCursor)

        sql = """
            SELECT s.*, 
                   COUNT(DISTINCT ss.user_login) as total_students,
                   COUNT(DISTINCT ar.user_login) as checked_in
            FROM attendance_sessions s
            LEFT JOIN attendance_session_students ss ON s.id = ss.session_id
            LEFT JOIN attendance_records ar ON s.id = ar.session_id
            WHERE 1=1
        """
        params = []

        if session_type:
            sql += " AND s.session_type = %s"
            params.append(session_type)

        if date:
            sql += " AND s.session_date = %s"
            params.append(date)

        if status:
            sql += " AND s.status = %s"
            params.append(status)

        sql += " GROUP BY s.id ORDER BY s.session_date DESC, s.created_at DESC"

        cursor.execute(sql, params)
        sessions = cursor.fetchall()

        return {"success": True, "sessions": sessions}


@router.get("/sessions/{session_id}")
async def get_session_detail(
        session_id: int,
        user_info=Depends(verify_admin_or_teacher)
):
    """获取点名会话详情"""
    with get_db() as db:
        cursor = db.cursor(pymysql.cursors.DictCursor)

        # 获取会话信息
        cursor.execute("""
            SELECT * FROM attendance_sessions WHERE id = %s
        """, (session_id,))
        session = cursor.fetchone()

        if not session:
            raise HTTPException(status_code=404, detail="会话不存在")

        # 直接从签到记录表获取所有签到学生
        cursor.execute("""
            SELECT ar.user_login, s.class_name, s.class_number,
                   s.english_name, s.chinese_name, s.card_id,
                   ar.scan_time, ar.status as attendance_status,
                   ar.late_minutes, ar.makeup_minutes
            FROM attendance_records ar
            JOIN attendance_students s ON ar.user_login = s.user_login
            WHERE ar.session_id = %s
            ORDER BY s.class_name, s.class_number
        """, (session_id,))
        students = cursor.fetchall()

        # 统计
        total = len(students)
        late = sum(1 for s in students if s['attendance_status'] == 'late')
        very_late = sum(1 for s in students if s['attendance_status'] == 'very_late')
        on_time = total - late - very_late

        return {
            "success": True,
            "session": session,
            "students": students,
            "stats": {
                "total": total,
                "checked_in": total,
                "absent": 0,
                "on_time": on_time,
                "late": late,
                "very_late": very_late
            }
        }


@router.get("/detention/sessions/{session_id}")
async def get_detention_session_detail(
        session_id: int,
        user_info: dict = Depends(verify_admin_or_teacher)
):
    """获取留堂会话详情"""
    with get_db() as db:
        cursor = db.cursor(pymysql.cursors.DictCursor)

        # 获取会话信息
        cursor.execute("""
            SELECT * FROM attendance_sessions 
            WHERE id = %s AND session_type = 'detention'
        """, (session_id,))
        session = cursor.fetchone()

        if not session:
            raise HTTPException(status_code=404, detail="留堂会话不存在")

        # 直接从签到记录表获取所有签到学生
        cursor.execute("""
            SELECT ar.user_login, s.class_name, s.class_number,
                   s.english_name, s.chinese_name, s.card_id,
                   ar.scan_time, ar.checkout_time, ar.status,
                   ar.planned_periods, ar.planned_minutes, ar.planned_end_time,
                   ar.actual_minutes, ar.actual_periods,
                   ar.detention_reason
            FROM attendance_records ar
            JOIN attendance_students s ON ar.user_login = s.user_login
            WHERE ar.session_id = %s
            ORDER BY s.class_name, s.class_number
        """, (session_id,))
        students = cursor.fetchall()

        now = datetime.now()

        # 计算每个学生的剩余时间
        for student in students:
            if student.get('status') == 'detention_active' and student.get('planned_end_time'):
                remaining = (student['planned_end_time'] - now).total_seconds()
                student['remaining_seconds'] = max(0, int(remaining))
                student['remaining_display'] = format_remaining_time(remaining)
            else:
                student['remaining_seconds'] = 0
                student['remaining_display'] = '-'

        # 统计
        total = len(students)
        completed = sum(1 for s in students if s.get('status') == 'detention_completed')
        active = sum(1 for s in students if s.get('status') == 'detention_active')

        return {
            "success": True,
            "session": session,
            "students": students,
            "stats": {
                "total": total,
                "checked_in": total,
                "active": active,
                "completed": completed,
                "not_checked_in": 0
            }
        }


@router.put("/sessions/{session_id}/complete")
async def complete_session(
        session_id: int,
        user_info=Depends(verify_admin_or_teacher)
):
    """结束点名会话"""
    with get_db() as db:
        cursor = db.cursor()

        cursor.execute("""
            UPDATE attendance_sessions 
            SET status = 'completed', end_time = CURRENT_TIME()
            WHERE id = %s
        """, (session_id,))

        db.commit()

        return {"success": True, "message": "点名会话已结束"}


# ---------- 拍卡签到 ----------


@router.post("/scan")
async def scan_card(
        request: CardScanRequest,
        user_info=Depends(verify_admin_or_teacher)
):
    """拍卡签到（支持非登记学生）"""
    try:
        with get_db() as db:
            cursor = db.cursor(pymysql.cursors.DictCursor)

            # 1) 查找学生（通过 CardID）
            cursor.execute("""
                SELECT user_login, english_name, chinese_name, class_name, class_number
                FROM attendance_students
                WHERE card_id = %s AND is_active = TRUE
            """, (request.card_id,))
            student = cursor.fetchone()

            if not student:
                return {
                    "success": False,
                    "message": "未找到对应的学生，请检查学生证",
                    "card_id": request.card_id
                }

            # 2) 检查学生是否在此会话名单中
            cursor.execute("""
                SELECT id FROM attendance_session_students
                WHERE session_id = %s AND user_login = %s
            """, (request.session_id, student['user_login']))
            is_in_list = cursor.fetchone() is not None

            # 3) 获取会话的开放模式状态
            cursor.execute("""
                SELECT open_mode FROM attendance_sessions WHERE id = %s
            """, (request.session_id,))
            session_info = cursor.fetchone()
            is_open_mode = bool(session_info.get('open_mode', False)) if session_info else False

            # 4) 计算 is_registered（开放模式下视为登记；否则必须在名单中）
            is_registered = True if is_open_mode else is_in_list

            # 5) 检查是否已签到
            cursor.execute("""
                SELECT id FROM attendance_records
                WHERE session_id = %s AND user_login = %s
            """, (request.session_id, student['user_login']))

            if cursor.fetchone():
                return {
                    "success": False,
                    "message": f"{student['chinese_name']} 已经签到过了",
                    "student": student
                }

            # 6) 获取会话信息（用于计算迟到）
            cursor.execute("""
                SELECT session_type, target_time, late_threshold, makeup_minutes, open_mode
                FROM attendance_sessions
                WHERE id = %s
            """, (request.session_id,))
            session = cursor.fetchone()

            if not session:
                raise HTTPException(status_code=404, detail="会话不存在")

            # 7) 计算迟到状态
            now = datetime.now()
            scan_time = now
            current_time = now.time()

            target_time = session['target_time']
            late_threshold = session['late_threshold']

            # 兼容 MySQL TIME -> timedelta 的情况
            if isinstance(target_time, timedelta):
                target_seconds = target_time.total_seconds()
                target_time = time(
                    int(target_seconds // 3600),
                    int((target_seconds % 3600) // 60),
                    int(target_seconds % 60)
                )

            if isinstance(late_threshold, timedelta):
                late_seconds = late_threshold.total_seconds()
                late_threshold = time(
                    int(late_seconds // 3600),
                    int((late_seconds % 3600) // 60),
                    int(late_seconds % 60)
                )

                # 比较时只看时和分，忽略秒（7:30:59仍算7:30分，不迟到）
                current_hm = current_time.replace(second=0, microsecond=0)
                target_hm = target_time.replace(second=0, microsecond=0)
                # 重要修改：40分不算严重迟到，41分开始才算严重迟到
                # 将 late_threshold 也清零秒，用分钟级别比较
                late_threshold_hm = late_threshold.replace(second=0, microsecond=0)

                if current_hm <= target_hm:
                    status = 'present'
                    late_minutes = 0
                    makeup_minutes = 0
                elif current_hm <= late_threshold_hm:
                    # 用分钟级别比较：7:40:xx 都算 7:40，与阈值 7:40 相等，是普通迟到
                    status = 'late'
                    late_minutes = (current_hm.hour * 60 + current_hm.minute) - (target_hm.hour * 60 + target_hm.minute)
                    makeup_minutes = late_minutes
                else:
                    # 7:41:xx 开始才算严重迟到
                    status = 'very_late'
                    late_minutes = (current_hm.hour * 60 + current_hm.minute) - (target_hm.hour * 60 + target_hm.minute)
                    makeup_minutes = session.get('makeup_minutes', 0)

            # 8) ⭐ 关键修复：如果学生不在名单中，则自动加入（用于非登记/开放签到的追踪）
            # 说明：开放模式下通常 is_in_list 为 False，但仍希望把来签到的学生记录进 session 名单，便于导出/统计。
            if not is_in_list:
                cursor.execute("""
                    INSERT IGNORE INTO attendance_session_students (session_id, user_login)
                    VALUES (%s, %s)
                """, (request.session_id, student['user_login']))

            # 9) 写入签到记录
            cursor.execute("""
                INSERT INTO attendance_records
                (session_id, user_login, card_id, scan_time, status, late_minutes, makeup_minutes, is_registered)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                request.session_id,
                student['user_login'],
                request.card_id,
                scan_time,
                status,
                late_minutes,
                makeup_minutes,
                is_registered
            ))

            db.commit()

            # 10) 构建响应消息
            status_text = {
                'present': '✅ 准时',
                'late': '⚠️ 迟到',
                'very_late': '🔴 严重迟到'
            }

            registered_tag = "" if is_registered else " 【非登记】"
            message = f"{student['chinese_name']} ({student['english_name']}){registered_tag} - {status_text.get(status, status)}"
            if late_minutes > 0:
                message += f"\n迟到 {late_minutes} 分钟"
            if makeup_minutes > 0:
                message += f"\n需补时 {makeup_minutes} 分钟"

            return {
                "success": True,
                "message": message,
                "student": student,
                "is_registered": is_registered,
                "record": {
                    "scan_time": scan_time.strftime("%H:%M:%S"),
                    "status": status,
                    "late_minutes": late_minutes,
                    "makeup_minutes": makeup_minutes
                }
            }

    except Exception as e:
        logger.error(f"签到失败: {e}")
        raise HTTPException(status_code=500, detail=f"签到失败: {str(e)}")


# 手动签到（学生忘带卡时使用）
@router.post("/manual-scan")
async def manual_scan(
        request: ManualScanRequest,
        user_info=Depends(verify_admin_or_teacher)
):
    """手动签到（学生忘带卡时使用）"""
    try:
        with get_db() as db:
            cursor = db.cursor(pymysql.cursors.DictCursor)

            # 通过user_login查找学生
            cursor.execute("""
                SELECT user_login, english_name, chinese_name, class_name, class_number, card_id
                FROM attendance_students 
                WHERE user_login = %s AND is_active = TRUE
            """, (request.user_login,))
            student = cursor.fetchone()

            if not student:
                return {
                    "success": False,
                    "message": "未找到该学生"
                }

            # 2) 检查学生是否在此会话名单中
            cursor.execute("""
                SELECT id FROM attendance_session_students
                WHERE session_id = %s AND user_login = %s
            """, (request.session_id, student['user_login']))
            is_in_list = cursor.fetchone() is not None

            # 3) 获取会话的开放模式状态
            cursor.execute("""
                SELECT open_mode FROM attendance_sessions WHERE id = %s
            """, (request.session_id,))
            session_info = cursor.fetchone()
            is_open_mode = bool(session_info.get('open_mode', False)) if session_info else False

            # 4) 计算 is_registered（开放模式下视为登记；否则必须在名单中）
            is_registered = True if is_open_mode else is_in_list

            # 检查是否已签到
            cursor.execute("""
                SELECT id FROM attendance_records 
                WHERE session_id = %s AND user_login = %s
            """, (request.session_id, student['user_login']))

            if cursor.fetchone():
                return {
                    "success": False,
                    "message": f"{student['chinese_name']} 已经签到过了",
                    "student": student
                }

            # 获取会话信息
            cursor.execute("""
                SELECT session_type, target_time, late_threshold, makeup_minutes
                FROM attendance_sessions 
                WHERE id = %s
            """, (request.session_id,))
            session = cursor.fetchone()

            if not session:
                raise HTTPException(status_code=404, detail="会话不存在")

            # 计算迟到状态
            now = datetime.now()
            scan_time = now
            current_time = now.time()

            # 解析时间
            target_time = session['target_time']
            late_threshold = session['late_threshold']

            # 处理 timedelta 类型
            if isinstance(target_time, timedelta):
                target_seconds = target_time.total_seconds()
                target_time = time(
                    int(target_seconds // 3600),
                    int((target_seconds % 3600) // 60),
                    int(target_seconds % 60)
                )

            if isinstance(late_threshold, timedelta):
                late_seconds = late_threshold.total_seconds()
                late_threshold = time(
                    int(late_seconds // 3600),
                    int((late_seconds % 3600) // 60),
                    int(late_seconds % 60)
                )

                # 计算状态 - 重要修改：40分不算严重迟到，41分开始才算严重迟到
                # 用分钟级别比较，忽略秒
                current_hm = current_time.replace(second=0, microsecond=0)
                target_hm = target_time.replace(second=0, microsecond=0)
                late_threshold_hm = late_threshold.replace(second=0, microsecond=0)

                if current_hm <= target_hm:
                    status = 'present'
                    late_minutes = 0
                    makeup_minutes = 0
                elif current_hm <= late_threshold_hm:
                    # 7:40:xx 都算 7:40，与阈值 7:40 相等，是普通迟到
                    status = 'late'
                    target_dt = datetime.combine(now.date(), target_time)
                    late_minutes = int((now - target_dt).total_seconds() / 60)
                    makeup_minutes = late_minutes
                else:
                    # 7:41:xx 开始才算严重迟到
                    status = 'very_late'
                    target_dt = datetime.combine(now.date(), target_time)
                    late_minutes = int((now - target_dt).total_seconds() / 60)
                    makeup_minutes = session['makeup_minutes']

            # ⭐ 新增：如果学生不在名单中，自动加入（用于非登记/开放签到的追踪）
            if not is_in_list:
                cursor.execute("""
                    INSERT IGNORE INTO attendance_session_students (session_id, user_login)
                    VALUES (%s, %s)
                """, (request.session_id, student['user_login']))

            # 记录签到（card_id 标记为 MANUAL 表示手动签到）
            cursor.execute("""
                INSERT INTO attendance_records 
                (session_id, user_login, card_id, scan_time, status, late_minutes, makeup_minutes, is_registered)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                request.session_id,
                student['user_login'],
                'MANUAL',  # 标记为手动签到
                scan_time,
                status,
                late_minutes,
                makeup_minutes,
                is_registered
            ))

            db.commit()

            # 构建响应消息
            status_text = {
                'present': '✅ 准时',
                'late': '⚠️ 迟到',
                'very_late': '🔴 严重迟到'
            }

            registered_tag = "" if is_registered else " 【非登记】"
            message = f"{student['chinese_name']} ({student['english_name']}){registered_tag} - {status_text.get(status, status)} [手动签到]"
            if late_minutes > 0:
                message += f"\n迟到 {late_minutes} 分钟"
            if makeup_minutes > 0:
                message += f"\n需补时 {makeup_minutes} 分钟"

            return {
                "success": True,
                "message": message,
                "student": student,
                "is_registered": is_registered,
                "is_manual": True,
                "record": {
                    "scan_time": scan_time.strftime("%H:%M:%S"),
                    "status": status,
                    "late_minutes": late_minutes,
                    "makeup_minutes": makeup_minutes
                }
            }

    except Exception as e:
        logger.error(f"手动签到失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/detention/checkin")
async def detention_checkin(
        request: DetentionCheckinRequest,
        user_info: dict = Depends(verify_admin_or_teacher)
):
    """留堂签到 - 第一次拍卡并选择节数或分钟数"""
    # 验证参数：必须提供 planned_periods 或 planned_minutes 其中之一
    if request.planned_periods is None and request.planned_minutes is None:
        raise HTTPException(status_code=400, detail="必须指定节数或分钟数")

    if request.planned_periods is not None and request.planned_periods not in [1, 2, 3]:
        raise HTTPException(status_code=400, detail="节数必须是1、2或3")

    if request.planned_minutes is not None and (request.planned_minutes < 1 or request.planned_minutes > 180):
        raise HTTPException(status_code=400, detail="分钟数必须在1-180之间")

    try:
        with get_db() as db:
            cursor = db.cursor(pymysql.cursors.DictCursor)

            # 1) 查找学生
            cursor.execute("""
                SELECT user_login, english_name, chinese_name, class_name, class_number
                FROM attendance_students
                WHERE card_id = %s AND is_active = TRUE
            """, (request.card_id,))
            student = cursor.fetchone()

            if not student:
                return {
                    "success": False,
                    "message": "未找到对应的学生，请检查学生证",
                    "card_id": request.card_id
                }

            # 2) 检查学生是否在名单中
            cursor.execute("""
                SELECT id FROM attendance_session_students
                WHERE session_id = %s AND user_login = %s
            """, (request.session_id, student['user_login']))
            is_in_list = cursor.fetchone() is not None

            # 3) 获取会话的开放模式状态（留堂）
            cursor.execute("""
                SELECT open_mode FROM attendance_sessions
                WHERE id = %s AND session_type = 'detention'
            """, (request.session_id,))
            session_info = cursor.fetchone()

            if not session_info:
                return {
                    "success": False,
                    "message": "留堂会话不存在"
                }

            is_open_mode = bool(session_info.get('open_mode', False))

            # 4) 开放模式下所有学生都可以签到，否则必须在名单中
            if not is_open_mode and not is_in_list:
                return {
                    "success": False,
                    "message": f"{student['chinese_name']} 不在今天的留堂名单中",
                    "student": student
                }

            # ⭐ 新增：如果学生不在名单中，自动加入（用于非登记/开放签到的追踪）
            if not is_in_list:
                cursor.execute("""
                    INSERT IGNORE INTO attendance_session_students (session_id, user_login)
                    VALUES (%s, %s)
                """, (request.session_id, student['user_login']))

            # 检查是否已签到
            cursor.execute("""
                SELECT id, status FROM attendance_records 
                WHERE session_id = %s AND user_login = %s
            """, (request.session_id, student['user_login']))
            existing = cursor.fetchone()

            if existing:
                return {
                    "success": False,
                    "message": f"{student['chinese_name']} 已经签到过了",
                    "student": student
                }

            # 计算计划结束时间（优先使用分钟数，否则使用节数）
            now = datetime.now()
            if request.planned_minutes is not None:
                duration_minutes = request.planned_minutes
                # 计算等效节数（向上取整）
                planned_periods = max(1, (duration_minutes + 34) // 35)
            else:
                planned_periods = request.planned_periods
                duration_minutes = planned_periods * 35

            planned_end_time = now + timedelta(minutes=duration_minutes)

            # 记录签到
            cursor.execute("""
                            INSERT INTO attendance_records 
                            (session_id, user_login, card_id, scan_time, status, 
                             planned_periods, planned_minutes, planned_end_time, detention_reason)
                            VALUES (%s, %s, %s, %s, 'detention_active', %s, %s, %s, %s)
                        """, (
                request.session_id,
                student['user_login'],
                request.card_id,
                now,
                planned_periods,
                request.planned_minutes,  # 新增：保存原始分钟数
                planned_end_time,
                request.detention_reason
            ))

            db.commit()

            # 构建消息
            if request.planned_minutes is not None:
                msg = f"{student['chinese_name']} 签到成功，计划留{duration_minutes}分钟"
            else:
                msg = f"{student['chinese_name']} 签到成功，计划留{planned_periods}节"

            return {
                "success": True,
                "message": msg,
                "student": student,
                "record": {
                    "scan_time": now.strftime("%H:%M:%S"),
                    "planned_periods": request.planned_periods,
                    "planned_end_time": planned_end_time.strftime("%H:%M"),
                    "duration_minutes": duration_minutes
                }
            }

    except Exception as e:
        logger.error(f"留堂签到失败: {e}")
        raise HTTPException(status_code=500, detail=f"签到失败: {str(e)}")


# 新增 留堂签退端点


@router.post("/detention/manual-checkin")
async def detention_manual_checkin(
        request: DetentionManualCheckinRequest,
        user_info: dict = Depends(verify_admin_or_teacher)
):
    """留堂手动签到 - 学生忘带卡时使用（支持节数或分钟数）"""
    # 验证参数：必须提供 planned_periods 或 planned_minutes 其中之一
    if request.planned_periods is None and request.planned_minutes is None:
        raise HTTPException(status_code=400, detail="必须指定节数或分钟数")

    if request.planned_periods is not None and request.planned_periods not in [1, 2, 3]:
        raise HTTPException(status_code=400, detail="节数必须是1、2或3")

    if request.planned_minutes is not None and (request.planned_minutes < 1 or request.planned_minutes > 180):
        raise HTTPException(status_code=400, detail="分钟数必须在1-180之间")

    try:
        with get_db() as db:
            cursor = db.cursor(pymysql.cursors.DictCursor)

            # 通过user_login查找学生
            cursor.execute("""
                SELECT user_login, english_name, chinese_name, class_name, class_number
                FROM attendance_students 
                WHERE user_login = %s AND is_active = TRUE
            """, (request.user_login,))
            student = cursor.fetchone()

            if not student:
                return {
                    "success": False,
                    "message": "未找到该学生"
                }

            # 检查学生是否在名单中
            cursor.execute("""
                SELECT id FROM attendance_session_students 
                WHERE session_id = %s AND user_login = %s
            """, (request.session_id, student['user_login']))
            is_in_list = cursor.fetchone() is not None

            # 获取会话的开放模式状态
            cursor.execute("""
                SELECT open_mode FROM attendance_sessions WHERE id = %s AND session_type = 'detention'
            """, (request.session_id,))
            session_info = cursor.fetchone()

            if not session_info:
                return {
                    "success": False,
                    "message": "留堂会话不存在"
                }

            is_open_mode = session_info.get('open_mode', False)

            # 开放模式下所有学生都可以签到，否则必须在名单中
            if not is_open_mode and not is_in_list:
                return {
                    "success": False,
                    "message": f"{student['chinese_name']} 不在今天的留堂名单中",
                    "student": student
                }

            # 检查是否已签到
            cursor.execute("""
                SELECT id, status FROM attendance_records 
                WHERE session_id = %s AND user_login = %s
            """, (request.session_id, student['user_login']))
            existing = cursor.fetchone()

            if existing:
                return {
                    "success": False,
                    "message": f"{student['chinese_name']} 已经签到过了",
                    "student": student
                }

            # 计算计划结束时间（优先使用分钟数，否则使用节数）
            now = datetime.now()
            if request.planned_minutes is not None:
                duration_minutes = request.planned_minutes
                # 计算等效节数（向上取整）
                planned_periods = max(1, (duration_minutes + 34) // 35)
            else:
                planned_periods = request.planned_periods
                duration_minutes = planned_periods * 35

            planned_end_time = now + timedelta(minutes=duration_minutes)

            # 记录签到（card_id 标记为 MANUAL 表示手动签到）
            cursor.execute("""
                            INSERT INTO attendance_records 
                            (session_id, user_login, card_id, scan_time, status, 
                             planned_periods, planned_minutes, planned_end_time, detention_reason)
                            VALUES (%s, %s, 'MANUAL', %s, 'detention_active', %s, %s, %s, %s)
                        """, (
                request.session_id,
                student['user_login'],
                now,
                planned_periods,
                request.planned_minutes,  # 新增：保存原始分钟数
                planned_end_time,
                request.detention_reason
            ))

            # ⭐ 新增：如果学生不在名单中，自动添加到 session_students 表
            if not is_in_list:
                cursor.execute("""
                    INSERT IGNORE INTO attendance_session_students (session_id, user_login)
                    VALUES (%s, %s)
                """, (request.session_id, student['user_login']))

            db.commit()

            # 构建消息
            if request.planned_minutes is not None:
                msg = f"{student['chinese_name']} 手动签到成功，计划留{duration_minutes}分钟"
            else:
                msg = f"{student['chinese_name']} 手动签到成功，计划留{planned_periods}节"

            return {
                "success": True,
                "message": msg,
                "student": student,
                "is_manual": True,
                "record": {
                    "scan_time": now.strftime("%H:%M:%S"),
                    "planned_periods": planned_periods,
                    "planned_end_time": planned_end_time.strftime("%H:%M"),
                    "duration_minutes": duration_minutes
                }
            }

    except Exception as e:
        logger.error(f"留堂手动签到失败: {e}")
        raise HTTPException(status_code=500, detail=f"签到失败: {str(e)}")


# 新增 留堂手动签退端点
@router.post("/detention/manual-checkout")
async def detention_manual_checkout(
        request: ManualScanRequest,
        user_info: dict = Depends(verify_admin_or_teacher)
):
    """留堂手动签退 - 学生忘带卡时使用"""
    try:
        with get_db() as db:
            cursor = db.cursor(pymysql.cursors.DictCursor)

            # 1. 通过user_login查找学生
            cursor.execute("""
                SELECT user_login, english_name, chinese_name, class_name, class_number
                FROM attendance_students 
                WHERE user_login = %s AND is_active = TRUE
            """, (request.user_login,))
            student = cursor.fetchone()

            if not student:
                return {"success": False, "message": "未找到该学生"}

            # 2. 查找签到记录
            cursor.execute("""
                SELECT id, scan_time, planned_periods, planned_minutes, status
                FROM attendance_records 
                WHERE session_id = %s AND user_login = %s
            """, (request.session_id, student['user_login']))
            record = cursor.fetchone()

            if not record:
                return {"success": False, "message": f"{student['chinese_name']} 尚未签到"}

            if record['status'] == 'detention_completed':
                return {"success": False, "message": f"{student['chinese_name']} 已经签退过了"}

            # 3. 计算实际留堂时间
            now = datetime.now()
            scan_time = record['scan_time']
            actual_minutes = int((now - scan_time).total_seconds() / 60)

            # 4. 计算实际完成节数
            if actual_minutes < 35:
                actual_periods = 0  # 未完成一节
            elif actual_minutes < 70:
                actual_periods = 1
            elif actual_minutes < 105:
                actual_periods = 2
            else:
                actual_periods = 3

            # 5. 更新记录
            cursor.execute("""
                UPDATE attendance_records 
                SET checkout_time = %s, 
                    status = 'detention_completed',
                    actual_minutes = %s,
                    actual_periods = %s
                WHERE id = %s
            """, (now, actual_minutes, actual_periods, record['id']))

            db.commit()

            # 6. 构建响应消息 - 根据是否使用分钟计时来判断完成状态
            planned_mins = record.get('planned_minutes')
            planned_periods = record.get('planned_periods') or 0

            if planned_mins is not None:
                # 分钟计时模式：按分钟判断是否完成
                is_completed = actual_minutes >= planned_mins
                if is_completed:
                    status_msg = f"✅ 完成！留了{actual_minutes}分钟（计划{planned_mins}分钟）"
                else:
                    status_msg = f"⚠️ 未完成！留了{actual_minutes}分钟（计划{planned_mins}分钟）"
            else:
                # 节数计时模式：按节数判断是否完成
                is_completed = actual_periods >= planned_periods
                if is_completed:
                    status_msg = f"✅ 完成！留了{actual_minutes}分钟，完成{actual_periods}节"
                elif actual_periods == 0:
                    status_msg = f"❌ 未完成！只留了{actual_minutes}分钟，不足1节"
                else:
                    status_msg = f"⚠️ 未完成！留了{actual_minutes}分钟，只完成{actual_periods}节（计划{planned_periods}节）"

            return {
                "success": True,
                "message": f"{student['chinese_name']} 手动签退成功",
                "student": student,
                "is_manual": True,
                "record": {
                    "scan_time": scan_time.strftime("%H:%M:%S"),
                    "checkout_time": now.strftime("%H:%M:%S"),
                    "actual_minutes": actual_minutes,
                    "planned_minutes": planned_mins,
                    "planned_periods": planned_periods,
                    "actual_periods": actual_periods,
                    "status_msg": status_msg,
                    "is_completed": is_completed
                }
            }

    except Exception as e:
        logger.error(f"留堂手动签退失败: {e}")
        raise HTTPException(status_code=500, detail=f"签退失败: {str(e)}")


@router.post("/detention/checkout")
async def detention_checkout(
        request: CardScanRequest,
        user_info: dict = Depends(verify_admin_or_teacher)
):
    """留堂签退 - 第二次拍卡"""
    try:
        with get_db() as db:
            cursor = db.cursor(pymysql.cursors.DictCursor)

            # 查找学生
            cursor.execute("""
                SELECT user_login, english_name, chinese_name, class_name, class_number
                FROM attendance_students 
                WHERE card_id = %s AND is_active = TRUE
            """, (request.card_id,))
            student = cursor.fetchone()

            if not student:
                return {
                    "success": False,
                    "message": "未找到对应的学生",
                    "card_id": request.card_id
                }

            # 查找签到记录
            cursor.execute("""
                SELECT id, scan_time, planned_periods, planned_minutes, status
                FROM attendance_records 
                WHERE session_id = %s AND user_login = %s
            """, (request.session_id, student['user_login']))
            record = cursor.fetchone()

            if not record:
                return {
                    "success": False,
                    "message": f"{student['chinese_name']} 尚未签到",
                    "student": student
                }

            if record['status'] == 'detention_completed':
                return {
                    "success": False,
                    "message": f"{student['chinese_name']} 已经签退过了",
                    "student": student
                }

            # 计算实际留堂时间
            now = datetime.now()
            scan_time = record['scan_time']
            actual_minutes = int((now - scan_time).total_seconds() / 60)

            # 计算实际完成节数
            if actual_minutes < 35:
                actual_periods = 0  # 未完成一节
            elif actual_minutes < 70:
                actual_periods = 1
            elif actual_minutes < 105:
                actual_periods = 2
            else:
                actual_periods = 3

            # 更新记录
            cursor.execute("""
                        UPDATE attendance_records 
                        SET checkout_time = %s, 
                            status = 'detention_completed',
                            actual_minutes = %s,
                            actual_periods = %s
                        WHERE id = %s
                    """, (now, actual_minutes, actual_periods, record['id']))

            # 判断是否完成（用于更新历史记录）
            planned_mins = record.get('planned_minutes')
            planned_periods = record.get('planned_periods') or 0
            if planned_mins is not None:
                is_completed = actual_minutes >= planned_mins
            else:
                is_completed = actual_periods >= planned_periods

            # 更新留堂历史记录
            cursor.execute("""
                        UPDATE detention_history 
                        SET completed = %s, 
                            completed_at = %s,
                            duration_minutes = %s
                        WHERE session_id = %s AND user_login = %s
                    """, (is_completed, now, actual_minutes, request.session_id, student['user_login']))

            db.commit()

            # 构建响应消息 - 根据是否使用分钟计时来判断完成状态
            planned_mins = record.get('planned_minutes')
            if planned_mins is not None:
                # 分钟计时模式：按分钟判断是否完成
                is_completed = actual_minutes >= planned_mins
                if is_completed:
                    status_msg = f"✅ 完成！留了{actual_minutes}分钟（计划{planned_mins}分钟）"
                else:
                    status_msg = f"⚠️ 未完成！留了{actual_minutes}分钟（计划{planned_mins}分钟）"
            else:
                # 节数计时模式：按节数判断是否完成
                if actual_periods >= record['planned_periods']:
                    status_msg = f"✅ 完成！留了{actual_minutes}分钟，完成{actual_periods}节"
                else:
                    status_msg = f"⚠️ 未完成！留了{actual_minutes}分钟，只完成{actual_periods}节（计划{record['planned_periods']}节）"

    except Exception as e:
        logger.error(f"留堂签退失败: {e}")
        raise HTTPException(status_code=500, detail=f"签退失败: {str(e)}")


# 新增 留堂手动签退端点
@router.post("/detention/manual-checkout")
async def detention_manual_checkout(
        request: ManualScanRequest,
        user_info: dict = Depends(verify_admin_or_teacher)
):
    """留堂手动签退 - 学生忘带卡时使用"""
    try:
        with get_db() as db:
            cursor = db.cursor(pymysql.cursors.DictCursor)

            # 1. 通过user_login查找学生
            cursor.execute("""
                SELECT user_login, english_name, chinese_name, class_name, class_number
                FROM attendance_students 
                WHERE user_login = %s AND is_active = TRUE
            """, (request.user_login,))
            student = cursor.fetchone()

            if not student:
                return {
                    "success": False,
                    "message": "未找到该学生"
                }

            # 2. 查找签到记录
            cursor.execute("""
                SELECT id, scan_time, planned_periods, planned_minutes, status
                FROM attendance_records 
                WHERE session_id = %s AND user_login = %s
            """, (request.session_id, student['user_login']))
            record = cursor.fetchone()

            if not record:
                return {
                    "success": False,
                    "message": f"{student['chinese_name']} 尚未签到",
                    "student": student
                }

            if record['status'] == 'detention_completed':
                return {
                    "success": False,
                    "message": f"{student['chinese_name']} 已经签退过了",
                    "student": student
                }

            # 3. 计算实际留堂时间
            now = datetime.now()
            scan_time = record['scan_time']
            actual_minutes = int((now - scan_time).total_seconds() / 60)

            # 4. 计算实际完成节数
            if actual_minutes < 35:
                actual_periods = 0
            elif actual_minutes < 70:
                actual_periods = 1
            elif actual_minutes < 105:
                actual_periods = 2
            else:
                actual_periods = 3

            # 5. 更新记录
            cursor.execute("""
                        UPDATE attendance_records 
                        SET checkout_time = %s, 
                            status = 'detention_completed',
                            actual_minutes = %s,
                            actual_periods = %s
                        WHERE id = %s
                    """, (now, actual_minutes, actual_periods, record['id']))

            # 判断是否完成（用于更新历史记录）
            planned_mins = record.get('planned_minutes')
            planned_periods_val = record.get('planned_periods') or 0
            if planned_mins is not None:
                is_completed = actual_minutes >= planned_mins
            else:
                is_completed = actual_periods >= planned_periods_val

            # 更新留堂历史记录
            cursor.execute("""
                        UPDATE detention_history 
                        SET completed = %s, 
                            completed_at = %s,
                            duration_minutes = %s
                        WHERE session_id = %s AND user_login = %s
                    """, (is_completed, now, actual_minutes, request.session_id, student['user_login']))

            db.commit()

            # 6. 构建响应消息 - 根据是否使用分钟计时来判断完成状态
            planned_periods = record.get('planned_periods') or 0
            planned_mins = record.get('planned_minutes')
            if planned_mins is not None:
                # 分钟计时模式：按分钟判断是否完成
                is_completed = actual_minutes >= planned_mins
                if is_completed:
                    status_msg = f"✅ 完成！留了{actual_minutes}分钟（计划{planned_mins}分钟）"
                else:
                    status_msg = f"⚠️ 未完成！留了{actual_minutes}分钟（计划{planned_mins}分钟）"
            else:
                # 节数计时模式：按节数判断是否完成
                if actual_periods >= planned_periods:
                    status_msg = f"✅ 完成！留了{actual_minutes}分钟，完成{actual_periods}节"
                elif actual_periods == 0:
                    status_msg = f"❌ 未完成！只留了{actual_minutes}分钟，不足1节"
                else:
                    status_msg = f"⚠️ 未完成！留了{actual_minutes}分钟，只完成{actual_periods}节（计划{planned_periods}节）"
            return {
                "success": True,
                "message": f"{student['chinese_name']} 手动签退成功",
                "student": student,
                "is_manual": True,
                "record": {
                    "scan_time": scan_time.strftime("%H:%M:%S"),
                    "checkout_time": now.strftime("%H:%M:%S"),
                    "actual_minutes": actual_minutes,
                    "planned_periods": planned_periods,
                    "actual_periods": actual_periods,
                    "status_msg": status_msg
                }
            }

    except Exception as e:
        logger.error(f"留堂手动签退失败: {e}")
        raise HTTPException(status_code=500, detail=f"签退失败: {str(e)}")


# 新增 修改节数端点


@router.put("/detention/modify-periods")
async def modify_detention_periods(
        request: ModifyPeriodsRequest,
        user_info: dict = Depends(verify_admin_or_teacher)
):
    """修改学生的留堂节数或分钟数"""
    # 验证参数：必须提供 new_periods 或 new_minutes 其中之一
    if request.new_periods is None and request.new_minutes is None:
        raise HTTPException(status_code=400, detail="必须指定节数或分钟数")

    if request.new_periods is not None and request.new_periods not in [1, 2, 3]:
        raise HTTPException(status_code=400, detail="节数必须是1、2或3")

    if request.new_minutes is not None and (request.new_minutes < 1 or request.new_minutes > 180):
        raise HTTPException(status_code=400, detail="分钟数必须在1-180之间")

    try:
        with get_db() as db:
            cursor = db.cursor(pymysql.cursors.DictCursor)

            # 查找记录
            cursor.execute("""
                SELECT id, scan_time, status
                FROM attendance_records 
                WHERE session_id = %s AND user_login = %s
            """, (request.session_id, request.user_login))
            record = cursor.fetchone()

            if not record:
                raise HTTPException(status_code=404, detail="未找到签到记录")

            if record['status'] == 'detention_completed':
                raise HTTPException(status_code=400, detail="学生已签退，无法修改")

            # 计算新的结束时间（优先使用分钟数，否则使用节数）
            scan_time = record['scan_time']
            if request.new_minutes is not None:
                duration_minutes = request.new_minutes
                # 计算等效节数（向上取整）
                new_periods = max(1, (duration_minutes + 34) // 35)
            else:
                new_periods = request.new_periods
                duration_minutes = new_periods * 35

            planned_end_time = scan_time + timedelta(minutes=duration_minutes)

            # 根据修改模式设置 planned_minutes
            # 如果是分钟模式，保存分钟数；如果是节数模式，设为 NULL
            new_planned_minutes = request.new_minutes  # 分钟模式时有值，节数模式时为 None

            cursor.execute("""
                            UPDATE attendance_records 
                            SET planned_periods = %s, planned_minutes = %s, planned_end_time = %s
                            WHERE id = %s
                        """, (new_periods, new_planned_minutes, planned_end_time, record['id']))
            db.commit()

            # 构建消息
            if request.new_minutes is not None:
                msg = f"已修改为{duration_minutes}分钟"
            else:
                msg = f"已修改为{new_periods}节"

            return {
                "success": True,
                "message": msg,
                "new_periods": new_periods,
                "duration_minutes": duration_minutes,
                "planned_end_time": planned_end_time.strftime("%H:%M")
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"修改节数失败: {e}")
        raise HTTPException(status_code=500, detail=f"修改失败: {str(e)}")


# 新增 修改结束时间端点
@router.put("/detention/modify-end-time")
async def modify_detention_end_time(
        request: ModifyEndTimeRequest,
        user_info: dict = Depends(verify_admin_or_teacher)
):
    """直接修改学生的留堂结束时间"""
    try:
        # 解析时间
        try:
            hour, minute = map(int, request.new_end_time.split(':'))
            if not (0 <= hour <= 23 and 0 <= minute <= 59):
                raise ValueError("时间范围错误")
        except:
            raise HTTPException(status_code=400, detail="时间格式错误，请使用 HH:MM 格式")

        with get_db() as db:
            cursor = db.cursor(pymysql.cursors.DictCursor)

            # 查找记录
            cursor.execute("""
                SELECT id, scan_time, status
                FROM attendance_records 
                WHERE session_id = %s AND user_login = %s
            """, (request.session_id, request.user_login))
            record = cursor.fetchone()

            if not record:
                raise HTTPException(status_code=404, detail="未找到签到记录")

            if record['status'] == 'detention_completed':
                raise HTTPException(status_code=400, detail="学生已签退，无法修改")

            # 构建新的结束时间（使用签到日期 + 新时间）
            scan_time = record['scan_time']
            new_end_datetime = datetime.combine(scan_time.date(), time(hour, minute))

            # 如果新结束时间早于签到时间，说明跨天了（一般不会发生）
            if new_end_datetime <= scan_time:
                raise HTTPException(status_code=400, detail="结束时间必须晚于签到时间")

            # 计算对应的节数（用于记录，35分钟一节）
            duration_minutes = int((new_end_datetime - scan_time).total_seconds() / 60)
            if duration_minutes <= 35:
                planned_periods = 1
            elif duration_minutes <= 70:
                planned_periods = 2
            else:
                planned_periods = 3

            # 更新记录
            cursor.execute("""
                UPDATE attendance_records 
                SET planned_end_time = %s, planned_periods = %s
                WHERE id = %s
            """, (new_end_datetime, planned_periods, record['id']))

            db.commit()

            return {
                "success": True,
                "message": f"已修改结束时间为 {request.new_end_time}",
                "new_end_time": request.new_end_time,
                "planned_periods": planned_periods,
                "duration_minutes": duration_minutes
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"修改结束时间失败: {e}")
        raise HTTPException(status_code=500, detail=f"修改失败: {str(e)}")


# 新增 留堂智能拍卡端点
@router.post("/detention/scan")
async def detention_smart_scan(
        request: CardScanRequest,
        user_info: dict = Depends(verify_admin_or_teacher)
):
    """
    留堂智能拍卡
    - 如果未签到：返回需要选择节数
    - 如果已签到未签退：执行签退
    """
    try:
        with get_db() as db:
            cursor = db.cursor(pymysql.cursors.DictCursor)

            # 查找学生
            cursor.execute("""
                SELECT user_login, english_name, chinese_name, class_name, class_number
                FROM attendance_students 
                WHERE card_id = %s AND is_active = TRUE
            """, (request.card_id,))
            student = cursor.fetchone()

            if not student:
                return {
                    "success": False,
                    "action": "error",
                    "message": "未找到对应的学生",
                    "card_id": request.card_id
                }

                # 检查会话是否为开放模式
            cursor.execute("""
                            SELECT open_mode FROM attendance_sessions WHERE id = %s
                        """, (request.session_id,))
            session_info = cursor.fetchone()
            is_open_mode = session_info and session_info.get('open_mode', False)

            # 检查学生是否在名单中
            cursor.execute("""
                            SELECT id FROM attendance_session_students 
                            WHERE session_id = %s AND user_login = %s
                        """, (request.session_id, student['user_login']))
            is_in_list = cursor.fetchone() is not None

            # 获取会话的开放模式状态
            cursor.execute("""
                            SELECT open_mode FROM attendance_sessions WHERE id = %s
                        """, (request.session_id,))
            session_info = cursor.fetchone()
            is_open_mode = session_info and session_info.get('open_mode', False)

            # 开放模式下所有学生都可以签到，否则必须在名单中
            if not is_open_mode and not is_in_list:
                return {
                    "success": False,
                    "action": "not_in_list",
                    "message": f"{student['chinese_name']} 不在今天的留堂名单中",
                    "student": student
                }

            # 检查签到状态
            cursor.execute("""
                SELECT id, scan_time, status, planned_periods
                FROM attendance_records 
                WHERE session_id = %s AND user_login = %s
            """, (request.session_id, student['user_login']))
            record = cursor.fetchone()

            now = datetime.now()

            if not record:
                # 未签到，需要选择节数
                # 计算每个选项的结束时间
                options = []
                for periods in [1, 2, 3]:
                    end_time = now + timedelta(minutes=periods * 35)
                    options.append({
                        "periods": periods,
                        "end_time": end_time.strftime("%H:%M"),
                        "duration_minutes": periods * 35
                    })

                return {
                    "success": True,
                    "action": "need_select_periods",
                    "message": f"{student['chinese_name']} 请选择留堂节数",
                    "student": student,
                    "options": options
                }

            elif record.get('status') == 'detention_active':
                # 已签到，执行签退
                scan_time = record['scan_time']
                actual_minutes = int((now - scan_time).total_seconds() / 60)

                # 计算实际完成节数
                if actual_minutes < 35:
                    actual_periods = 0
                elif actual_minutes < 70:
                    actual_periods = 1
                elif actual_minutes < 105:
                    actual_periods = 2
                else:
                    actual_periods = 3

                cursor.execute("""
                    UPDATE attendance_records 
                    SET checkout_time = %s, status = 'detention_completed',
                        actual_minutes = %s, actual_periods = %s
                    WHERE id = %s
                """, (now, actual_minutes, actual_periods, record['id']))

                db.commit()

                # 判断是否完成
                planned_p = record.get('planned_periods') or 0
                if actual_periods >= planned_p:
                    status_msg = f"✅ 已完成！留了{actual_minutes}分钟，完成{actual_periods}节"
                elif actual_periods == 0:
                    status_msg = f"❌ 未完成！只留了{actual_minutes}分钟，不足1节"
                else:
                    status_msg = f"⚠️ 部分完成！留了{actual_minutes}分钟，完成{actual_periods}节（计划{planned_p}节）"

                return {
                    "success": True,
                    "action": "checkout",
                    "message": f"{student['chinese_name']} 签退成功",
                    "student": student,
                    "record": {
                        "scan_time": scan_time.strftime("%H:%M:%S"),
                        "checkout_time": now.strftime("%H:%M:%S"),
                        "actual_minutes": actual_minutes,
                        "planned_periods": planned_p,
                        "actual_periods": actual_periods,
                        "status_msg": status_msg
                    }
                }

            else:
                # 已签退
                return {
                    "success": False,
                    "action": "already_completed",
                    "message": f"{student['chinese_name']} 已经完成留堂",
                    "student": student
                }

    except Exception as e:
        logger.error(f"留堂拍卡失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ---------- 固定名单管理 ----------

@router.post("/fixed-lists")
async def create_fixed_list(
        request: FixedListRequest,
        user_info=Depends(verify_admin_or_teacher)
):
    """创建固定名单"""
    try:
        with get_db() as db:
            cursor = db.cursor()

            # 创建名单
            cursor.execute("""
                INSERT INTO attendance_fixed_lists (list_name, list_type, created_by)
                VALUES (%s, %s, %s)
                ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP
            """, (request.list_name, request.list_type, user_info[0]))

            list_id = cursor.lastrowid
            if list_id == 0:
                cursor.execute("""
                    SELECT id FROM attendance_fixed_lists 
                    WHERE list_name = %s AND list_type = %s
                """, (request.list_name, request.list_type))
                list_id = cursor.fetchone()[0]

                # 清除旧的学生关联
                cursor.execute("DELETE FROM attendance_fixed_list_students WHERE list_id = %s", (list_id,))

            # 添加学生
            for user_login in request.student_ids:
                cursor.execute("""
                    INSERT INTO attendance_fixed_list_students (list_id, user_login)
                    VALUES (%s, %s)
                """, (list_id, user_login))

            db.commit()

            return {
                "success": True,
                "list_id": list_id,
                "message": f"成功保存名单 '{request.list_name}'，共 {len(request.student_ids)} 名学生"
            }

    except Exception as e:
        logger.error(f"保存固定名单失败: {e}")
        raise HTTPException(status_code=500, detail=f"保存失败: {str(e)}")


@router.get("/fixed-lists")
async def get_fixed_lists(
        list_type: Optional[str] = None,
        user_info=Depends(verify_admin_or_teacher)
):
    """获取固定名单列表"""
    with get_db() as db:
        cursor = db.cursor(pymysql.cursors.DictCursor)

        sql = """
            SELECT fl.*, COUNT(fls.user_login) as student_count
            FROM attendance_fixed_lists fl
            LEFT JOIN attendance_fixed_list_students fls ON fl.id = fls.list_id
            WHERE 1=1
        """
        params = []

        if list_type:
            sql += " AND fl.list_type = %s"
            params.append(list_type)

        sql += " GROUP BY fl.id ORDER BY fl.is_default DESC, fl.list_name"

        cursor.execute(sql, params)
        lists = cursor.fetchall()

        return {"success": True, "lists": lists}


@router.get("/fixed-lists/{list_id}")
async def get_fixed_list_detail(
        list_id: int,
        user_info=Depends(verify_admin_or_teacher)
):
    """获取固定名单详情"""
    with get_db() as db:
        cursor = db.cursor(pymysql.cursors.DictCursor)

        # 获取名单信息
        cursor.execute("SELECT * FROM attendance_fixed_lists WHERE id = %s", (list_id,))
        list_info = cursor.fetchone()

        if not list_info:
            raise HTTPException(status_code=404, detail="名单不存在")

        # 获取学生列表
        cursor.execute("""
            SELECT s.user_login, s.class_name, s.class_number, 
                   s.english_name, s.chinese_name
            FROM attendance_fixed_list_students fls
            JOIN attendance_students s ON fls.user_login = s.user_login
            WHERE fls.list_id = %s
            ORDER BY s.class_name, s.class_number
        """, (list_id,))
        students = cursor.fetchall()

        return {
            "success": True,
            "list": list_info,
            "students": students
        }


@router.delete("/fixed-lists/{list_id}")
async def delete_fixed_list(
        list_id: int,
        user_info=Depends(verify_admin_or_teacher)
):
    """删除固定名单"""
    with get_db() as db:
        cursor = db.cursor()
        cursor.execute("DELETE FROM attendance_fixed_lists WHERE id = %s", (list_id,))
        db.commit()

        return {"success": True, "message": "名单已删除"}


# ----------- 编辑固定名单 -----------
@router.put("/fixed-lists/{list_id}")
async def update_fixed_list(
        list_id: int,
        request: FixedListRequest,
        user_info=Depends(verify_admin_or_teacher)
):
    """编辑固定名单"""
    try:
        with get_db() as db:
            cursor = db.cursor()

            # 检查名单是否存在
            cursor.execute("SELECT id FROM attendance_fixed_lists WHERE id = %s", (list_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="名单不存在")

            # 更新名单信息
            cursor.execute("""
                UPDATE attendance_fixed_lists 
                SET list_name = %s, list_type = %s, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (request.list_name, request.list_type, list_id))

            # 清除旧的学生关联
            cursor.execute("DELETE FROM attendance_fixed_list_students WHERE list_id = %s", (list_id,))

            # 添加新的学生
            for user_login in request.student_ids:
                cursor.execute("""
                    INSERT INTO attendance_fixed_list_students (list_id, user_login)
                    VALUES (%s, %s)
                """, (list_id, user_login))

            db.commit()

            return {
                "success": True,
                "list_id": list_id,
                "message": f"成功更新名单 '{request.list_name}'，共 {len(request.student_ids)} 名学生"
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新固定名单失败: {e}")
        raise HTTPException(status_code=500, detail=f"更新失败: {str(e)}")


# ---------- 留堂历史 ----------

@router.get("/detention-history")
async def get_detention_history(
        user_login: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        completed: Optional[bool] = None,
        user_info=Depends(verify_admin_or_teacher)
):
    """获取留堂历史记录"""
    with get_db() as db:
        cursor = db.cursor(pymysql.cursors.DictCursor)

        sql = """
                    SELECT dh.*, s.english_name, s.chinese_name, s.class_name, s.class_number,
                           ar.planned_minutes, ar.actual_minutes, ar.planned_periods, ar.actual_periods
                    FROM detention_history dh
                    JOIN attendance_students s ON dh.user_login = s.user_login
                    LEFT JOIN attendance_records ar ON dh.session_id = ar.session_id AND dh.user_login = ar.user_login
                    WHERE 1=1
                """
        params = []

        if user_login:
            sql += " AND dh.user_login = %s"
            params.append(user_login)

        if start_date:
            sql += " AND dh.detention_date >= %s"
            params.append(start_date)

        if end_date:
            sql += " AND dh.detention_date <= %s"
            params.append(end_date)

        if completed is not None:
            sql += " AND dh.completed = %s"
            params.append(completed)

        sql += " ORDER BY dh.detention_date DESC, s.class_name, s.class_number"

        cursor.execute(sql, params)
        history = cursor.fetchall()

        return {"success": True, "history": history}


@router.get("/detention-summary/{user_login}")
async def get_detention_summary(
        user_login: str,
        user_info=Depends(verify_admin_or_teacher)
):
    """获取学生留堂汇总"""
    with get_db() as db:
        cursor = db.cursor(pymysql.cursors.DictCursor)

        # 获取学生信息
        cursor.execute("""
            SELECT * FROM attendance_students WHERE user_login = %s
        """, (user_login,))
        student = cursor.fetchone()

        if not student:
            raise HTTPException(status_code=404, detail="学生不存在")

        # 获取留堂统计
        cursor.execute("""
            SELECT 
                COUNT(*) as total_count,
                SUM(CASE WHEN completed = TRUE THEN 1 ELSE 0 END) as completed_count,
                SUM(duration_minutes) as total_minutes
            FROM detention_history 
            WHERE user_login = %s
        """, (user_login,))
        stats = cursor.fetchone()

        # 获取最近的留堂记录
        cursor.execute("""
            SELECT * FROM detention_history 
            WHERE user_login = %s 
            ORDER BY detention_date DESC 
            LIMIT 10
        """, (user_login,))
        recent = cursor.fetchall()

        return {
            "success": True,
            "student": student,
            "stats": stats,
            "recent_history": recent
        }


# ---------- 导出Excel ----------

@router.get("/detention/export/{session_id}")
async def export_detention_excel(
        session_id: int,
        user_info: dict = Depends(verify_token_from_query_or_header)
):
    """导出留堂记录到Excel（支持开放模式）"""
    if not EXCEL_AVAILABLE:
        raise HTTPException(status_code=500, detail="Excel导出功能不可用")

    with get_db() as db:
        cursor = db.cursor(pymysql.cursors.DictCursor)

        # 获取会话信息
        cursor.execute("SELECT * FROM attendance_sessions WHERE id = %s", (session_id,))
        session = cursor.fetchone()

        if not session:
            raise HTTPException(status_code=404, detail="会话不存在")

        # 仅允许导出留堂会话
        if session.get('session_type') != 'detention':
            raise HTTPException(status_code=400, detail="该会话不是留堂会话")

        is_open_mode = session.get('open_mode', False)

        # 直接从签到记录获取
        cursor.execute("""
            SELECT ar.user_login, s.class_name, s.class_number, 
                   s.english_name, s.chinese_name,
                   ar.scan_time, ar.checkout_time, ar.status,
                   ar.planned_periods, ar.planned_minutes, ar.actual_minutes, ar.actual_periods,
                   ar.detention_reason
            FROM attendance_records ar
            JOIN attendance_students s ON ar.user_login = s.user_login
            WHERE ar.session_id = %s
            ORDER BY s.class_name, s.class_number
        """, (session_id,))
        records = cursor.fetchall()

        # 创建Excel
    wb = Workbook()
    ws = wb.active
    ws.title = "留堂记录"

    # 样式
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    green_fill = PatternFill(start_color="92D050", end_color="92D050", fill_type="solid")
    orange_fill = PatternFill(start_color="FFC000", end_color="FFC000", fill_type="solid")
    red_fill = PatternFill(start_color="FF0000", end_color="FF0000", fill_type="solid")
    gray_fill = PatternFill(start_color="BFBFBF", end_color="BFBFBF", fill_type="solid")
    # 原因颜色
    homework_fill = PatternFill(start_color="9BC2E6", end_color="9BC2E6", fill_type="solid")  # 蓝色-功课
    morning_fill = PatternFill(start_color="FFE699", end_color="FFE699", fill_type="solid")  # 黄色-晨读
    other_reason_fill = PatternFill(start_color="D9D9D9", end_color="D9D9D9", fill_type="solid")  # 灰色-其他
    thin_border = Border(
        left=Side(style='thin'), right=Side(style='thin'),
        top=Side(style='thin'), bottom=Side(style='thin')
    )

    # 标题
    ws['A1'] = "留堂记录"
    ws['A1'].font = Font(bold=True, size=14)
    ws.merge_cells('A1:L1')
    ws['A2'] = f"日期: {session['session_date']}"

    # 表头
    headers = ['班级', '班号', '学号', '英文名', '中文名', '签到时间', '签退时间',
               '计划时长', '实际分钟', '实际节数', '状态', '原因']
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=4, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center')
        cell.border = thin_border

    # 统计
    completed_count = 0
    incomplete_count = 0
    absent_count = 0

    # 写入数据
    for row_idx, record in enumerate(records, 5):
        status = record.get('status') or 'absent'

        # 状态中文和颜色
        fill = None
        if status == 'detention_completed':
            # 根据是否使用分钟计时来判断完成状态
            planned_mins = record.get('planned_minutes')
            actual_mins = record.get('actual_minutes') or 0
            planned_periods = record.get('planned_periods') or 0
            actual_periods = record.get('actual_periods') or 0

            if planned_mins is not None:
                # 分钟计时模式：按分钟判断
                is_completed = actual_mins >= planned_mins
            else:
                # 节数计时模式：按节数判断
                is_completed = actual_periods >= planned_periods

            if is_completed:
                status_cn = '已完成'
                fill = green_fill
                completed_count += 1
            else:
                status_cn = '未完成'
                fill = orange_fill
                incomplete_count += 1
        elif status == 'detention_active':
            status_cn = '进行中'
            # 不填充颜色
        else:
            status_cn = '未签到'
            fill = gray_fill
            absent_count += 1

        scan_time = record['scan_time'].strftime("%H:%M:%S") if record.get('scan_time') else '-'
        checkout_time = record['checkout_time'].strftime("%H:%M:%S") if record.get('checkout_time') else '-'

        # 获取原因显示文字
        reason = record.get('detention_reason') or ''
        if reason == 'homework':
            reason_display = '功课'
        elif reason == 'morning':
            reason_display = '晨读'
        elif reason:
            reason_display = reason
        else:
            reason_display = '未知'

        # 计划时长显示：如果有分钟数则显示分钟，否则显示节数
        planned_mins_display = record.get('planned_minutes')
        if planned_mins_display is not None:
            planned_display = f"{planned_mins_display}分钟"
        else:
            planned_display = f"{record.get('planned_periods') or 0}节"

        row_data = [
            record.get('class_name'),
            record.get('class_number'),
            record.get('user_login'),
            record.get('english_name'),
            record.get('chinese_name'),
            scan_time,
            checkout_time,
            planned_display,
            record.get('actual_minutes') or 0,
            record.get('actual_periods') or 0,
            status_cn,
            reason_display
        ]

        for col, value in enumerate(row_data, 1):
            cell = ws.cell(row=row_idx, column=col, value=value)
            cell.border = thin_border
            cell.alignment = Alignment(horizontal='center')
            # 状态列（第11列）使用状态颜色
            if col <= 11 and fill:
                cell.fill = fill
            # 原因列（第12列）使用原因颜色
            elif col == 12:
                if reason == 'homework':
                    cell.fill = homework_fill
                elif reason == 'morning':
                    cell.fill = morning_fill
                elif reason:
                    cell.fill = other_reason_fill

    # 统计行
    summary_row = len(records) + 6
    ws.cell(row=summary_row, column=1, value="统计").font = Font(bold=True)
    ws.cell(row=summary_row, column=2, value=f"总人数: {len(records)}")
    ws.cell(row=summary_row, column=3, value=f"已完成: {completed_count}").fill = green_fill
    ws.cell(row=summary_row, column=4, value=f"未完成: {incomplete_count}").fill = orange_fill
    ws.cell(row=summary_row, column=5, value=f"未签到: {absent_count}").fill = gray_fill
    # 调整列宽
    column_widths = [8, 6, 15, 20, 15, 12, 12, 10, 10, 10, 12, 10]
    for col, width in enumerate(column_widths, 1):
        ws.column_dimensions[get_column_letter(col)].width = width

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    filename = f"留堂记录_{session['session_date']}.xlsx"

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"}
    )


@router.get("/export/{session_id}")
async def export_session_excel(
        session_id: int,
        user_info=Depends(verify_token_from_query_or_header)
):
    """导出点名记录到Excel"""
    if not EXCEL_AVAILABLE:
        raise HTTPException(status_code=500, detail="Excel导出功能不可用，请安装openpyxl")

    with get_db() as db:
        cursor = db.cursor(pymysql.cursors.DictCursor)

        # 获取会话信息
        cursor.execute("SELECT * FROM attendance_sessions WHERE id = %s", (session_id,))
        session = cursor.fetchone()

        if not session:
            raise HTTPException(status_code=404, detail="会话不存在")

        # 直接从签到记录获取
        cursor.execute("""
            SELECT ar.user_login, s.class_name, s.class_number, 
                   s.english_name, s.chinese_name,
                   ar.scan_time, ar.status, ar.late_minutes, ar.makeup_minutes
            FROM attendance_records ar
            JOIN attendance_students s ON ar.user_login = s.user_login
            WHERE ar.session_id = %s
            ORDER BY s.class_name, s.class_number
        """, (session_id,))
        records = cursor.fetchall()

    # 创建Excel
    wb = Workbook()
    ws = wb.active

    session_type_cn = 'morning' if session['session_type'] == 'morning' else 'detention'
    ws.title = f"{session_type_cn}点名"

    # 标题行样式
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")

    # 状态颜色
    orange_fill = PatternFill(start_color="FFC000", end_color="FFC000", fill_type="solid")  # 迟到 - 橙色
    red_fill = PatternFill(start_color="FF0000", end_color="FF0000", fill_type="solid")  # 严重迟到 - 红色
    green_fill = PatternFill(start_color="92D050", end_color="92D050", fill_type="solid")  # 准时 - 绿色
    gray_fill = PatternFill(start_color="BFBFBF", end_color="BFBFBF", fill_type="solid")  # 缺席 - 灰色

    # 边框
    thin_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )

    # 写入标题
    ws['A1'] = f"{session_type_cn}点名记录"
    ws['A1'].font = Font(bold=True, size=14)
    ws.merge_cells('A1:H1')

    ws['A2'] = f"日期: {session['session_date']}"
    ws['D2'] = f"应到时间: {session['target_time']}"

    # 表头
    headers = ['班级', '班号', '学号', '英文名', '中文名', '签到时间', '状态', '迟到(分钟)', '需补时(分钟)']
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=4, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center')
        cell.border = thin_border

    # 写入数据
    present_count = 0
    late_count = 0
    very_late_count = 0
    absent_count = 0

    for row_idx, record in enumerate(records, 5):
        status = record.get('status') or 'absent'

        # 统计
        if status == 'present':
            present_count += 1
        elif status == 'late':
            late_count += 1
        elif status == 'very_late':
            very_late_count += 1
        else:
            absent_count += 1
        # 状态中文
        status_cn = {
            'present': '准时',
            'late': '迟到',
            'very_late': '严重迟到',
            'absent': '缺席'
        }.get(status, '缺席')

        # 签到时间
        scan_time = record['scan_time'].strftime("%H:%M:%S") if record['scan_time'] else '-'

        row_data = [
            record['class_name'],
            record['class_number'],
            record['user_login'],
            record['english_name'],
            record['chinese_name'],
            scan_time,
            status_cn,
            record['late_minutes'] or 0,
            record['makeup_minutes'] or 0
        ]

        for col, value in enumerate(row_data, 1):
            cell = ws.cell(row=row_idx, column=col, value=value)
            cell.border = thin_border
            cell.alignment = Alignment(horizontal='center')

            # 非登记学生使用浅蓝色背景
            if status == 'late':
                cell.fill = orange_fill
            elif status == 'very_late':
                cell.fill = red_fill
                cell.font = Font(color="FFFFFF")
            elif status == 'present':
                cell.fill = green_fill
            elif status == 'absent':
                cell.fill = gray_fill

        # 统计行
        summary_row = len(records) + 6
        ws.cell(row=summary_row, column=1, value="统计").font = Font(bold=True)
        ws.cell(row=summary_row, column=2, value=f"应到: {len(records)}")
        ws.cell(row=summary_row, column=3, value=f"准时: {present_count}").fill = green_fill
        ws.cell(row=summary_row, column=4, value=f"迟到: {late_count}").fill = orange_fill
        ws.cell(row=summary_row, column=5, value=f"严重迟到: {very_late_count}").fill = red_fill
        ws.cell(row=summary_row, column=6, value=f"缺席: {absent_count}").fill = gray_fill
    # 调整列宽
    column_widths = [8, 6, 15, 20, 15, 12, 12, 12, 12]
    for col, width in enumerate(column_widths, 1):
        ws.column_dimensions[get_column_letter(col)].width = width

    # 保存到内存
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    filename = f"{session_type_cn}点名_{session['session_date']}.xlsx"

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"}
    )


# ========== 点名记录导出管理 API ==========

# 导出文件存储目录（相对当前项目运行目录）
EXPORTS_DIR = "attendance_exports"

# 确保目录存在
try:
    if not os.path.exists(EXPORTS_DIR):
        os.makedirs(EXPORTS_DIR)
except Exception as _e:
    # 目录创建失败不应阻塞服务启动；后续保存时会返回错误
    logger.error(f"创建导出目录失败: {_e}")


class ExportSaveRequest(BaseModel):
    """保存导出请求"""
    session_id: int
    notes: Optional[str] = None


def _extract_username_display_name(user_info) -> (str, str):
    """兼容不同的 user_info 形态：dict 或 tuple/list"""
    username = 'unknown'
    display_name = 'unknown'

    # 常见：dict 形式
    if isinstance(user_info, dict):
        username = user_info.get('username') or user_info.get('user_login') or user_info.get('sub') or 'unknown'
        display_name = user_info.get('display_name') or user_info.get('name') or username
        return username, display_name

    # 你现有代码大量使用 user_info[0]
    if isinstance(user_info, (list, tuple)) and len(user_info) >= 1:
        username = user_info[0] or 'unknown'
        display_name = username
        return username, display_name

    return username, display_name


@router.post("/exports/save")
async def save_attendance_export(
        request: ExportSaveRequest,
        user_info: dict = Depends(verify_admin_or_teacher)
):
    """
    保存点名记录到服务器（带完整样式）
    """
    username, display_name = _extract_username_display_name(user_info)

    try:
        with get_db() as db:
            cursor = db.cursor(pymysql.cursors.DictCursor)

            # 获取会话信息
            cursor.execute("""
                SELECT id, session_type, session_date, created_by, target_time, open_mode
                FROM attendance_sessions
                WHERE id = %s
            """, (request.session_id,))
            session = cursor.fetchone()

            if not session:
                return {"success": False, "message": "会话不存在"}

            session_type = session['session_type']
            session_date = session['session_date']

            # 创建 Excel
            wb = Workbook()
            ws = wb.active

            # 样式定义
            header_font = Font(bold=True, color="FFFFFF")
            header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
            green_fill = PatternFill(start_color="92D050", end_color="92D050", fill_type="solid")
            orange_fill = PatternFill(start_color="FFC000", end_color="FFC000", fill_type="solid")
            red_fill = PatternFill(start_color="FF0000", end_color="FF0000", fill_type="solid")
            gray_fill = PatternFill(start_color="BFBFBF", end_color="BFBFBF", fill_type="solid")
            thin_border = Border(
                left=Side(style='thin'), right=Side(style='thin'),
                top=Side(style='thin'), bottom=Side(style='thin')
            )

            # 统计变量
            student_count = 0
            present_count = 0
            late_count = 0
            absent_count = 0

            if session_type == 'morning':
                ws.title = "早读点名"

                # 获取登记学生记录
                cursor.execute("""
                                    SELECT s.chinese_name, s.english_name, s.class_name, s.class_number, s.user_login,
                                           r.scan_time, r.status, r.late_minutes, r.makeup_minutes
                                    FROM attendance_session_students ss
                    JOIN attendance_students s ON ss.user_login = s.user_login
                    LEFT JOIN attendance_records r ON ss.session_id = r.session_id AND ss.user_login = r.user_login
                    WHERE ss.session_id = %s
                    ORDER BY s.class_name, s.class_number
                """, (request.session_id,))
                registered_records = cursor.fetchall()

                records = list(registered_records)
                # 标题
                ws['A1'] = "早读点名记录"
                ws['A1'].font = Font(bold=True, size=14)
                ws.merge_cells('A1:I1')
                ws['A2'] = f"日期: {session_date}"
                ws['D2'] = f"应到时间: {session['target_time']}"

                # 表头
                headers = ['班级', '班号', '学号', '英文名', '中文名', '签到时间', '状态', '迟到(分钟)', '需补时(分钟)']
                for col, header in enumerate(headers, 1):
                    cell = ws.cell(row=4, column=col, value=header)
                    cell.font = header_font
                    cell.fill = header_fill
                    cell.alignment = Alignment(horizontal='center')
                    cell.border = thin_border

                # 数据和统计
                very_late_count = 0

                for row_idx, record in enumerate(records, 5):
                    status = record.get('status') or 'absent'

                    # 统计
                    if status == 'present':
                        present_count += 1
                    elif status == 'late':
                        late_count += 1
                    elif status == 'very_late':
                        very_late_count += 1
                    else:
                        absent_count += 1

                    # 状态中文
                    status_cn = {'present': '准时', 'late': '迟到', 'very_late': '严重迟到', 'absent': '缺席'}.get(
                        status, '缺席')

                    scan_time = record['scan_time'].strftime("%H:%M:%S") if record.get('scan_time') else '-'

                    row_data = [
                        record['class_name'], record['class_number'], record['user_login'],
                        record['english_name'], record['chinese_name'], scan_time, status_cn,
                        record['late_minutes'] or 0, record['makeup_minutes'] or 0
                    ]

                    for col, value in enumerate(row_data, 1):
                        cell = ws.cell(row=row_idx, column=col, value=value)
                        cell.border = thin_border
                        cell.alignment = Alignment(horizontal='center')

                        # 设置颜色
                        if status == 'present':
                            cell.fill = green_fill
                        elif status == 'late':
                            cell.fill = orange_fill
                        elif status == 'very_late':
                            cell.fill = red_fill
                            cell.font = Font(color="FFFFFF")
                        elif status == 'absent':
                            cell.fill = gray_fill

                # 统计行
                student_count = len(records)
                present_count = present_count + late_count + very_late_count  # 实到 = 准时+迟到+严重迟到
                late_count = late_count + very_late_count

                summary_row = len(records) + 6
                ws.cell(row=summary_row, column=1, value="统计").font = Font(bold=True)
                ws.cell(row=summary_row, column=2, value=f"应到: {len(records)}")
                ws.cell(row=summary_row, column=3, value=f"准时: {present_count - late_count}").fill = green_fill
                ws.cell(row=summary_row, column=4, value=f"迟到: {late_count}").fill = orange_fill
                ws.cell(row=summary_row, column=5, value=f"缺席: {absent_count}").fill = gray_fill
                # 列宽
                column_widths = [8, 6, 15, 20, 15, 12, 14, 12, 12]
                for col, width in enumerate(column_widths, 1):
                    ws.column_dimensions[get_column_letter(col)].width = width

            else:
                # 留堂点名
                ws.title = "留堂点名"

                cursor.execute("""
                                                    SELECT s.chinese_name, s.english_name, s.class_name, s.class_number, s.user_login,
                                                           r.scan_time, r.checkout_time, r.status, r.planned_periods, r.planned_minutes, r.actual_periods, r.actual_minutes,
                                                           r.detention_reason
                                    FROM attendance_session_students ss
                                    JOIN attendance_students s ON ss.user_login = s.user_login
                                    LEFT JOIN attendance_records r ON ss.session_id = r.session_id AND ss.user_login = r.user_login
                                    WHERE ss.session_id = %s
                                    ORDER BY s.class_name, s.class_number
                                """, (request.session_id,))
                records = cursor.fetchall()

                # 原因颜色定义
                homework_fill = PatternFill(start_color="9BC2E6", end_color="9BC2E6", fill_type="solid")  # 蓝色-功课
                morning_fill = PatternFill(start_color="FFE699", end_color="FFE699", fill_type="solid")  # 黄色-晨读
                other_reason_fill = PatternFill(start_color="D9D9D9", end_color="D9D9D9", fill_type="solid")  # 灰色-其他

                # 标题
                ws['A1'] = "留堂点名记录"
                ws['A1'].font = Font(bold=True, size=14)
                ws.merge_cells('A1:L1')
                ws['A2'] = f"日期: {session_date}"

                # 表头
                headers = ['班级', '班号', '学号', '英文名', '中文名', '签到时间', '签退时间', '计划时长', '实际分钟',
                           '实际节数', '状态', '原因']
                for col, header in enumerate(headers, 1):
                    cell = ws.cell(row=4, column=col, value=header)
                    cell.font = header_font
                    cell.fill = header_fill
                    cell.alignment = Alignment(horizontal='center')
                    cell.border = thin_border

                # 统计
                completed_count = 0
                incomplete_count = 0

                for row_idx, record in enumerate(records, 5):
                    status = record.get('status') or 'absent'

                    # 状态和颜色
                    fill = None
                    if status == 'detention_completed':
                        # 根据是否使用分钟计时来判断完成状态
                        planned_mins = record.get('planned_minutes')
                        actual_mins = record.get('actual_minutes') or 0
                        planned_periods = record.get('planned_periods') or 0
                        actual_periods = record.get('actual_periods') or 0

                        if planned_mins is not None:
                            # 分钟计时模式
                            is_completed = actual_mins >= planned_mins
                        else:
                            # 节数计时模式
                            is_completed = actual_periods >= planned_periods

                        if is_completed:
                            status_cn = '已完成'
                            fill = green_fill
                            completed_count += 1
                            present_count += 1
                        else:
                            status_cn = '未完成'
                            fill = orange_fill
                            incomplete_count += 1
                            present_count += 1
                    elif status == 'detention_active':
                        status_cn = '进行中'
                        present_count += 1
                    else:
                        status_cn = '未签到'
                        fill = gray_fill
                        absent_count += 1

                    scan_time = record['scan_time'].strftime("%H:%M:%S") if record.get('scan_time') else '-'
                    checkout_time = record['checkout_time'].strftime("%H:%M:%S") if record.get('checkout_time') else '-'

                    # ↓↓↓ 这段代码必须在 row_data 之前 ↓↓↓
                    # 获取原因显示文字
                    reason = record.get('detention_reason') or ''
                    if reason == 'homework':
                        reason_display = '功课'
                    elif reason == 'morning':
                        reason_display = '晨读'
                    elif reason:
                        reason_display = reason
                    else:
                        reason_display = '未知'
                    # ↑↑↑ 这段代码必须在 row_data 之前 ↑↑↑

                    # 计划时长显示：如果有分钟数则显示分钟，否则显示节数
                    planned_mins_display = record.get('planned_minutes')
                    if planned_mins_display is not None:
                        planned_display = f"{planned_mins_display}分钟"
                    else:
                        planned_display = f"{record.get('planned_periods') or 0}节"

                    row_data = [
                        record['class_name'], record['class_number'], record['user_login'],
                        record['english_name'], record['chinese_name'], scan_time, checkout_time,
                        planned_display, record.get('actual_minutes') or 0,
                                         record.get('actual_periods') or 0, status_cn, reason_display
                    ]

                    for col, value in enumerate(row_data, 1):
                        cell = ws.cell(row=row_idx, column=col, value=value)
                        cell.border = thin_border
                        cell.alignment = Alignment(horizontal='center')
                        # 状态列(1-11)使用状态颜色
                        if col <= 11 and fill:
                            cell.fill = fill
                        # 原因列(第12列)使用原因颜色
                        elif col == 12:
                            if reason == 'homework':
                                cell.fill = homework_fill
                            elif reason == 'morning':
                                cell.fill = morning_fill
                            elif reason:
                                cell.fill = other_reason_fill

                student_count = len(records)
                late_count = incomplete_count

                # 统计行
                summary_row = len(records) + 6
                ws.cell(row=summary_row, column=1, value="统计").font = Font(bold=True)
                ws.cell(row=summary_row, column=2, value=f"总人数: {len(records)}")
                ws.cell(row=summary_row, column=3, value=f"已完成: {completed_count}").fill = green_fill
                ws.cell(row=summary_row, column=4, value=f"未完成: {incomplete_count}").fill = orange_fill
                ws.cell(row=summary_row, column=5, value=f"未签到: {absent_count}").fill = gray_fill

                # 列宽
                column_widths = [8, 6, 15, 20, 15, 12, 12, 10, 10, 10, 10, 10]
                for col, width in enumerate(column_widths, 1):
                    ws.column_dimensions[get_column_letter(col)].width = width

            # 生成文件名和路径
            type_text = "早读" if session_type == 'morning' else "留堂"
            date_str = session_date.strftime("%Y-%m-%d") if hasattr(session_date, 'strftime') else str(session_date)
            file_display_name = f"{type_text}点名_{date_str}_{display_name}.xlsx"

            file_uuid = str(uuid.uuid4())
            file_path = os.path.join(EXPORTS_DIR, f"{file_uuid}.xlsx")

            # 保存文件
            wb.save(file_path)
            file_size = os.path.getsize(file_path)

            # 记录到数据库
            cursor.execute("""
                INSERT INTO attendance_exports 
                (session_id, session_type, session_date, created_by, created_by_name,
                 file_name, file_path, file_size, student_count, present_count, late_count, absent_count, notes)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                request.session_id, session_type, session_date, username, display_name,
                file_display_name, file_path, file_size, student_count, present_count, late_count, absent_count,
                request.notes
            ))

            db.commit()
            export_id = cursor.lastrowid

            return {
                "success": True,
                "message": "点名记录已保存",
                "export_id": export_id,
                "file_name": file_display_name
            }

    except Exception as e:
        logger.error(f"保存点名记录失败: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "message": f"保存失败: {str(e)}"}


@router.get("/exports/list")
async def list_attendance_exports(
        page: int = 1,
        page_size: int = 20,
        session_type: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        user_info=Depends(verify_admin_or_teacher)
):
    """获取当前用户的点名导出记录列表（分页/筛选）"""
    username, _display_name = _extract_username_display_name(user_info)

    try:
        with get_db() as db:
            cursor = db.cursor(pymysql.cursors.DictCursor)

            conditions = ["created_by = %s", "is_deleted = FALSE"]
            params: List = [username]

            if session_type and session_type in ('morning', 'detention'):
                conditions.append("session_type = %s")
                params.append(session_type)

            if start_date:
                conditions.append("session_date >= %s")
                params.append(start_date)

            if end_date:
                conditions.append("session_date <= %s")
                params.append(end_date)

            where_clause = " AND ".join(conditions)

            cursor.execute(f"SELECT COUNT(*) as total FROM attendance_exports WHERE {where_clause}", params)
            total = (cursor.fetchone() or {}).get('total', 0)

            offset = (page - 1) * page_size
            cursor.execute(f"""
                SELECT id, session_id, session_type, session_date, created_by_name,
                       file_name, file_size, student_count, present_count, late_count, absent_count,
                       notes, created_at
                FROM attendance_exports
                WHERE {where_clause}
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
            """, params + [page_size, offset])

            records = cursor.fetchall() or []

            for r in records:
                if r.get('session_date'):
                    r['session_date'] = r['session_date'].strftime("%Y-%m-%d") if hasattr(r['session_date'],
                                                                                          'strftime') else str(
                        r['session_date'])
                if r.get('created_at'):
                    r['created_at'] = r['created_at'].strftime("%Y-%m-%d %H:%M") if hasattr(r['created_at'],
                                                                                            'strftime') else str(
                        r['created_at'])

            return {
                "success": True,
                "total": total,
                "page": page,
                "page_size": page_size,
                "total_pages": (total + page_size - 1) // page_size,
                "records": records
            }

    except Exception as e:
        logger.error(f"获取点名记录列表失败: {e}")
        return {"success": False, "message": str(e), "records": []}


@router.get("/exports/download/{export_id}")
async def download_attendance_export(
        export_id: int,
        user_info=Depends(verify_admin_or_teacher)
):
    """下载点名导出Excel（仅允许下载自己创建的记录）"""
    username, _display_name = _extract_username_display_name(user_info)

    try:
        with get_db() as db:
            cursor = db.cursor(pymysql.cursors.DictCursor)

            cursor.execute("""
                SELECT file_path, file_name FROM attendance_exports
                WHERE id = %s AND created_by = %s AND is_deleted = FALSE
            """, (export_id, username))

            record = cursor.fetchone()
            if not record:
                raise HTTPException(status_code=404, detail="记录不存在或无权访问")

            file_path = record.get('file_path')
            file_name = record.get('file_name') or 'attendance_export.xlsx'

            if not file_path or not os.path.exists(file_path):
                raise HTTPException(status_code=404, detail="文件不存在")

            from fastapi.responses import FileResponse
            return FileResponse(
                path=file_path,
                filename=file_name,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"下载点名记录失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/exports/{export_id}")
async def delete_attendance_export(
        export_id: int,
        user_info=Depends(verify_admin_or_teacher)
):
    """删除点名导出记录（软删除，仅允许删除自己创建的记录）"""
    username, _display_name = _extract_username_display_name(user_info)

    try:
        with get_db() as db:
            cursor = db.cursor()

            cursor.execute("""
                UPDATE attendance_exports
                SET is_deleted = TRUE, deleted_at = NOW()
                WHERE id = %s AND created_by = %s AND is_deleted = FALSE
            """, (export_id, username))

            if cursor.rowcount == 0:
                return {"success": False, "message": "记录不存在或无权删除"}

            db.commit()
            return {"success": True, "message": "记录已删除"}

    except Exception as e:
        logger.error(f"删除点名记录失败: {e}")
        return {"success": False, "message": str(e)}


@router.get("/export-detention-history")
async def export_detention_history_excel(
        user_login: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        user_info=Depends(verify_admin_or_teacher)
):
    """导出留堂历史到Excel"""
    if not EXCEL_AVAILABLE:
        raise HTTPException(status_code=500, detail="Excel导出功能不可用")

    with get_db() as db:
        cursor = db.cursor(pymysql.cursors.DictCursor)

        sql = """
            SELECT dh.*, s.english_name, s.chinese_name, s.class_name, s.class_number
            FROM detention_history dh
            JOIN attendance_students s ON dh.user_login = s.user_login
            WHERE 1=1
        """
        params = []

        if user_login:
            sql += " AND dh.user_login = %s"
            params.append(user_login)

        if start_date:
            sql += " AND dh.detention_date >= %s"
            params.append(start_date)

        if end_date:
            sql += " AND dh.detention_date <= %s"
            params.append(end_date)

        sql += " ORDER BY dh.detention_date DESC, s.class_name, s.class_number"

        cursor.execute(sql, params)
        history = cursor.fetchall()

    # 创建Excel
    wb = Workbook()
    ws = wb.active
    ws.title = "留堂历史"

    # 标题样式
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    thin_border = Border(
        left=Side(style='thin'), right=Side(style='thin'),
        top=Side(style='thin'), bottom=Side(style='thin')
    )
    # 原因颜色
    homework_fill = PatternFill(start_color="9BC2E6", end_color="9BC2E6", fill_type="solid")  # 蓝色-功课
    morning_fill = PatternFill(start_color="FFE699", end_color="FFE699", fill_type="solid")  # 黄色-晨读
    other_reason_fill = PatternFill(start_color="D9D9D9", end_color="D9D9D9", fill_type="solid")  # 灰色-其他

    # 表头
    headers = ['日期', '班级', '班号', '学号', '英文名', '中文名', '时长(分钟)', '原因', '已完成', '备注']
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center')
        cell.border = thin_border

    # 数据
    for row_idx, record in enumerate(history, 2):
        reason = record['reason'] or ''
        # 转换原因显示
        if reason == 'homework':
            reason_display = '功课'
        elif reason == 'morning':
            reason_display = '晨读'
        elif reason:
            reason_display = reason
        else:
            reason_display = '未知'

        row_data = [
            str(record['detention_date']),
            record['class_name'],
            record['class_number'],
            record['user_login'],
            record['english_name'],
            record['chinese_name'],
            record['duration_minutes'],
            reason_display,
            '是' if record.get('completed') else '否',
            record['notes'] or ''
        ]

        for col, value in enumerate(row_data, 1):
            cell = ws.cell(row=row_idx, column=col, value=value)
            cell.border = thin_border
            cell.alignment = Alignment(horizontal='center')
            # 只有原因列（第8列）使用原因颜色
            if col == 8:
                if reason == 'homework':
                    cell.fill = homework_fill
                elif reason == 'morning':
                    cell.fill = morning_fill
                elif reason:
                    cell.fill = other_reason_fill

    # 调整列宽
    column_widths = [12, 8, 6, 15, 20, 15, 12, 30, 8, 30]
    for col, width in enumerate(column_widths, 1):
        ws.column_dimensions[get_column_letter(col)].width = width

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    filename = f"留堂历史记录_{datetime.now().strftime('%Y%m%d')}.xlsx"

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"}
    )


# ============ 课外活动 API ============

# ---------- 固定组别管理 ----------

@router.get("/activity-groups")
async def get_activity_groups(user_info=Depends(verify_admin_or_teacher)):
    """获取所有固定组别"""
    try:
        with get_db() as db:
            cursor = db.cursor(pymysql.cursors.DictCursor)
            cursor.execute("""
                SELECT g.id, g.name, g.created_at,
                       COUNT(gs.user_login) as student_count
                FROM activity_groups g
                LEFT JOIN activity_group_students gs ON g.id = gs.group_id
                GROUP BY g.id
                ORDER BY g.name
            """)
            groups = cursor.fetchall()

            return {"success": True, "groups": groups}
    except Exception as e:
        logger.error(f"获取组别失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/activity-groups/{group_id}")
async def get_activity_group(group_id: int, user_info=Depends(verify_admin_or_teacher)):
    """获取组别详情及学生列表"""
    try:
        with get_db() as db:
            cursor = db.cursor(pymysql.cursors.DictCursor)

            # 获取组别信息
            cursor.execute("SELECT * FROM activity_groups WHERE id = %s", (group_id,))
            group = cursor.fetchone()
            if not group:
                raise HTTPException(status_code=404, detail="组别不存在")

            # 获取学生列表
            cursor.execute("""
                SELECT s.* FROM attendance_students s
                JOIN activity_group_students gs ON s.user_login = gs.user_login
                WHERE gs.group_id = %s
                ORDER BY s.class_name, s.class_number
            """, (group_id,))
            students = cursor.fetchall()

            return {"success": True, "group": group, "students": students}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取组别详情失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/activity-groups")
async def create_activity_group(request: ActivityGroupRequest, user_info=Depends(verify_admin_or_teacher)):
    """创建固定组别"""
    username, role = user_info

    try:
        with get_db() as db:
            cursor = db.cursor()

            # 创建组别
            cursor.execute("""
                INSERT INTO activity_groups (name, created_by)
                VALUES (%s, %s)
            """, (request.name, username))
            group_id = cursor.lastrowid

            # 添加学生
            if request.student_ids:
                for user_login in request.student_ids:
                    cursor.execute("""
                        INSERT IGNORE INTO activity_group_students (group_id, user_login)
                        VALUES (%s, %s)
                    """, (group_id, user_login))

            db.commit()
            return {"success": True, "group_id": group_id, "message": f"组别 '{request.name}' 创建成功"}
    except Exception as e:
        logger.error(f"创建组别失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/activity-groups/{group_id}")
async def update_activity_group(group_id: int, request: ActivityGroupRequest,
                                user_info=Depends(verify_admin_or_teacher)):
    """更新组别"""
    try:
        with get_db() as db:
            cursor = db.cursor()

            # 更新名称
            cursor.execute("UPDATE activity_groups SET name = %s WHERE id = %s", (request.name, group_id))

            # 清空并重新添加学生
            cursor.execute("DELETE FROM activity_group_students WHERE group_id = %s", (group_id,))
            for user_login in request.student_ids:
                cursor.execute("""
                    INSERT IGNORE INTO activity_group_students (group_id, user_login)
                    VALUES (%s, %s)
                """, (group_id, user_login))

            db.commit()
            return {"success": True, "message": "组别已更新"}
    except Exception as e:
        logger.error(f"更新组别失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/activity-groups/{group_id}")
async def delete_activity_group(group_id: int, user_info=Depends(verify_admin_or_teacher)):
    """删除组别"""
    try:
        with get_db() as db:
            cursor = db.cursor()
            cursor.execute("DELETE FROM activity_groups WHERE id = %s", (group_id,))
            db.commit()
            return {"success": True, "message": "组别已删除"}
    except Exception as e:
        logger.error(f"删除组别失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ---------- 课外活动会话管理 ----------

@router.post("/activity/sessions")
async def create_activity_session(request: ActivitySessionRequest, user_info=Depends(verify_admin_or_teacher)):
    """创建课外活动会话"""
    username, role = user_info

    if not request.student_ids:
        raise HTTPException(status_code=400, detail="请选择参加活动的学生")

    try:
        with get_db() as db:
            cursor = db.cursor()

            # 创建会话
            cursor.execute("""
                INSERT INTO activity_sessions 
                (session_date, activity_name, start_time, end_time, late_threshold, early_threshold, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                request.session_date,
                request.activity_name,
                request.start_time,
                request.end_time,
                request.late_threshold,
                request.early_threshold,
                username
            ))
            session_id = cursor.lastrowid

            # 添加学生并创建记录
            for user_login in request.student_ids:
                cursor.execute("""
                    INSERT INTO activity_session_students (session_id, user_login)
                    VALUES (%s, %s)
                """, (session_id, user_login))

                cursor.execute("""
                    INSERT INTO activity_records (session_id, user_login)
                    VALUES (%s, %s)
                """, (session_id, user_login))

            db.commit()
            return {
                "success": True,
                "session_id": session_id,
                "message": f"课外活动 '{request.activity_name}' 点名已开始"
            }
    except Exception as e:
        logger.error(f"创建活动会话失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/activity/sessions/{session_id}")
async def get_activity_session(session_id: int, user_info=Depends(verify_admin_or_teacher)):
    """获取课外活动会话详情"""
    try:
        with get_db() as db:
            cursor = db.cursor(pymysql.cursors.DictCursor)

            # 获取会话信息
            cursor.execute("SELECT * FROM activity_sessions WHERE id = %s", (session_id,))
            session = cursor.fetchone()
            if not session:
                raise HTTPException(status_code=404, detail="会话不存在")

            # 获取学生记录
            cursor.execute("""
                SELECT r.*, s.class_name, s.class_number, s.chinese_name, s.english_name
                FROM activity_records r
                JOIN attendance_students s ON r.user_login = s.user_login
                WHERE r.session_id = %s
                ORDER BY s.class_name, s.class_number
            """, (session_id,))
            students = cursor.fetchall()

            # 统计
            stats = {
                "on_time": sum(1 for s in students if s['check_in_status'] == 'on_time'),
                "late": sum(1 for s in students if s['check_in_status'] == 'late'),
                "absent": sum(1 for s in students if s['check_in_status'] == 'not_arrived'),
                "normal_leave": sum(1 for s in students if s['check_out_status'] == 'normal'),
                "early_leave": sum(1 for s in students if s['check_out_status'] == 'early'),
                "still_here": sum(1 for s in students if
                                  s['check_in_status'] != 'not_arrived' and s['check_out_status'] in (
                                      'not_arrived', 'still_here'))
            }

            return {"success": True, "session": session, "students": students, "stats": stats}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取活动会话失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/activity/scan")
async def activity_scan(request: ActivityScanRequest, user_info=Depends(verify_admin_or_teacher)):
    """课外活动拍卡签到"""
    try:
        with get_db() as db:
            cursor = db.cursor(pymysql.cursors.DictCursor)

            # 获取会话信息
            cursor.execute("SELECT * FROM activity_sessions WHERE id = %s AND status = 'active'", (request.session_id,))
            session = cursor.fetchone()
            if not session:
                raise HTTPException(status_code=404, detail="会话不存在或已结束")

            # 查找学生
            cursor.execute("""
                SELECT s.* FROM attendance_students s
                WHERE s.card_id = %s OR s.user_login = %s
            """, (request.card_id, request.card_id))
            student = cursor.fetchone()

            if not student:
                return {"success": False, "message": "未找到该学生"}

            # 检查是否在会话学生列表中
            cursor.execute("""
                SELECT * FROM activity_session_students
                WHERE session_id = %s AND user_login = %s
            """, (request.session_id, student['user_login']))
            if not cursor.fetchone():
                return {"success": False, "message": "该学生不在本次活动名单中"}

            # 获取当前记录
            cursor.execute("""
                SELECT * FROM activity_records
                WHERE session_id = %s AND user_login = %s
            """, (request.session_id, student['user_login']))
            record = cursor.fetchone()

            now = datetime.now()

            if record['check_in_status'] == 'not_arrived':
                # 签到
                # 处理MySQL TIME字段返回timedelta的情况
                start_time_val = session['start_time']
                if isinstance(start_time_val, timedelta):
                    # 将timedelta转换为time
                    total_seconds = int(start_time_val.total_seconds())
                    hours, remainder = divmod(total_seconds, 3600)
                    minutes, seconds = divmod(remainder, 60)
                    start_time_val = time(hours, minutes, seconds)

                start_time = datetime.combine(now.date(), start_time_val)
                late_threshold = start_time + timedelta(minutes=session['late_threshold'])

                is_late = now > late_threshold
                late_minutes = max(0, int((now - start_time).total_seconds() / 60)) if is_late else 0
                status = 'late' if is_late else 'on_time'

                cursor.execute("""
                    UPDATE activity_records
                    SET check_in_time = %s, check_in_status = %s, late_minutes = %s, card_id = %s,
                        check_out_status = 'still_here'
                    WHERE session_id = %s AND user_login = %s
                """, (now, status, late_minutes, request.card_id, request.session_id, student['user_login']))

                db.commit()

                return {
                    "success": True,
                    "action": "checkin",
                    "student": student,
                    "is_late": is_late,
                    "late_minutes": late_minutes,
                    "time": now.strftime("%H:%M:%S"),
                    "message": f"{'迟到' if is_late else '准时'}签到: {student['chinese_name']}"
                }
            else:
                # 已签到，执行签退
                return await activity_checkout_internal(db, cursor, session, student, record, now)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"活动扫描失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def activity_checkout_internal(db, cursor, session, student, record, now):
    """内部签退逻辑"""
    # 处理MySQL TIME字段返回timedelta的情况
    end_time_val = session['end_time']
    if isinstance(end_time_val, timedelta):
        total_seconds = int(end_time_val.total_seconds())
        hours, remainder = divmod(total_seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        end_time_val = time(hours, minutes, seconds)

    end_time = datetime.combine(now.date(), end_time_val)
    early_threshold = end_time - timedelta(minutes=session['early_threshold'])

    is_early = now < early_threshold
    early_minutes = max(0, int((early_threshold - now).total_seconds() / 60)) if is_early else 0
    status = 'early' if is_early else 'normal'

    cursor.execute("""
        UPDATE activity_records
        SET check_out_time = %s, check_out_status = %s, early_minutes = %s
        WHERE session_id = %s AND user_login = %s
    """, (now, status, early_minutes, session['id'], student['user_login']))

    db.commit()

    return {
        "success": True,
        "action": "checkout",
        "student": student,
        "is_early": is_early,
        "early_minutes": early_minutes,
        "time": now.strftime("%H:%M:%S"),
        "message": f"{'早退' if is_early else '正常'}签退: {student['chinese_name']}"
    }


@router.post("/activity/checkout")
async def activity_checkout(request: ActivityCheckoutRequest, user_info=Depends(verify_admin_or_teacher)):
    """课外活动手动签退"""
    try:
        with get_db() as db:
            cursor = db.cursor(pymysql.cursors.DictCursor)

            # 获取会话
            cursor.execute("SELECT * FROM activity_sessions WHERE id = %s", (request.session_id,))
            session = cursor.fetchone()
            if not session:
                raise HTTPException(status_code=404, detail="会话不存在")

            # 获取学生
            cursor.execute("SELECT * FROM attendance_students WHERE user_login = %s", (request.user_login,))
            student = cursor.fetchone()
            if not student:
                raise HTTPException(status_code=404, detail="学生不存在")

            # 获取记录
            cursor.execute("""
                SELECT * FROM activity_records
                WHERE session_id = %s AND user_login = %s
            """, (request.session_id, request.user_login))
            record = cursor.fetchone()

            if not record or record['check_in_status'] == 'not_arrived':
                return {"success": False, "message": "该学生尚未签到"}

            if record['check_out_status'] in ('normal', 'early'):
                return {"success": False, "message": "该学生已签退"}

            now = datetime.now()
            return await activity_checkout_internal(db, cursor, session, student, record, now)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"签退失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/activity/sessions/{session_id}/end")
async def end_activity_session(session_id: int, user_info=Depends(verify_admin_or_teacher)):
    """结束课外活动会话"""
    try:
        with get_db() as db:
            cursor = db.cursor()
            cursor.execute("""
                UPDATE activity_sessions SET status = 'completed' WHERE id = %s
            """, (session_id,))

            # 将未签退的学生标记为仍在
            cursor.execute("""
                UPDATE activity_records
                SET check_out_status = 'still_here'
                WHERE session_id = %s AND check_in_status != 'not_arrived' AND check_out_status = 'not_arrived'
            """, (session_id,))

            db.commit()
            return {"success": True, "message": "活动已结束"}
    except Exception as e:
        logger.error(f"结束活动失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ---------- 课外活动Excel导出 ----------

@router.get("/activity/export/{session_id}")
async def export_activity_excel(
        session_id: int,
        token: str = Query(None),
        credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer(auto_error=False))
):
    """导出课外活动Excel"""
    # 验证token
    await verify_token_from_query_or_header(token, credentials)

    if not EXCEL_AVAILABLE:
        raise HTTPException(status_code=500, detail="Excel导出功能不可用")

    try:
        with get_db() as db:
            cursor = db.cursor(pymysql.cursors.DictCursor)

            # 获取会话信息
            cursor.execute("SELECT * FROM activity_sessions WHERE id = %s", (session_id,))
            session = cursor.fetchone()
            if not session:
                raise HTTPException(status_code=404, detail="会话不存在")

            # 获取记录
            cursor.execute("""
                SELECT r.*, s.class_name, s.class_number, s.chinese_name, s.english_name
                FROM activity_records r
                JOIN attendance_students s ON r.user_login = s.user_login
                WHERE r.session_id = %s
                ORDER BY s.class_name, s.class_number
            """, (session_id,))
            records = cursor.fetchall()

            # 创建Excel
            wb = Workbook()
            ws = wb.active
            ws.title = "课外活动点名"

            # 标题
            ws.merge_cells('A1:H1')
            ws['A1'] = f"{session['activity_name']} - {session['session_date']}"
            ws['A1'].font = Font(bold=True, size=16)
            ws['A1'].alignment = Alignment(horizontal='center')

            # 活动信息
            ws['A2'] = f"应到时间: {session['start_time']} | 结束时间: {session['end_time']}"
            ws['A2'].font = Font(size=11, color="666666")

            # 表头
            headers = ['班级', '学号', '姓名', '签到时间', '签到状态', '签退时间', '签退状态', '备注']
            for col, header in enumerate(headers, 1):
                cell = ws.cell(row=4, column=col, value=header)
                cell.font = Font(bold=True)
                cell.fill = PatternFill(start_color="E0E0E0", end_color="E0E0E0", fill_type="solid")
                cell.alignment = Alignment(horizontal='center')

            # 状态颜色映射
            checkin_colors = {
                'on_time': '34C759',
                'late': 'FF9500',
                'not_arrived': 'FF3B30'
            }
            checkout_colors = {
                'normal': '34C759',
                'early': 'FF9500',
                'still_here': '007AFF',
                'not_arrived': '8E8E93'
            }
            checkin_text = {'on_time': '准时', 'late': '迟到', 'not_arrived': '未到'}
            checkout_text = {'normal': '正常', 'early': '早退', 'still_here': '仍在', 'not_arrived': '-'}

            # 数据行
            for row_idx, record in enumerate(records, 5):
                ws.cell(row=row_idx, column=1, value=f"{record['class_name']}-{record['class_number']}")
                ws.cell(row=row_idx, column=2, value=record['user_login'])
                ws.cell(row=row_idx, column=3, value=record['chinese_name'])

                check_in_time = record['check_in_time'].strftime('%H:%M:%S') if record['check_in_time'] else '-'
                ws.cell(row=row_idx, column=4, value=check_in_time)

                status_cell = ws.cell(row=row_idx, column=5, value=checkin_text.get(record['check_in_status'], '-'))
                color = checkin_colors.get(record['check_in_status'], 'FFFFFF')
                status_cell.fill = PatternFill(start_color=color, end_color=color, fill_type="solid")
                status_cell.font = Font(color="FFFFFF" if record['check_in_status'] != 'not_arrived' else "000000")

                check_out_time = record['check_out_time'].strftime('%H:%M:%S') if record['check_out_time'] else '-'
                ws.cell(row=row_idx, column=6, value=check_out_time)

                checkout_status_cell = ws.cell(row=row_idx, column=7,
                                               value=checkout_text.get(record['check_out_status'], '-'))
                color = checkout_colors.get(record['check_out_status'], 'FFFFFF')
                checkout_status_cell.fill = PatternFill(start_color=color, end_color=color, fill_type="solid")

                ws.cell(row=row_idx, column=8, value=record.get('notes', ''))

            # 调整列宽
            ws.column_dimensions['A'].width = 12
            ws.column_dimensions['B'].width = 15
            ws.column_dimensions['C'].width = 15
            ws.column_dimensions['D'].width = 12
            ws.column_dimensions['E'].width = 10
            ws.column_dimensions['F'].width = 12
            ws.column_dimensions['G'].width = 10
            ws.column_dimensions['H'].width = 20

            # 保存到内存
            output = io.BytesIO()
            wb.save(output)
            output.seek(0)

            filename = f"课外活动_{session['activity_name']}_{session['session_date']}.xlsx"
            encoded_filename = quote(filename)

            return StreamingResponse(
                output,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={
                    "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
                }
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"导出失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class ActivitySessionRequest(BaseModel):
    """课外活动会话请求"""
    session_date: str
    activity_name: str
    start_time: str
    end_time: str
    late_threshold: int = 10
    early_threshold: int = 10
    student_ids: List[str]


class ActivityScanRequest(BaseModel):
    """课外活动扫描请求"""
    session_id: int
    card_id: str


class ActivityCheckoutRequest(BaseModel):
    """课外活动签退请求"""
    session_id: int
    user_login: str


class ActivityGroupRequest(BaseModel):
    """课外活动固定组别请求"""
    name: str
    student_ids: List[str]
# ============ 初始化函数 ============

def setup_attendance_router(app):
    """设置点名系统路由"""
    app.include_router(router)
    logger.info("✅ 点名系统路由已加载")
