"""
ICT 科目评分策略
================
培僑中學 ICT (電腦科) 试卷格式：
- 甲部: 选择题 (A/B/C/D)，学生在答案格填写
- 乙部: 简答题，手写作答
- 每题分值标注在题目后 "(N分)"
"""

from app.domains.exam_grader.strategies.base import SubjectGradingStrategy


class ICTGradingStrategy(SubjectGradingStrategy):

    @property
    def subject_code(self) -> str:
        return "ict"

    @property
    def subject_name(self) -> str:
        return "電腦科 (ICT)"

    def build_question_extraction_prompt(self, page_count: int = 1) -> str:
        return """你是一位专业的 ICT (電腦科) 试卷分析助手。请仔细分析这份试卷图片，提取所有题目。

试卷结构说明：
- 甲部 (Part A): 选择题 (MC)，每题有 A/B/C/D 四个选项
- 乙部 (Part B): 简答题 / 论述题
- 每题的分值标注在题目后面，格式为 "(N分)" 或 "(共N分)"
- 甲部通常注明 "每题 X 分, 共 Y 分"

请以 JSON 格式输出，严格按以下结构：
```json
{
  "exam_info": {
    "title": "试卷标题（如有）",
    "total_marks": 40,
    "time_limit": "25分鐘"
  },
  "questions": [
    {
      "section": "A",
      "question_number": "1",
      "question_type": "mc",
      "question_text": "完整题目文本",
      "max_marks": 2,
      "mc_options": {
        "A": "选项A文本",
        "B": "选项B文本",
        "C": "选项C文本",
        "D": "选项D文本"
      }
    },
    {
      "section": "B",
      "question_number": "1",
      "question_type": "short_answer",
      "question_text": "完整题目文本（包含子问题如 a), b)）",
      "max_marks": 4,
      "mc_options": null
    }
  ]
}
```

注意事项：
1. question_text 必须包含完整题目，不要截断
2. 选择题的 max_marks 通常为 2 分
3. 简答题的 max_marks 从题目后的 "(N分)" 提取
4. 如果有子问题 (a, b)，合并为一道题，分值为子问题分值之和
5. question_number 按原题号填写
6. 忽略学生的手写答案，只提取印刷的题目内容"""

    def build_answer_sheet_extraction_prompt(self) -> str:
        return """你是一位专业的试卷分析助手。这是一份带有红色批注/标记的 ICT 答案卷。

请提取每道题的正确答案。红色标注通常包括：
- 选择题: 红色圈出或标记的正确选项 (A/B/C/D)
- 简答题: 红色书写的参考答案或得分要点

请以 JSON 格式输出：
```json
{
  "answers": [
    {
      "section": "A",
      "question_number": "1",
      "answer": "B",
      "question_type": "mc"
    },
    {
      "section": "B",
      "question_number": "1",
      "answer": "参考答案的完整文本...",
      "question_type": "short_answer"
    }
  ]
}
```

注意：
1. 选择题答案只需填写选项字母 (A/B/C/D)
2. 简答题答案提取红色标注的完整内容
3. 如果某题没有红色标注，answer 填 null
4. 保持原始题号"""

    def build_answer_generation_prompt(
        self,
        question_text: str,
        question_type: str,
        max_marks: float,
        rag_context: str,
    ) -> str:
        if question_type == "mc":
            return f"""你是一位 ICT 教师。根据以下知识库内容，判断这道选择题的正确答案。

题目：
{question_text}

相关知识库内容：
{rag_context}

请只输出正确选项的字母（A、B、C 或 D），不要解释。
输出格式：
```json
{{"answer": "B"}}
```"""
        else:
            return f"""你是一位 ICT 教师。根据以下知识库内容，为这道简答题生成参考答案。

题目（{max_marks}分）：
{question_text}

相关知识库内容：
{rag_context}

要求：
1. 答案必须简洁、专业，直接给出得分要点
2. 不要使用 AI 对话风格（如"好的"、"让我来"等）
3. 按分值安排要点数量（一般每1-2分一个要点）
4. 使用条目式，每个要点一行

输出格式：
```json
{{"answer": "参考答案文本"}}
```"""

    def build_student_ocr_prompt(self) -> str:
        return """你是一位专业的试卷扫描助手。请分析这张学生答卷图片，提取学生的所有答案。

这是一份 ICT (電腦科) 试卷，包含：
1. 甲部 (Part A) 选择题 — 在答案格 (题号行 + 答案行的表格) 中查找学生填写的 A/B/C/D
2. 乙部 (Part B) 简答题 — 在每题下方的空白处查找学生的手写答案

请以 JSON 格式输出：
```json
{
  "mc_answers": {
    "1": "B",
    "2": "D",
    "3": "A"
  },
  "short_answers": {
    "1": "学生手写答案的识别文本...",
    "2": "..."
  }
}
```

注意：
1. mc_answers 的 key 是题号，value 是学生选择的选项字母
2. short_answers 的 key 是乙部的题号
3. 如果某题学生未作答，value 填空字符串 ""
4. 尽量准确识别手写内容，保留原文（包括错别字）
5. 答案格可能在页面底部，是一个表格形式（题号 1-10，答案一行）"""

    def build_student_header_ocr_prompt(self) -> str:
        return """请从这张试卷图片的卷头区域提取学生信息。

卷头通常包含：
- 姓名 (手写)
- 班別 / 班级 (如 "1B", "3A")
- 學號 / 学号 (数字)
- 成績 / 分数 (可能为空)

请以 JSON 格式输出：
```json
{
  "student_name": "识别的姓名",
  "class_name": "1B",
  "student_number": "16"
}
```

注意：
1. 如果某项无法识别，填 null
2. class_name 通常是数字+字母的组合（如 1A, 2B, 3C）
3. student_number 是纯数字"""

    def build_grading_prompt(
        self,
        question_text: str,
        reference_answer: str,
        student_answer: str,
        max_marks: float,
        grading_mode: str,
    ) -> str:
        mode_instruction = {
            "strict": "严格评分：要求答案必须包含所有关键术语和概念，表述准确。缺少关键词即扣分。",
            "moderate": "适中评分：要求答案包含主要概念和要点，允许用不同方式表述相同意思。",
            "lenient": "宽松评分：只要学生表达了相关概念的核心意思即可得分，不要求特定术语。",
        }.get(grading_mode, "适中评分：要求答案包含主要概念和要点。")

        return f"""你是一位 ICT 教师，请评判这道简答题。

题目（满分 {max_marks} 分）：
{question_text}

参考答案：
{reference_answer}

学生答案：
{student_answer}

评分标准：
{mode_instruction}

请以 JSON 格式输出：
```json
{{
  "score": 0,
  "feedback": "简短的评分理由（一句话）"
}}
```

规则：
1. score 必须是 0 到 {max_marks} 之间的数字（可以是 0.5 的倍数）
2. 如果学生未作答或答案为空，score = 0
3. feedback 用中文，简洁说明得分/扣分原因
4. 不要给出超过满分的分数"""
