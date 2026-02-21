"""
教师班级科目管理路由
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Optional
from pydantic import BaseModel
from datetime import datetime
import logging

from app.core.dependencies import verify_token, require_teacher_or_admin
from app.domains.teacher_class.service import TeacherClassService
from app.domains.analytics.service import AnalyticsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/teacher", tags=["teacher"])

# 服务实例
_tc_service = TeacherClassService()
_analytics_service = AnalyticsService()


class TeacherClassAssignment(BaseModel):
    teacher_id: str
    class_id: str
    subject: str
    is_head_teacher: bool = False


class ClassInfo(BaseModel):
    class_code: str
    class_name: str
    grade: str
    class_type: str = "regular"
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

    try:
        all_students = []

        if role == "teacher":
            teacher_classes = _tc_service.get_teacher_classes(username)
            for class_info in teacher_classes:
                class_students = _tc_service.get_class_students_with_analytics(
                    class_info['class_id']
                )
                all_students.extend(class_students)
        else:
            all_students = _analytics_service.get_all_students_summary()

        # 格式化学生摘要数据
        students_summary = []
        for student in all_students:
            try:
                student_id = student.get('username') or student.get('student_id')

                latest_analysis = _analytics_service.get_latest_student_analysis(student_id)

                summary_data = {
                    'student_id': student_id,
                    'display_name': student.get('display_name', ''),
                    'class_name': student.get('class_name', '未分班'),
                    'risk_level': latest_analysis.get('risk_level', 'unknown') if latest_analysis else 'unknown',
                    'overall_summary': latest_analysis.get('overall_summary', '') if latest_analysis else '',
                    'preview_status': '已分析' if latest_analysis else '待分析',
                    'last_updated': latest_analysis.get('analysis_date') or latest_analysis.get('updated_at') if latest_analysis else None,
                    'active_subjects': student.get('active_subjects', []),
                    'total_conversations': student.get('total_conversations', student.get('conversation_count', 0))
                }

                students_summary.append(summary_data)
            except Exception as e:
                logger.error(f"处理学生 {student.get('username', 'unknown')} 时出错: {e}")
                continue

        # 按风险等级排序
        risk_order = {'high': 0, 'medium': 1, 'low': 2, 'unknown': 3}
        students_summary.sort(key=lambda x: risk_order.get(x['risk_level'], 3))

        return {
            'students': students_summary,
            'total': len(students_summary),
            'summary_generated_at': datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"获取学生摘要失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {
            'students': [],
            'total': 0,
            'error': str(e)
        }


@router.get("/my-classes")
async def get_my_classes(user_info=Depends(verify_token)):
    """获取教师负责的班级和科目"""
    username, role = user_info

    if role not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="需要教师权限")

    assignments = _tc_service.get_teacher_assignments(username)

    return {
        "teacher_id": username,
        "assignments": assignments,
        "total_classes": len(assignments),
        "subjects": list(set(
            a.get('subject_code', a.get('subject', ''))
            for a in assignments
        ))
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

    success = _tc_service.assign_teacher(
        teacher_id=assignment.teacher_id,
        class_id=assignment.class_id,
        subject=assignment.subject,
        is_head_teacher=assignment.is_head_teacher
    )

    if success:
        logger.info(f"分配教师 {assignment.teacher_id} 到班级 {assignment.class_id} 教授 {assignment.subject}")
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

    if role == "teacher":
        if not _tc_service.is_teacher_of_class(username, class_id):
            raise HTTPException(status_code=403, detail="您无权查看该班级")

    # 构建班级概览报告
    students = _tc_service.get_class_students_with_analytics(class_id)
    warnings = _tc_service.get_class_warnings(class_id)
    report = {
        "class_id": class_id,
        "total_students": len(students),
        "students": students,
        "warnings": warnings,
        "generated_at": datetime.now().isoformat(),
    }

    if subject:
        subject_analysis = _tc_service.analyze_class_subject_performance(
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

    if role == "teacher":
        if not _tc_service.is_teacher_of_class(username, class_id):
            raise HTTPException(status_code=403, detail="您无权查看该班级")

    students = _tc_service.get_class_students_with_analytics(class_id)

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

    if role == "teacher":
        if not _tc_service.is_teacher_of_class(username, class_id):
            raise HTTPException(status_code=403, detail="您无权查看该班级")

    # 构建学生个人学习档案
    latest = _analytics_service.get_latest_student_analysis(student_id)
    portfolio = {
        "student_id": student_id,
        "report": latest or {},
        "generated_at": datetime.now().isoformat(),
    }

    portfolio['class_info'] = {
        'class_id': class_id,
        'class_ranking': _tc_service.get_student_ranking(student_id, class_id),
        'peer_comparison': _tc_service.get_classmate_comparison(student_id, class_id)
    }

    return portfolio


@router.get("/subjects/distribution")
async def get_subject_distribution(user_info=Depends(require_teacher_or_admin)):
    """获取各科目的教师和班级分布"""
    username, role = user_info

    distribution = _tc_service.get_teacher_distribution()

    return {
        "subjects": distribution,
        "summary": {
            "total_subjects": len(distribution),
            "total_assignments": sum(len(s['teachers']) for s in distribution.values()),
            "coverage": _tc_service.get_subject_coverage()
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
        success = _tc_service.assign_teacher(
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
        classes = _tc_service.get_teacher_classes(username)
        warnings = []
        for class_info in classes:
            class_warnings = _tc_service.get_class_warnings(
                class_info['class_id']
            )
            warnings.extend(class_warnings)
    else:
        warnings = _tc_service.get_all_warnings()

    warnings.sort(key=lambda x: {'high': 0, 'medium': 1, 'low': 2}.get(x.get('severity', 'low'), 2))

    return {
        "total_warnings": len(warnings),
        "high_priority": [w for w in warnings if w.get('severity') == 'high'],
        "medium_priority": [w for w in warnings if w.get('severity') == 'medium'],
        "low_priority": [w for w in warnings if w.get('severity') == 'low'],
        "warnings": warnings[:50]
    }
