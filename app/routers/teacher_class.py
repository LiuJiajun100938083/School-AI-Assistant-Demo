"""
教师班级科目管理路由
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Optional
from pydantic import BaseModel
from datetime import datetime
import logging
import json

from app.core.dependencies import verify_token, require_teacher_or_admin
from enhanced_analytics_llm import enhanced_analytics

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/teacher", tags=["teacher"])


class TeacherClassAssignment(BaseModel):
    teacher_id: str
    class_id: str
    subject: str
    is_head_teacher: bool = False


class ClassInfo(BaseModel):
    class_code: str
    class_name: str
    grade: str
    class_type: str = "regular"  # regular, advanced, remedial
    max_students: int = 50


class StudentClassAssignment(BaseModel):
    student_id: str
    class_id: str


@router.get("/students/summary")
async def get_students_summary(
        user_info=Depends(require_teacher_or_admin)
):
    """获取所有学生的摘要信息（用于管理面板显示）"""
    username, role = user_info

    logger.info(f"=== 开始获取学生摘要 ===")
    logger.info(f"用户: {username}, 角色: {role}")

    try:
        all_students = []

        # 如果是教师，只获取其负责班级的学生
        if role == "teacher":
            logger.info("教师角色：获取负责班级的学生")
            try:
                # 获取教师负责的班级
                logger.info(f"调用 get_teacher_classes({username})")
                teacher_classes = enhanced_analytics.get_teacher_classes(username)
                logger.info(f"教师负责的班级: {teacher_classes}")

                for class_info in teacher_classes:
                    logger.info(f"获取班级 {class_info['class_id']} 的学生")
                    class_students = enhanced_analytics.get_class_students_with_analytics(
                        class_info['class_id']
                    )
                    logger.info(f"班级 {class_info['class_id']} 有 {len(class_students)} 个学生")
                    all_students.extend(class_students)

            except AttributeError as e:
                logger.error(f"AttributeError in teacher section: {e}")
                logger.error(f"enhanced_analytics 类型: {type(enhanced_analytics)}")
                logger.error(f"enhanced_analytics 可用方法: {dir(enhanced_analytics)}")
                raise

        else:
            logger.info("管理员角色：获取所有学生")

            # 检查 enhanced_analytics 对象
            logger.info(f"enhanced_analytics 类型: {type(enhanced_analytics)}")
            logger.info(f"enhanced_analytics 是否有 get_all_students_summary: {hasattr(enhanced_analytics, 'get_all_students_summary')}")

            # 列出所有可用的方法
            available_methods = [method for method in dir(enhanced_analytics) if not method.startswith('_')]
            logger.info(f"enhanced_analytics 可用方法: {available_methods}")

            # 尝试调用方法
            try:
                # 如果方法不存在，使用备用方案
                if hasattr(enhanced_analytics, 'get_all_students_summary'):
                    logger.info("调用 get_all_students_summary()")
                    all_students = enhanced_analytics.get_all_students_summary()
                else:
                    logger.warning("get_all_students_summary 方法不存在，使用备用方案")

                    # 备用方案：直接查询数据库
                    from app.bridge import get_db
                    logger.info("使用备用方案：直接查询数据库")

                    with get_db() as conn:
                        cursor = conn.cursor()

                        # 获取所有学生
                        sql = """
                            SELECT 
                                u.username,
                                u.display_name,
                                u.class_name,
                                u.role,
                                COUNT(DISTINCT c.conversation_id) as total_conversations
                            FROM users u
                            LEFT JOIN conversations c ON u.username = c.username
                            WHERE u.role = 'student'
                            GROUP BY u.username, u.display_name, u.class_name, u.role
                            ORDER BY u.username
                        """
                        logger.info(f"执行SQL: {sql}")
                        cursor.execute(sql)

                        rows = cursor.fetchall()
                        logger.info(f"查询返回 {len(rows)} 条记录")

                        for i, row in enumerate(rows[:3]):  # 只打印前3条作为示例
                            logger.info(f"示例行 {i}: 类型={type(row)}, 内容={row}")

                        for row in rows:
                            if isinstance(row, dict):
                                student_data = {
                                    'username': row.get('username'),
                                    'student_id': row.get('username'),
                                    'display_name': row.get('display_name', ''),
                                    'class_name': row.get('class_name', '未分班'),
                                    'total_conversations': row.get('total_conversations', 0),
                                    'active_subjects': []
                                }
                            else:
                                student_data = {
                                    'username': row[0],
                                    'student_id': row[0],
                                    'display_name': row[1] or '',
                                    'class_name': row[2] or '未分班',
                                    'total_conversations': row[4] or 0,
                                    'active_subjects': []
                                }

                            # 获取活跃科目
                            cursor.execute("""
                                SELECT DISTINCT subject 
                                FROM conversations 
                                WHERE username = %s AND subject IS NOT NULL
                                LIMIT 5
                            """, (student_data['username'],))

                            subjects = cursor.fetchall()
                            if subjects:
                                student_data['active_subjects'] = [
                                    s[0] if not isinstance(s, dict) else s.get('subject')
                                    for s in subjects if s
                                ]

                            all_students.append(student_data)

                    logger.info(f"备用方案成功，获取到 {len(all_students)} 个学生")

            except Exception as e:
                logger.error(f"获取学生数据失败: {e}")
                logger.error(f"错误类型: {type(e)}")
                logger.error(f"错误详情: {str(e)}")
                import traceback
                logger.error(f"堆栈跟踪:\n{traceback.format_exc()}")
                raise

        logger.info(f"总共获取到 {len(all_students)} 个学生")

        # 格式化学生摘要数据
        students_summary = []
        for student in all_students:
            try:
                # 获取最新分析报告（如果有）
                student_id = student.get('username') or student.get('student_id')
                logger.debug(f"获取学生 {student_id} 的最新分析")

                latest_analysis = None
                if hasattr(enhanced_analytics, 'get_latest_student_analysis'):
                    latest_analysis = enhanced_analytics.get_latest_student_analysis(student_id)

                summary_data = {
                    'student_id': student_id,
                    'display_name': student.get('display_name', ''),
                    'class_name': student.get('class_name', '未分班'),
                    'risk_level': latest_analysis.get('risk_level', 'unknown') if latest_analysis else 'unknown',
                    'overall_summary': latest_analysis.get('overall_summary', '') if latest_analysis else '',
                    'preview_status': '已分析' if latest_analysis else '待分析',
                    'last_updated': latest_analysis.get('analysis_date') if latest_analysis else None,
                    'active_subjects': student.get('active_subjects', []),
                    'total_conversations': student.get('total_conversations', 0)
                }

                students_summary.append(summary_data)

            except Exception as e:
                logger.error(f"处理学生 {student.get('username', 'unknown')} 时出错: {e}")
                continue

        # 按风险等级排序（高风险优先）
        risk_order = {'high': 0, 'medium': 1, 'low': 2, 'unknown': 3}
        students_summary.sort(key=lambda x: risk_order.get(x['risk_level'], 3))

        logger.info(f"=== 学生摘要获取完成 ===")
        logger.info(f"返回 {len(students_summary)} 个学生摘要")

        return {
            'students': students_summary,
            'total': len(students_summary),
            'summary_generated_at': datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"获取学生摘要失败: {e}")
        logger.error(f"错误类型: {type(e).__name__}")
        logger.error(f"错误详情: {str(e)}")
        import traceback
        logger.error(f"完整堆栈跟踪:\n{traceback.format_exc()}")

        return {
            'students': [],
            'total': 0,
            'error': str(e),
            'error_type': type(e).__name__,
            'traceback': traceback.format_exc()
        }

@router.get("/my-classes")
async def get_my_classes(user_info=Depends(verify_token)):
    """获取教师负责的班级和科目"""
    username, role = user_info

    if role not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="需要教师权限")

    # 获取教师的班级分配
    assignments = enhanced_analytics.get_teacher_assignments(username)

    return {
        "teacher_id": username,
        "assignments": assignments,
        "total_classes": len(assignments),
        "subjects": list(set(a['subject'] for a in assignments))
    }


@router.post("/assign-class")
async def assign_teacher_to_class(
        assignment: TeacherClassAssignment,
        user_info=Depends(require_teacher_or_admin)
):
    """分配教师到班级科目"""
    username, role = user_info

    if role != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")

    success = enhanced_analytics.assign_teacher_to_class(
        teacher_id=assignment.teacher_id,
        class_id=assignment.class_id,
        subject=assignment.subject,
        is_head_teacher=assignment.is_head_teacher
    )

    if success:
        logger.info(f"✅ 分配教师 {assignment.teacher_id} 到班级 {assignment.class_id} 教授 {assignment.subject}")
        return {"success": True, "message": "教师分配成功"}
    else:
        raise HTTPException(status_code=400, detail="教师分配失败")


@router.get("/class/{class_id}/analytics")
async def get_class_analytics(
        class_id: str,
        subject: Optional[str] = None,
        user_info=Depends(verify_token)
):
    """获取班级学习分析报告"""
    username, role = user_info

    # 检查是否有权限查看该班级
    if role == "teacher":
        if not enhanced_analytics.is_teacher_of_class(username, class_id):
            raise HTTPException(status_code=403, detail="您无权查看该班级")

    # 生成班级分析报告
    report = enhanced_analytics.generate_class_overview_report(class_id)

    # 如果指定了科目，添加科目特定分析
    if subject:
        subject_analysis = enhanced_analytics.analyze_class_subject_performance(
            class_id, subject
        )
        report['subject_analysis'] = subject_analysis

    return report


@router.get("/class/{class_id}/students")
async def get_class_students(
        class_id: str,
        user_info=Depends(verify_token)
):
    """获取班级学生列表及其学习状况"""
    username, role = user_info

    # 权限检查
    if role == "teacher":
        if not enhanced_analytics.is_teacher_of_class(username, class_id):
            raise HTTPException(status_code=403, detail="您无权查看该班级")

    students = enhanced_analytics.get_class_students_with_analytics(class_id)

    return {
        "class_id": class_id,
        "total_students": len(students),
        "students": students
    }


@router.post("/class/{class_id}/student/{student_id}/report")
async def generate_student_report(
        class_id: str,
        student_id: str,
        user_info=Depends(verify_token)
):
    """生成学生个人学习报告"""
    username, role = user_info

    # 权限检查
    if role == "teacher":
        if not enhanced_analytics.is_teacher_of_class(username, class_id):
            raise HTTPException(status_code=403, detail="您无权查看该班级")

    # 生成综合报告
    portfolio = enhanced_analytics.generate_personal_learning_portfolio(student_id)

    # 添加班级相关信息
    portfolio['class_info'] = {
        'class_id': class_id,
        'class_ranking': enhanced_analytics.get_student_class_ranking(student_id, class_id),
        'peer_comparison': enhanced_analytics.compare_with_classmates(student_id, class_id)
    }

    return portfolio


@router.get("/subjects/distribution")
async def get_subject_distribution(user_info=Depends(require_teacher_or_admin)):
    """获取各科目的教师和班级分布"""
    username, role = user_info

    distribution = enhanced_analytics.get_subject_teacher_distribution()

    return {
        "subjects": distribution,
        "summary": {
            "total_subjects": len(distribution),
            "total_assignments": sum(len(s['teachers']) for s in distribution.values()),
            "coverage": enhanced_analytics.calculate_subject_coverage()
        }
    }


@router.post("/batch-assign")
async def batch_assign_teachers(
        assignments: List[TeacherClassAssignment],
        user_info=Depends(require_teacher_or_admin)
):
    """批量分配教师到班级"""
    username, role = user_info

    if role != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")

    results = []
    for assignment in assignments:
        success = enhanced_analytics.assign_teacher_to_class(
            teacher_id=assignment.teacher_id,
            class_id=assignment.class_id,
            subject=assignment.subject,
            is_head_teacher=assignment.is_head_teacher
        )
        results.append({
            "teacher_id": assignment.teacher_id,
            "class_id": assignment.class_id,
            "subject": assignment.subject,
            "success": success
        })

    successful = sum(1 for r in results if r['success'])

    return {
        "total": len(assignments),
        "successful": successful,
        "failed": len(assignments) - successful,
        "details": results
    }


@router.get("/analytics/warnings")
async def get_learning_warnings(
        user_info=Depends(verify_token)
):
    """获取学习预警信息"""
    username, role = user_info

    if role == "teacher":
        # 教师只能看到自己班级的预警
        classes = enhanced_analytics.get_teacher_classes(username)
        warnings = []
        for class_info in classes:
            class_warnings = enhanced_analytics.get_class_learning_warnings(
                class_info['class_id']
            )
            warnings.extend(class_warnings)
    else:
        # 管理员可以看到所有预警
        warnings = enhanced_analytics.get_all_learning_warnings()

    # 按严重程度排序
    warnings.sort(key=lambda x: {'high': 0, 'medium': 1, 'low': 2}[x['severity']])

    return {
        "total_warnings": len(warnings),
        "high_priority": [w for w in warnings if w['severity'] == 'high'],
        "medium_priority": [w for w in warnings if w['severity'] == 'medium'],
        "low_priority": [w for w in warnings if w['severity'] == 'low'],
        "warnings": warnings[:50]  # 返回前50个预警
    }