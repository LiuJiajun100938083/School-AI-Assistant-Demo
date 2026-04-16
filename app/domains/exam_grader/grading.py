"""
试卷批阅系统 — 纯评分逻辑
===========================
所有函数无外部依赖（不访问数据库、不调 AI），纯输入输出，易测试。
"""

import math
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class AnswerResult:
    """单题评分结果"""
    question_id: int
    student_answer: Optional[str]
    score: Optional[float]
    max_marks: float
    is_correct: Optional[bool] = None  # MC 专用
    feedback: Optional[str] = None


@dataclass
class ExamStatistics:
    """考试统计数据"""
    total_students: int = 0
    graded_count: int = 0
    average_score: Optional[float] = None
    highest_score: Optional[float] = None
    lowest_score: Optional[float] = None
    std_deviation: Optional[float] = None
    score_distribution: Dict[str, int] = field(default_factory=dict)


# ── MC 评分 ──


def grade_mc(student_answer: str, correct_answer: str) -> bool:
    """
    判断 MC 答案是否正确。
    容忍大小写、前后空格、全角/半角。

    >>> grade_mc("B", "b")
    True
    >>> grade_mc(" A ", "A")
    True
    >>> grade_mc("Ｂ", "B")
    True
    """
    if not student_answer or not correct_answer:
        return False
    s = student_answer.strip().upper()
    c = correct_answer.strip().upper()
    # 全角→半角
    s = s.translate(str.maketrans("ＡＢＣＤ", "ABCD"))
    c = c.translate(str.maketrans("ＡＢＣＤ", "ABCD"))
    return s == c


# ── 分值提取 ──


_MARKS_PATTERN = re.compile(
    r"[（(]\s*(\d+(?:\.\d+)?)\s*[分份]\s*[）)]"
)


def extract_marks_from_text(text: str) -> Optional[float]:
    """
    从题目文本提取 "(N分)" 标注。

    >>> extract_marks_from_text("试举一例说明。(2分)")
    2.0
    >>> extract_marks_from_text("请列出三个例子。（4分）")
    4.0
    >>> extract_marks_from_text("没有分值标注的题目")
    """
    if not text:
        return None
    matches = _MARKS_PATTERN.findall(text)
    if matches:
        return float(matches[-1])  # 取最后一个匹配（题目末尾的）
    return None


# ── 分数计算 ──


def calculate_section_score(
    answers: List[Dict[str, Any]],
    section: str,
) -> float:
    """计算某部分的小计（A=甲部 / B=乙部）"""
    total = 0.0
    for ans in answers:
        if ans.get("section") == section and ans.get("score") is not None:
            total += float(ans["score"])
    return total


def calculate_total_score(answers: List[Dict[str, Any]]) -> float:
    """汇总所有题目得分"""
    total = 0.0
    for ans in answers:
        if ans.get("score") is not None:
            total += float(ans["score"])
    return total


# ── 统计 ──


def compute_statistics(scores: List[float], total_students: int = 0) -> ExamStatistics:
    """
    计算考试统计数据。

    >>> stats = compute_statistics([30, 35, 28, 40, 22])
    >>> stats.average_score
    31.0
    >>> stats.highest_score
    40
    """
    if not scores:
        return ExamStatistics(total_students=total_students)

    avg = sum(scores) / len(scores)
    highest = max(scores)
    lowest = min(scores)

    # 标准差
    if len(scores) > 1:
        variance = sum((s - avg) ** 2 for s in scores) / len(scores)
        std_dev = round(math.sqrt(variance), 2)
    else:
        std_dev = 0.0

    # 分数分布（每 10 分一档）
    distribution: Dict[str, int] = {}
    for s in scores:
        bucket = f"{int(s // 10 * 10)}-{int(s // 10 * 10 + 9)}"
        distribution[bucket] = distribution.get(bucket, 0) + 1

    return ExamStatistics(
        total_students=total_students or len(scores),
        graded_count=len(scores),
        average_score=round(avg, 1),
        highest_score=highest,
        lowest_score=lowest,
        std_deviation=std_dev,
        score_distribution=distribution,
    )


# ── 学生匹配 ──


def match_student_to_roster(
    ocr_name: Optional[str],
    ocr_number: Optional[str],
    ocr_class: Optional[str],
    roster: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """
    根据 OCR 识别的学生信息匹配名册。

    roster 已按班级过滤（创建考试时已选班级），因此：
    优先级：学号 > 姓名（兜底）
    学号是结构化数据，手写姓名识别率低，仅作兜底。

    roster 每项: {"id": int, "username": str, "display_name": str,
                  "class_name": str, "student_number": str}
    """
    if not roster:
        return None

    # 1. 学号匹配（最可靠，roster 已是同班学生）
    if ocr_number:
        num_clean = ocr_number.strip().lstrip("0")
        if num_clean:
            for s in roster:
                # 用户表字段是 class_number，student_paper 表是 student_number
                s_num = str(s.get("class_number") or s.get("student_number") or "").strip().lstrip("0")
                if s_num and s_num == num_clean:
                    return s

    # 2. 姓名兜底（学号识别失败时）
    if ocr_name:
        name_clean = ocr_name.strip()
        if name_clean:
            for s in roster:
                s_name = str(s.get("display_name", "")).strip()
                if s_name and (s_name == name_clean
                               or s_name in name_clean
                               or name_clean in s_name):
                    return s

    return None


# ── 题目匹配验证 ──


def verify_questions_match(
    exam_questions: List[Dict[str, Any]],
    answer_sheet_questions: List[Dict[str, Any]],
) -> Tuple[int, int, List[str]]:
    """
    验证答案卷题目是否与考试题目一致。

    Returns:
        (matched_count, total_count, warnings)
    """
    warnings: List[str] = []
    matched = 0
    total = len(exam_questions)

    # 用 (section, question_number) 复合键匹配
    answer_map = {}
    answer_nums = set()
    for aq in answer_sheet_questions:
        sec = str(aq.get("section", "")).strip().upper()
        num = str(aq.get("question_number", "")).strip()
        answer_map[(sec, num)] = aq
        answer_nums.add((sec, num))

    exam_keys = set()
    for eq in exam_questions:
        sec = str(eq.get("section", "")).strip().upper()
        num = str(eq.get("question_number", "")).strip()
        key = (sec, num)
        exam_keys.add(key)
        if key in answer_map:
            matched += 1
        else:
            label = f"{sec}-{num}" if sec else num
            warnings.append(f"题目 {label} 在答案卷中未找到对应答案")

    # 答案卷中多余的题目
    for a_key in answer_nums:
        if a_key not in exam_keys:
            label = f"{a_key[0]}-{a_key[1]}" if a_key[0] else a_key[1]
            warnings.append(f"答案卷中有多余题目: {label}")

    return matched, total, warnings
