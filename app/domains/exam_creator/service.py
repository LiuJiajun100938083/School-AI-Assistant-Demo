"""
AI 考試出題 — 業務邏輯層
==========================
編排出題流程：建 session → 後台 LLM 生成 → SVG/Chart 增強 → 更新結果。

依賴方向：
  service → repository（數據訪問）
  service → ai_pipeline（基礎設施：LLM + SVG + Chart）
  service → SubjectHandlerRegistry（唯讀：prompt 模板 + 知識點判斷）
"""

import json
import logging
import uuid
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class ExamCreatorService:

    def __init__(self, session_repo, knowledge_repo):
        """
        Args:
            session_repo: ExamGenerationSessionRepository
            knowledge_repo: KnowledgePointRepository（共享參考資料，唯讀）
        """
        self._sessions = session_repo
        self._knowledge = knowledge_repo

    # ================================================================
    # Step A: 啟動出題（同步，< 1s 返回）
    # ================================================================

    def start_exam_generation(
        self,
        teacher_username: str,
        subject: str,
        question_count: int = 10,
        difficulty: int = 3,
        target_points: Optional[List[str]] = None,
        question_types: Optional[List[str]] = None,
        exam_context: str = "",
        total_marks: Optional[int] = None,
    ) -> Dict:
        """
        建 session 記錄，解析知識點，返回 session_id + 後台上下文。

        去重保護：同一教師不重複建 generating session。
        """
        # 去重檢查
        existing = self._sessions.find_generating_by_teacher(teacher_username)
        if existing:
            logger.info(
                "複用已有 generating session %s for teacher %s",
                existing["session_id"], teacher_username,
            )
            return {
                "session_id": existing["session_id"],
                "status": "generating",
                "reused": True,
            }

        # 解析知識點
        points_data = self._resolve_knowledge_points(subject, target_points)
        if not points_data:
            raise ValueError(f"找不到科目 {subject} 的知識點")

        # 建構 prompt
        from app.domains.mistake_book.subject_handler import SubjectHandlerRegistry
        handler = SubjectHandlerRegistry.get(subject)
        prompt = handler.build_exam_prompt(
            target_points=points_data,
            question_count=question_count,
            difficulty=difficulty,
            question_types=question_types,
            exam_context=exam_context,
            total_marks=total_marks,
        )

        # 建 session 記錄
        session_id = str(uuid.uuid4())[:12]
        self._sessions.insert({
            "session_id": session_id,
            "teacher_username": teacher_username,
            "subject": subject,
            "status": "generating",
            "question_count": question_count,
            "difficulty": difficulty,
            "total_marks": total_marks,
            "target_points": json.dumps(
                [p["point_code"] for p in points_data], ensure_ascii=False,
            ),
            "question_types": json.dumps(question_types) if question_types else None,
            "exam_context": exam_context,
        })

        logger.info(
            "Exam generation started: session=%s, teacher=%s, subject=%s, "
            "count=%d, difficulty=%d, points=%s",
            session_id, teacher_username, subject, question_count, difficulty,
            [p["point_code"] for p in points_data],
        )

        return {
            "session_id": session_id,
            "status": "generating",
            "reused": False,
            "_bg_context": {
                "prompt": prompt,
                "points_data": points_data,
                "question_count": question_count,
                "difficulty": difficulty,
                "subject": subject,
            },
        }

    # ================================================================
    # Step B: 後台生成（異步 BackgroundTask）
    # ================================================================

    async def generate_exam_background(
        self,
        session_id: str,
        prompt: str,
        subject: str,
        question_count: int,
        difficulty: int,
    ) -> None:
        """
        後台 LLM 生成 + SVG/Chart 增強，更新 session。

        冪等保護：只在 status='generating' 時執行。
        錯誤降級：SVG 失敗不阻塞，只有 LLM/JSON 失敗才標記 generation_failed。
        """
        # 冪等檢查
        session = self._sessions.find_by_session_id(session_id)
        if not session or session["status"] != "generating":
            logger.warning(
                "跳過 exam generation: session=%s, status=%s",
                session_id, session.get("status") if session else "NOT_FOUND",
            )
            return

        try:
            from app.infrastructure.ai_pipeline import (
                call_ollama_json,
                enrich_with_charts,
                enrich_with_svg,
                parse_questions_json,
                sanitize_svg,
            )
            from app.core.ai_gate import Priority, Weight

            # 1. LLM 調用
            import random
            seed = random.randint(1000, 9999)
            full_prompt = prompt + f"\n\n[seed={seed}] 請確保每道題的數值和情境都不同。"

            raw = await call_ollama_json(
                full_prompt,
                temperature=0.7,
                gate_task="exam_generation",
                gate_priority=Priority.URGENT,
                gate_weight=Weight.ANALYSIS,
            )

            # 2. JSON 解析
            questions_data = parse_questions_json(raw)
            questions = questions_data.get("questions", [])

            if not questions:
                raise ValueError("LLM 返回的 JSON 中無 questions 陣列")

            # 3. SVG 幾何增強（fail-soft）
            await enrich_with_svg(questions, subject)

            # 4. Chart 統計圖增強（fail-soft）
            enrich_with_charts(questions, subject)

            # 5. SVG 安全過濾
            for q in questions:
                if "question" in q:
                    q["question"] = sanitize_svg(q["question"])
                if "question_svg" in q:
                    q["question_svg"] = sanitize_svg(q["question_svg"])

            # 6. 更新 session
            self._sessions.update(
                {
                    "questions": json.dumps(questions, ensure_ascii=False),
                    "question_count": len(questions),
                    "status": "generated",
                },
                "session_id = %s AND status = 'generating'",
                (session_id,),
            )
            logger.info(
                "Exam generation completed: session=%s, questions=%d",
                session_id, len(questions),
            )

        except Exception as e:
            error_code = "UNKNOWN_ERROR"
            error_message = str(e)[:500]

            if "timeout" in str(e).lower() or "timed out" in str(e).lower():
                error_code = "LLM_TIMEOUT"
            elif "json" in str(e).lower() or "parse" in str(e).lower():
                error_code = "PARSE_ERROR"

            self._sessions.update(
                {
                    "status": "generation_failed",
                    "error_code": error_code,
                    "error_message": error_message,
                },
                "session_id = %s AND status = 'generating'",
                (session_id,),
            )
            logger.error(
                "Exam generation failed: session=%s, error=%s: %s",
                session_id, error_code, e, exc_info=True,
            )

    # ================================================================
    # 輪詢狀態
    # ================================================================

    def get_generation_status(
        self, session_id: str, teacher_username: str,
    ) -> Optional[Dict]:
        """查詢生成狀態（含 ownership 驗證）。"""
        session = self._sessions.find_by_session_id(session_id)
        if not session or session["teacher_username"] != teacher_username:
            return None

        result = {
            "session_id": session_id,
            "status": session["status"],
            "subject": session["subject"],
            "question_count": session["question_count"],
            "difficulty": session["difficulty"],
            "created_at": str(session["created_at"]) if session.get("created_at") else None,
        }

        if session["status"] == "generated":
            questions = session.get("questions")
            if isinstance(questions, str):
                questions = json.loads(questions)
            result["questions"] = questions or []
            result["total_marks"] = sum(
                q.get("points", 0) for q in (result["questions"] or [])
            )

        elif session["status"] == "generation_failed":
            result["error_code"] = session.get("error_code")
            result["error_message"] = session.get("error_message")
            result["retryable"] = True

        return result

    # ================================================================
    # 編輯單題
    # ================================================================

    def update_question(
        self, session_id: str, teacher_username: str,
        question_index: int, edits: Dict[str, Any],
    ) -> Optional[Dict]:
        """教師編輯生成結果中的某一題。"""
        session = self._sessions.find_by_session_id(session_id)
        if not session or session["teacher_username"] != teacher_username:
            return None
        if session["status"] != "generated":
            raise ValueError("只能編輯已生成完成的題目")

        questions = session.get("questions")
        if isinstance(questions, str):
            questions = json.loads(questions)

        if question_index < 0 or question_index >= len(questions):
            raise ValueError(f"題目索引 {question_index} 超出範圍 (0-{len(questions)-1})")

        # 白名單：只允許更新安全字段
        allowed_fields = {
            "question", "correct_answer", "marking_scheme", "points",
            "question_type", "options", "difficulty", "point_code",
        }
        for key, value in edits.items():
            if key in allowed_fields:
                questions[question_index][key] = value

        self._sessions.update(
            {"questions": json.dumps(questions, ensure_ascii=False)},
            "session_id = %s",
            (session_id,),
        )

        logger.info("Exam question updated: session=%s, index=%d", session_id, question_index)
        return questions[question_index]

    # ================================================================
    # 重新生成單題
    # ================================================================

    async def regenerate_question(
        self, session_id: str, teacher_username: str,
        question_index: int, instruction: str = "",
    ) -> Optional[Dict]:
        """重新生成指定題目，替換原位。"""
        session = self._sessions.find_by_session_id(session_id)
        if not session or session["teacher_username"] != teacher_username:
            return None
        if session["status"] != "generated":
            raise ValueError("只能對已生成完成的 session 重新生成單題")

        questions = session.get("questions")
        if isinstance(questions, str):
            questions = json.loads(questions)

        if question_index < 0 or question_index >= len(questions):
            raise ValueError(f"題目索引 {question_index} 超出範圍")

        old_q = questions[question_index]
        subject = session["subject"]

        # 建構單題 prompt
        from app.domains.mistake_book.subject_handler import SubjectHandlerRegistry
        handler = SubjectHandlerRegistry.get(subject)

        point_data = [{
            "point_code": old_q.get("point_code", ""),
            "point_name": old_q.get("point_code", ""),
            "category": "",
        }]

        prompt = handler.build_exam_prompt(
            target_points=point_data,
            question_count=1,
            difficulty=old_q.get("difficulty", session.get("difficulty", 3)),
            question_types=[old_q.get("question_type", "short_answer")],
        )

        if instruction:
            prompt += f"\n\n額外要求：{instruction}"

        # 調用 LLM
        from app.infrastructure.ai_pipeline import (
            call_ollama_json, parse_questions_json,
            enrich_with_svg, enrich_with_charts, sanitize_svg,
        )
        from app.core.ai_gate import Priority, Weight

        raw = await call_ollama_json(
            prompt,
            temperature=0.8,
            gate_task="exam_regen_single",
            gate_priority=Priority.URGENT,
            gate_weight=Weight.ANALYSIS,
        )
        result = parse_questions_json(raw)
        new_questions = result.get("questions", [])

        if not new_questions:
            raise ValueError("重新生成失敗：LLM 未返回題目")

        new_q = new_questions[0]

        # SVG / Chart 增強
        await enrich_with_svg([new_q], subject)
        enrich_with_charts([new_q], subject)

        if "question_svg" in new_q:
            new_q["question_svg"] = sanitize_svg(new_q["question_svg"])

        # 保留原題的 index
        new_q["index"] = old_q.get("index", question_index + 1)

        # 替換
        questions[question_index] = new_q
        self._sessions.update(
            {"questions": json.dumps(questions, ensure_ascii=False)},
            "session_id = %s",
            (session_id,),
        )

        logger.info("Exam question regenerated: session=%s, index=%d", session_id, question_index)
        return new_q

    # ================================================================
    # 歷史列表
    # ================================================================

    def get_history(
        self, teacher_username: str, page: int = 1, page_size: int = 10,
    ) -> Dict:
        """教師的出題歷史（不含 questions 詳情，減少傳輸量）。"""
        result = self._sessions.find_by_teacher(teacher_username, page, page_size)
        # 移除大字段
        for item in result.get("items", []):
            item.pop("questions", None)
            item.pop("error_message", None)
            # 解析 target_points
            tp = item.get("target_points")
            if isinstance(tp, str):
                try:
                    item["target_points"] = json.loads(tp)
                except (json.JSONDecodeError, TypeError):
                    pass
        return result

    # ================================================================
    # 知識點列表（給前端選擇用）
    # ================================================================

    def get_knowledge_points(self, subject: str) -> List[Dict]:
        """返回指定科目的知識點列表。"""
        rows = self._knowledge.find_all(
            where="subject = %s AND is_active = 1",
            params=(subject,),
            order_by="category, display_order, point_code",
        )
        return [
            {
                "point_code": r["point_code"],
                "point_name": r["point_name"],
                "category": r.get("category", ""),
            }
            for r in rows
        ]

    # ================================================================
    # 匯出試卷數據
    # ================================================================

    def export_exam_data(
        self, session_id: str, teacher_username: str,
    ) -> Optional[Dict]:
        """匯出完整試卷數據（供前端渲染/打印用）。"""
        session = self._sessions.find_by_session_id(session_id)
        if not session or session["teacher_username"] != teacher_username:
            return None
        if session["status"] != "generated":
            return None

        questions = session.get("questions")
        if isinstance(questions, str):
            questions = json.loads(questions)

        return {
            "session_id": session_id,
            "subject": session["subject"],
            "exam_context": session.get("exam_context", ""),
            "difficulty": session["difficulty"],
            "total_marks": sum(q.get("points", 0) for q in (questions or [])),
            "questions": questions or [],
            "created_at": str(session["created_at"]) if session.get("created_at") else None,
        }

    # ================================================================
    # 內部方法
    # ================================================================

    def _resolve_knowledge_points(
        self, subject: str, target_point_codes: Optional[List[str]],
    ) -> List[Dict]:
        """解析知識點 codes 為完整資料，無指定則返回全部。"""
        if target_point_codes:
            points = []
            for code in target_point_codes:
                row = self._knowledge.find_one(
                    "point_code = %s AND subject = %s",
                    (code, subject),
                )
                if row:
                    points.append({
                        "point_code": row["point_code"],
                        "point_name": row["point_name"],
                        "category": row.get("category", ""),
                    })
            return points

        # 未指定：返回該科目所有知識點
        rows = self._knowledge.find_all(
            where="subject = %s AND is_active = 1",
            params=(subject,),
            order_by="display_order",
            limit=20,
        )
        return [
            {
                "point_code": r["point_code"],
                "point_name": r["point_name"],
                "category": r.get("category", ""),
            }
            for r in rows
        ]
