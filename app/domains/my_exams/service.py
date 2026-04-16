"""
我的考試成績 — Service 層
==============================
業務邏輯：學生查看自己的考試結果、AI 個人分析。
"""

import logging
from typing import Any, Dict, List

from app.core.exceptions import NotFoundError
from app.domains.my_exams.repository import MyExamsRepository

logger = logging.getLogger(__name__)


class MyExamsService:
    """學生考試成績服務"""

    def __init__(self, repo: MyExamsRepository):
        self._repo = repo

    # ── 列表 ──

    def list_exams(self, user_id: int) -> List[Dict[str, Any]]:
        """查詢學生所有已發放的考試"""
        exams = self._repo.find_published_by_user(user_id)
        for e in exams:
            total = float(e.get("total_marks") or 0)
            score = float(e.get("total_score") or 0)
            e["percentage"] = round(score / total * 100, 1) if total > 0 else 0
        return exams

    # ── 詳情 ──

    def get_detail(self, user_id: int, exam_id: int) -> Dict[str, Any]:
        """查詢某場考試的完整結果（試卷 + 答題）"""
        paper = self._repo.find_one_for_user(user_id, exam_id)
        if not paper:
            raise NotFoundError("考試結果", exam_id)

        answers = self._repo.find_answers_for_paper(paper["id"])
        total_marks = float(paper.get("total_marks") or 0)
        total_score = float(paper.get("total_score") or 0)

        return {
            "exam": {
                "id": paper["exam_id"],
                "title": paper.get("exam_title", ""),
                "subject": paper.get("subject", ""),
                "class_name": paper.get("exam_class", ""),
                "total_marks": total_marks,
            },
            "paper": {
                "id": paper["id"],
                "student_name": paper.get("student_name"),
                "student_number": paper.get("student_number"),
                "total_score": total_score,
                "percentage": round(total_score / total_marks * 100, 1) if total_marks > 0 else 0,
                "image_paths": paper.get("image_paths", []),
            },
            "answers": [
                {
                    "id": a["id"],
                    "section": a.get("section", ""),
                    "question_number": a.get("question_number", ""),
                    "question_type": a.get("question_type", ""),
                    "question_text": a.get("question_text", ""),
                    "student_answer": a.get("student_answer", ""),
                    "score": float(a.get("score") or 0),
                    "max_marks": float(a.get("max_marks") or 0),
                    "feedback": a.get("feedback", ""),
                }
                for a in answers
            ],
        }

    # ── AI 個人分析 ──

    async def generate_analysis(self, user_id: int, exam_id: int) -> str:
        """AI 生成個人考試表現分析"""
        from app.infrastructure.ai_pipeline.llm_caller import call_llm_json

        detail = self.get_detail(user_id, exam_id)
        exam = detail["exam"]
        paper = detail["paper"]
        answers = detail["answers"]

        answer_lines = []
        for a in answers:
            label = f"{a['section']}{a['question_number']}"
            q_type = "選擇題" if a["question_type"] == "mc" else "簡答題"
            line = f"  {label}（{q_type}，滿分{a['max_marks']}）得分: {a['score']}"
            if a.get("feedback"):
                line += f"，反饋: {a['feedback']}"
            answer_lines.append(line)

        data_text = f"""考試：{exam['title']}
科目：{exam['subject']}
學生：{paper.get('student_name', '未知')}
總分：{paper['total_score']} / {exam['total_marks']} ({paper['percentage']}%)

各題表現：
{chr(10).join(answer_lines)}"""

        prompt = f"""你是一位友善的教師，請根據以下學生的個人考試數據，撰寫一份個人化的考試表現分析。

{data_text}

要求：
1. 用繁體中文撰寫
2. 以 JSON 格式輸出：{{"analysis": "分析內容"}}
3. 分析需包含（用段落分隔，不用 markdown）：
   - 整體表現評價（鼓勵性語氣，一句話點評）
   - 強項分析（哪些題目做得好）
   - 待改進項（哪些題目失分，需要加強什麼）
   - 學習建議（具體的複習方向和方法，2-3 條）
4. 語氣友善鼓勵，約 150-250 字
5. 對學生直接用「你」稱呼
6. 不要用 * 號、# 號等 markdown 符號"""

        content, _ = await call_llm_json(
            prompt=prompt,
            gate_task="exam_student_analysis",
            gate_priority=3,
            gate_weight=2,
        )
        # 解析 JSON
        parsed = self._safe_parse_json(content)
        return parsed.get("analysis", content)

    @staticmethod
    def _safe_parse_json(text) -> dict:
        """安全解析 JSON（兼容 ```json``` 包裹）"""
        import json
        import re

        if isinstance(text, dict):
            return text
        if not isinstance(text, str):
            text = str(text)
        try:
            return json.loads(text)
        except (json.JSONDecodeError, TypeError):
            pass
        match = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except (json.JSONDecodeError, TypeError):
                pass
        return {"analysis": text}
