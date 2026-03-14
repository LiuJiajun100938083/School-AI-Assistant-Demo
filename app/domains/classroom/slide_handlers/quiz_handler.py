"""
测验幻灯片处理器

支持选择题(mc)、填空题(fill)、判断题(tf)。
逐题答题流程：老师控制节奏，每题揭示答案后再下一题，最后显示全部排名。

生命周期：PREPARED → ACTIVATED → RESPONDING → CLOSED → RESULTS_SHOWN → COMPLETED
逐题子流程由 QuizRuntime.phase (answering / reveal) 管理。
"""

from typing import Optional

from pydantic import BaseModel

from app.domains.classroom.slide_configs import QuizRuntime, QuizSlideConfig

from .base import SlideHandler


class QuizSlideHandler(SlideHandler):

    def validate_config(self, config: dict) -> BaseModel:
        return QuizSlideConfig(**config)

    # ── Lifecycle ─────────────────────────────────────────

    def get_allowed_lifecycle(self) -> list[str]:
        return [
            "prepared", "activated", "responding",
            "closed", "results_shown", "completed",
        ]

    def get_allowed_transitions(self) -> dict[str, list[str]]:
        return {
            "activate": ["prepared"],
            "open_responses": ["activated"],
            "close_responses": ["responding"],
            "show_results": ["closed"],
            "complete": ["results_shown"],
        }

    def get_auto_transitions(self) -> dict[str, str]:
        return {}

    # ── Runtime Meta ─────────────────────────────────────

    def get_initial_runtime_meta(self) -> Optional[dict]:
        return QuizRuntime().model_dump()

    def parse_runtime_meta(self, meta: Optional[dict]) -> Optional[QuizRuntime]:
        if meta is None:
            return None
        return QuizRuntime(**meta)

    # ── Per-Question Logic ───────────────────────────────

    def record_answer(
        self, runtime: QuizRuntime, username: str, question_id: str, answer: str
    ) -> bool:
        """记录单题答案到 runtime_meta。返回是否为新答案（非重复）。"""
        if username not in runtime.answers:
            runtime.answers[username] = {}
        if question_id in runtime.answers[username]:
            return False  # 已答过（幂等）
        runtime.answers[username][question_id] = answer
        runtime.answer_counts[question_id] = runtime.answer_counts.get(question_id, 0) + 1
        return True

    def get_reveal_data(self, config: QuizSlideConfig, runtime: QuizRuntime) -> dict:
        """揭示当前题目的正确答案 + 各选项统计。"""
        q = config.questions[runtime.current_question_index]
        option_counts: dict[str, int] = {}
        for user_answers in runtime.answers.values():
            ans = user_answers.get(q.id)
            if ans:
                option_counts[ans] = option_counts.get(ans, 0) + 1
        return {
            "question_index": runtime.current_question_index,
            "question_id": q.id,
            "correct_answer": q.correct_answer,
            "option_counts": option_counts,
            "total_answered": runtime.answer_counts.get(q.id, 0),
        }

    def aggregate_final_results(
        self, config: QuizSlideConfig, runtime: QuizRuntime
    ) -> dict:
        """从 runtime_meta 计算所有学生的最终成绩 + 完整排名。"""
        results = []
        for username, user_answers in runtime.answers.items():
            correct_count = 0
            total_score = 0
            for q in config.questions:
                student_ans = user_answers.get(q.id, "")
                if str(student_ans).strip().lower() == str(q.correct_answer).strip().lower():
                    correct_count += 1
                    total_score += q.points
            results.append({
                "username": username,
                "score": total_score,
                "correct_count": correct_count,
                "total_questions": len(config.questions),
            })
        results.sort(key=lambda r: -r["score"])
        for i, r in enumerate(results):
            r["rank"] = i + 1
        return {
            "leaderboard": results,
            "total_participants": len(results),
            "total_questions": len(config.questions),
        }

    # ── Payload ───────────────────────────────────────────

    def build_student_payload(self, slide: dict, session: dict) -> dict:
        config = QuizSlideConfig(**slide["config"])
        runtime = self.parse_runtime_meta(session.get("runtime_meta"))
        q_index = runtime.current_question_index if runtime else 0

        # 发送所有题目（不含 correct_answer），让学生端渲染当前题
        questions_payload = []
        for q in config.questions:
            qd = {
                "id": q.id,
                "type": q.type,
                "text": q.text,
                "options": q.options,
                "image_url": q.image_url,
                "points": q.points,
            }
            questions_payload.append(qd)

        return {
            "slide_id": slide["slide_id"],
            "slide_order": slide["slide_order"],
            "slide_type": "quiz",
            "title": slide.get("title", ""),
            "questions": questions_payload,
            "time_limit": config.time_limit,
            "current_question_index": q_index,
            "phase": runtime.phase if runtime else "answering",
        }

    def build_teacher_view_model(
        self, slide: dict, session: dict, responses: list[dict]
    ) -> dict:
        config = QuizSlideConfig(**slide["config"])
        runtime = self.parse_runtime_meta(session.get("runtime_meta"))
        return {
            "slide_id": slide["slide_id"],
            "slide_type": "quiz",
            "questions": [q.model_dump() for q in config.questions],
            "time_limit": config.time_limit,
            "total_responses": len(responses),
            "results": self.aggregate_results(responses),
            "current_question_index": runtime.current_question_index if runtime else 0,
            "phase": runtime.phase if runtime else "answering",
            "answer_counts": runtime.answer_counts if runtime else {},
            "responses": [
                {
                    "student_username": r["student_username"],
                    "score": r.get("score"),
                    "is_correct": r.get("is_correct"),
                    "responded_at": r.get("responded_at"),
                }
                for r in responses
            ],
        }

    # ── Response ──────────────────────────────────────────

    def handle_response(
        self, slide: dict, student_username: str, data: dict, session: dict
    ) -> dict:
        config = QuizSlideConfig(**slide["config"])
        answers = data.get("answers", {})  # {question_id: student_answer}

        total_score = 0
        total_correct = 0

        for q in config.questions:
            student_ans = str(answers.get(q.id, "")).strip().lower()
            correct_ans = str(q.correct_answer).strip().lower()
            if student_ans == correct_ans:
                total_score += q.points
                total_correct += 1

        return {
            "is_correct": total_correct == len(config.questions),
            "score": float(total_score),
            "extra": {
                "correct_count": total_correct,
                "total_questions": len(config.questions),
            },
        }

    # ── Results ───────────────────────────────────────────

    def aggregate_results(self, responses: list[dict]) -> dict:
        if not responses:
            return {"total_responses": 0, "avg_score": 0, "max_score": 0, "leaderboard": []}

        scores = [float(r.get("score", 0) or 0) for r in responses]

        # Leaderboard: sort by score DESC
        sorted_resp = sorted(
            responses,
            key=lambda r: (-float(r.get("score", 0) or 0), r.get("responded_at", "")),
        )
        leaderboard = []
        for i, r in enumerate(sorted_resp):
            rd = r.get("response_data") or {}
            extra = rd.get("_result_extra", {})
            leaderboard.append({
                "rank": i + 1,
                "username": r.get("student_username", ""),
                "score": float(r.get("score", 0) or 0),
                "correct_count": extra.get("correct_count"),
                "total_questions": extra.get("total_questions"),
            })

        return {
            "total_responses": len(responses),
            "avg_score": round(sum(scores) / len(scores), 1),
            "max_score": max(scores),
            "leaderboard": leaderboard,
        }
