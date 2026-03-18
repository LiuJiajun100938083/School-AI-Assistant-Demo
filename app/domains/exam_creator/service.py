"""
AI 考試出題 — 業務邏輯層
==========================
編排出題流程：建 session → 後台逐題 LLM 生成 → SVG/Chart 增強 → 更新結果。

逐題生成策略：每次只生成 1 題，上下文更短 → LLM 更精準。
每完成一題即寫回 DB，前端可輪詢 completed_count 顯示進度。

依賴方向：
  service → repository（數據訪問）
  service → ai_pipeline（基礎設施：LLM + SVG + Chart）
  service → SubjectHandlerRegistry（唯讀：prompt 模板 + 知識點判斷）
"""

import asyncio
import json
import logging
import random
import re
import uuid
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ================================================================
# LLM 思考痕跡清理
# ================================================================

# 匹配 LLM 自我對話 / 回溯 / 探索性推理的段落起始模式
_THINKING_LINE_PATTERNS = re.compile(
    r'^('
    r'(?:檢查|檢驗|驗證)(?:題目|條件|數據|結果|一下|是否)'
    r'|(?:題目|條件)(?:缺少|不足|矛盾|有誤|似乎|可能)'
    r'|(?:修正|修改|調整|更正)(?:題目|條件|數據|參數)'
    r'|(?:重新|重來|再次)(?:設計|構建|出題|考慮|計算|嘗試|分析)'
    r'|不[，,](?:應該|這樣|對|行)'
    r'|(?:讓我們?|我(?:需要|應該|先|來))(?:換個|重新|再|檢查|想想|考慮)'
    r'|(?:等等|不對|有問題|這(?:似乎|好像|不))'
    r'|(?:注意到|發現|但是|然而).*(?:矛盾|不對|有誤|問題)'
    r'|此題設計(?:上|中)?(?:存在|有)'
    r'|(?:為了?|需要)(?:確保|保證)(?:自洽|合理|正確)'
    r')',
    re.MULTILINE,
)


def _strip_thinking_from_answer(question: Dict) -> None:
    """
    移除 correct_answer 中 LLM 混入的思考過程，只保留乾淨的解題步驟。

    策略：逐行掃描，遇到思考模式的段落則跳過整個段落（直到下一個空行或解題標記）。
    如果清理後找到明確的解題起始標記（解：、步驟：），則從該處截取。
    """
    answer = question.get("correct_answer", "")
    if not answer or len(answer) < 50:
        return

    # 策略 1：如果存在明確的「解：」或「解法：」標記，且前面有思考痕跡，
    #          直接從最後一個解題標記開始截取
    solution_markers = list(re.finditer(r'^(?:解[：:]|解法[：:]|步驟[：:])', answer, re.MULTILINE))
    if solution_markers:
        # 檢查標記之前是否有思考痕跡
        last_marker = solution_markers[-1]
        prefix = answer[:last_marker.start()]
        if _THINKING_LINE_PATTERNS.search(prefix):
            cleaned = answer[last_marker.start():]
            logger.info(
                "Stripped %d chars of thinking from correct_answer (marker: '%s')",
                len(prefix), last_marker.group(),
            )
            question["correct_answer"] = cleaned.strip()
            return

    # 策略 2：逐行過濾思考段落
    lines = answer.split('\n')
    result_lines = []
    skip_paragraph = False

    for line in lines:
        stripped = line.strip()

        # 空行重置段落跳過狀態
        if not stripped:
            skip_paragraph = False
            result_lines.append(line)
            continue

        # 檢查是否為思考段落的起始
        if _THINKING_LINE_PATTERNS.match(stripped):
            skip_paragraph = True
            continue

        if skip_paragraph:
            continue

        result_lines.append(line)

    cleaned = '\n'.join(result_lines).strip()

    # 清理可能產生的多餘空行
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)

    if len(cleaned) < len(answer):
        logger.info(
            "Stripped thinking lines from correct_answer: %d → %d chars",
            len(answer), len(cleaned),
        )
        question["correct_answer"] = cleaned


class ExamCreatorService:

    def __init__(self, session_repo, knowledge_repo, vision_service=None):
        """
        Args:
            session_repo: ExamGenerationSessionRepository
            knowledge_repo: KnowledgePointRepository（共享參考資料，唯讀）
            vision_service: VisionService（可選，相似題圖片 OCR 用）
        """
        self._sessions = session_repo
        self._knowledge = knowledge_repo
        self._vision = vision_service

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
        provider: str = "local",
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

        # 建 session 記錄
        session_id = str(uuid.uuid4())[:12]
        self._sessions.insert({
            "session_id": session_id,
            "teacher_username": teacher_username,
            "teacher_id": 0,
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
            "count=%d, difficulty=%d, provider=%s, points=%s",
            session_id, teacher_username, subject, question_count, difficulty,
            provider, [p["point_code"] for p in points_data],
        )

        return {
            "session_id": session_id,
            "status": "generating",
            "reused": False,
            "_bg_context": {
                "points_data": points_data,
                "question_count": question_count,
                "difficulty": difficulty,
                "subject": subject,
                "question_types": question_types,
                "exam_context": exam_context,
                "total_marks": total_marks,
                "provider": provider,
            },
        }

    # ================================================================
    # Step B: 後台批量生成（異步 BackgroundTask）
    # ================================================================

    # 每批並發數：2 題同時生成
    # ai_gate Weight.ANALYSIS=2，一般 capacity=4-6，2 題佔用 4 不會過載
    BATCH_CONCURRENCY = 2

    async def generate_exam_background(
        self,
        session_id: str,
        subject: str,
        question_count: int,
        difficulty: int,
        points_data: List[Dict],
        question_types: Optional[List[str]] = None,
        exam_context: str = "",
        total_marks: Optional[int] = None,
        provider: str = "local",
    ) -> None:
        """
        後台分批並發 LLM 生成 + SVG/Chart 增強，每批完成即更新 session。

        策略：每次只讓 LLM 出 1 題（上下文短 → 更精準），
        但同一批內 2 題並發（asyncio.gather），速度翻倍。
        同批內的題目共享去重上下文（前幾批的結果），
        但彼此之間不去重（可接受，因為目標知識點不同）。

        冪等保護：只在 status='generating' 時執行。
        錯誤降級：單題失敗跳過繼續（SVG 失敗不阻塞），全部失敗才標記 generation_failed。
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
            from app.infrastructure.ai_pipeline import sanitize_svg
            from app.domains.mistake_book.subject_handler import SubjectHandlerRegistry

            handler = SubjectHandlerRegistry.get(subject)

            # 1. 分配知識點到每道題
            point_assignments = self._distribute_points(points_data, question_count)

            # 2. 計算每題配分（若指定總分）
            per_question_marks = None
            if total_marks:
                per_question_marks = self._distribute_marks(question_count, total_marks)

            generated_questions = []  # 按 index 排序的最終結果
            failed_count = 0

            # 3. 分批並發生成
            batch_size = self.BATCH_CONCURRENCY
            for batch_start in range(0, question_count, batch_size):
                batch_end = min(batch_start + batch_size, question_count)
                batch_indices = list(range(batch_start, batch_end))

                # 本批所有任務的 coroutine
                coros = []
                for i in batch_indices:
                    point = point_assignments[i]
                    q_marks = per_question_marks[i] if per_question_marks else None
                    coros.append(
                        self._generate_single_question(
                            handler=handler,
                            point=point,
                            index=i + 1,
                            difficulty=difficulty,
                            question_types=question_types,
                            exam_context=exam_context,
                            marks=q_marks,
                            previous_questions=generated_questions,  # 快照：前幾批的結果
                            subject=subject,
                            provider=provider,
                        )
                    )

                # 並發執行本批，return_exceptions=True 確保單題失敗不影響同批其他題
                results = await asyncio.gather(*coros, return_exceptions=True)

                # 收集結果（按 index 順序）
                for idx_in_batch, result in enumerate(results):
                    global_idx = batch_indices[idx_in_batch]
                    if isinstance(result, Exception):
                        failed_count += 1
                        logger.warning(
                            "Exam Q%d generation failed: session=%s, error=%s",
                            global_idx + 1, session_id, result,
                        )
                    elif result is None:
                        failed_count += 1
                        logger.warning(
                            "Exam Q%d generation returned empty: session=%s",
                            global_idx + 1, session_id,
                        )
                    else:
                        generated_questions.append(result)

                # 每批完成後更新 DB，讓前端看到進度
                self._sessions.update(
                    {"questions": json.dumps(generated_questions, ensure_ascii=False)},
                    "session_id = %s AND status = 'generating'",
                    (session_id,),
                )

                logger.info(
                    "Exam batch done: session=%s, batch=%d-%d, total_done=%d/%d",
                    session_id, batch_start + 1, batch_end,
                    len(generated_questions), question_count,
                )

            # 4. 全部完成 — 更新最終狀態
            if not generated_questions:
                raise ValueError("所有題目生成均失敗")

            # SVG 安全過濾（最終統一做一次）
            for q in generated_questions:
                if "question" in q:
                    q["question"] = sanitize_svg(q["question"])
                if "question_svg" in q:
                    q["question_svg"] = sanitize_svg(q["question_svg"])

            self._sessions.update(
                {
                    "questions": json.dumps(generated_questions, ensure_ascii=False),
                    "question_count": len(generated_questions),
                    "status": "generated",
                },
                "session_id = %s AND status = 'generating'",
                (session_id,),
            )
            logger.info(
                "Exam generation completed: session=%s, questions=%d, failed=%d",
                session_id, len(generated_questions), failed_count,
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
    # 單題生成核心
    # ================================================================

    async def _generate_single_question(
        self,
        handler,
        point: Dict,
        index: int,
        difficulty: int,
        question_types: Optional[List[str]],
        exam_context: str,
        marks: Optional[int],
        previous_questions: List[Dict],
        subject: str,
        provider: str = "local",
    ) -> Optional[Dict]:
        """
        生成單道題目 + SVG/Chart 增強。

        Args:
            handler: SubjectHandler 實例
            point: 當前題目的目標知識點 {"point_code", "point_name", "category"}
            index: 題號（1-based）
            difficulty: 難度 1-5
            question_types: 允許的題型列表
            exam_context: 考試場景
            marks: 此題配分（None 則由 LLM 決定）
            previous_questions: 已生成的題目列表（用於去重）
            subject: 科目代碼

        Returns:
            生成的題目 dict，或 None（失敗）。
        """
        from app.infrastructure.ai_pipeline import (
            call_llm_json,
            enrich_with_charts,
            enrich_with_svg,
            parse_questions_json,
        )
        from app.core.ai_gate import Priority, Weight

        # 構建單題 prompt
        prompt = handler.build_exam_prompt(
            target_points=[point],
            question_count=1,
            difficulty=difficulty,
            question_types=question_types,
            exam_context=exam_context,
            total_marks=None,  # 單題不用總分
        )

        # 附加配分要求
        if marks:
            prompt += f"\n\n此題配分：{marks} 分，請確保 points 字段為 {marks}。"

        # 附加去重上下文
        if previous_questions:
            dedup_lines = []
            for j, pq in enumerate(previous_questions):
                q_text = pq.get("question", "")
                # 只取前 80 字符，避免 prompt 過長
                snippet = q_text[:80].replace("\n", " ")
                dedup_lines.append(f"  Q{j+1}: {snippet}")
            dedup_context = "\n".join(dedup_lines)
            prompt += (
                f"\n\n## 去重要求\n"
                f"以下題目已經生成，新題必須使用不同的數值、情境和設問方式：\n"
                f"{dedup_context}\n"
                f"[seed={random.randint(1000, 9999)}]"
            )
        else:
            prompt += f"\n\n[seed={random.randint(1000, 9999)}] 請確保題目的數值和情境具有變化。"

        # LLM 調用（最多重試 1 次）
        MAX_ATTEMPTS = 2
        questions = None

        for attempt in range(1, MAX_ATTEMPTS + 1):
            raw = await call_llm_json(
                prompt,
                provider=provider,
                temperature=0.7 + (attempt - 1) * 0.1,  # 重試時稍高溫度
                gate_task="exam_generation",
                gate_priority=Priority.URGENT,
                gate_weight=Weight.ANALYSIS,
                num_predict=8192,  # 單題含完整解答+評分標準，中文 ≈1 token/字
            )

            if not raw or not raw.strip():
                logger.warning(
                    "Q%d attempt %d/%d: LLM 返回空內容",
                    index, attempt, MAX_ATTEMPTS,
                )
                continue

            # JSON 解析
            result = parse_questions_json(raw)
            questions = result.get("questions", [])

            if not questions:
                # 嘗試直接解析（有些 LLM 會返回單個 object 而非 questions array）
                if result and "question" in result:
                    questions = [result]
                else:
                    logger.warning(
                        "Q%d attempt %d/%d: JSON 無 questions, keys=%s, snippet=%s",
                        index, attempt, MAX_ATTEMPTS,
                        list(result.keys()) if result else "EMPTY",
                        raw[:300] if raw else "None",
                    )
                    continue

            # 成功解析到題目
            if attempt > 1:
                logger.info("Q%d: 重試第 %d 次成功", index, attempt)
            break

        if not questions:
            logger.warning("Q%d: %d 次嘗試均失敗", index, MAX_ATTEMPTS)
            return None

        new_q = questions[0]
        new_q["index"] = index

        # 清理 correct_answer 中混入的 LLM 思考過程
        _strip_thinking_from_answer(new_q)

        # SVG 幾何增強（fail-soft）
        try:
            await enrich_with_svg([new_q], subject)
        except Exception as e:
            logger.warning("Q%d SVG enrichment failed: %s", index, e)

        # Chart 統計圖增強（fail-soft）
        try:
            enrich_with_charts([new_q], subject)
        except Exception as e:
            logger.warning("Q%d chart enrichment failed: %s", index, e)

        logger.info(
            "Q%d generated: point=%s, type=%s, marks=%s",
            index, point.get("point_code"), new_q.get("question_type"), new_q.get("points"),
        )
        return new_q

    # ================================================================
    # 知識點分配 + 配分計算
    # ================================================================

    @staticmethod
    def _distribute_points(
        points_data: List[Dict], question_count: int,
    ) -> List[Dict]:
        """
        將知識點均勻分配到每道題。

        規則：
        - 每個知識點至少 1 題
        - 剩餘題目輪流分配
        - 最終 shuffle 避免同知識點題目連續出現
        """
        if not points_data:
            return [{"point_code": "", "point_name": "", "category": ""}] * question_count

        assignments = []

        # 每個知識點至少 1 題
        for p in points_data:
            assignments.append(p)

        # 剩餘題目輪流分配
        remaining = question_count - len(assignments)
        idx = 0
        while remaining > 0:
            assignments.append(points_data[idx % len(points_data)])
            idx += 1
            remaining -= 1

        # 截斷（若 points > question_count）
        assignments = assignments[:question_count]

        # Shuffle（但保持第一題 = 第一個知識點，方便閱讀）
        if len(assignments) > 2:
            tail = assignments[1:]
            random.shuffle(tail)
            assignments = [assignments[0]] + tail

        return assignments

    @staticmethod
    def _distribute_marks(
        question_count: int, total_marks: int,
    ) -> List[int]:
        """
        將總分均勻分配到每道題。

        規則：
        - 基礎分 = total_marks // question_count
        - 餘數分配給前幾題（每題 +1）
        """
        base = total_marks // question_count
        remainder = total_marks % question_count

        marks = []
        for i in range(question_count):
            marks.append(base + (1 if i < remainder else 0))
        return marks

    # ================================================================
    # 輪詢狀態
    # ================================================================

    def get_generation_status(
        self, session_id: str, teacher_username: str,
    ) -> Optional[Dict]:
        """
        查詢生成狀態（含 ownership 驗證）。

        generating 時返回 completed_count 讓前端顯示進度。
        """
        session = self._sessions.find_by_session_id(session_id)
        if not session or session["teacher_username"] != teacher_username:
            return None

        result = {
            "session_id": session_id,
            "status": session["status"],
            "subject": session["subject"],
            "question_count": session["question_count"],
            "difficulty": session["difficulty"],
            "mode": session.get("mode", "generate"),
            "source_type": session.get("source_type"),
            "created_at": str(session["created_at"]) if session.get("created_at") else None,
        }

        if session["status"] == "generating":
            # 返回已完成的題數（從 partial questions 計算）
            questions = session.get("questions")
            completed = 0
            if questions:
                if isinstance(questions, str):
                    try:
                        parsed = json.loads(questions)
                        completed = len(parsed) if isinstance(parsed, list) else 0
                    except (json.JSONDecodeError, TypeError):
                        pass
                elif isinstance(questions, list):
                    completed = len(questions)
            result["completed_count"] = completed

        elif session["status"] == "generated":
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
    # 刪除 session
    # ================================================================

    def delete_session(self, session_id: str, teacher_username: str) -> bool:
        """
        刪除指定 session。

        生成中的 session 不允許刪除（後台任務仍在跑）。
        """
        session = self._sessions.find_by_session_id(session_id)
        if not session or session["teacher_username"] != teacher_username:
            return False
        if session["status"] == "generating":
            return False
        count = self._sessions.delete_by_session_id(session_id, teacher_username)
        if count > 0:
            logger.info("Exam session deleted: %s by %s", session_id, teacher_username)
        return count > 0

    # ================================================================
    # 歷史列表
    # ================================================================

    def get_history(
        self, teacher_username: str, page: int = 1, page_size: int = 10,
    ) -> Dict:
        """教師的出題歷史（repository 已排除 questions 大字段）。"""
        result = self._sessions.find_by_teacher(teacher_username, page, page_size)
        for item in result.get("items", []):
            # 解析 target_points
            tp = item.get("target_points")
            if isinstance(tp, str):
                try:
                    item["target_points"] = json.loads(tp)
                except (json.JSONDecodeError, TypeError):
                    pass
            # 確保 mode 和 source_type 有默認值
            item.setdefault("mode", "generate")
            item.setdefault("source_type", None)
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

    # ================================================================
    # 相似題生成 — Step A: 啟動（同步，< 1s）
    # ================================================================

    # 允許的相似題科目（受控枚舉）
    _SIMILAR_SUBJECTS = frozenset({"math", "physics"})

    def start_similar_generation(
        self,
        teacher_username: str,
        subject: str,
        question_text: str,
        count: int = 3,
        difficulty_variation: bool = True,
        source_type: str = "text",
        figure_description: Optional[str] = None,
    ) -> Dict:
        """
        建 session（mode=similar），返回 session_id + 後台上下文。

        exam_context 字段在 similar 模式下存原題文字（複用字段換開發速度）。
        """
        if subject not in self._SIMILAR_SUBJECTS:
            raise ValueError(f"相似題目前只支援 {self._SIMILAR_SUBJECTS}")

        # 去重檢查（與 generate 共用）
        existing = self._sessions.find_generating_by_teacher(teacher_username)
        if existing:
            return {
                "session_id": existing["session_id"],
                "status": "generating",
                "reused": True,
            }

        session_id = str(uuid.uuid4())[:12]
        self._sessions.insert({
            "session_id": session_id,
            "teacher_username": teacher_username,
            "teacher_id": 0,
            "subject": subject,
            "status": "generating",
            "question_count": count,
            "difficulty": 3,  # 相似題由原題決定，這裡存默認值
            "mode": "similar",
            "source_type": source_type,
            # similar 模式：exam_context 存原題文字
            "exam_context": question_text[:3000],
        })

        logger.info(
            "Similar generation started: session=%s, teacher=%s, subject=%s, "
            "count=%d, source=%s",
            session_id, teacher_username, subject, count, source_type,
        )

        return {
            "session_id": session_id,
            "status": "generating",
            "reused": False,
            "_bg_context": {
                "subject": subject,
                "question_text": question_text,
                "count": count,
                "difficulty_variation": difficulty_variation,
                "figure_description": figure_description,
            },
        }

    # ================================================================
    # 相似題生成 — Step B: 後台生成（異步 BackgroundTask）
    # ================================================================

    async def generate_similar_background(
        self,
        session_id: str,
        subject: str,
        question_text: str,
        count: int = 3,
        difficulty_variation: bool = True,
        figure_description: Optional[str] = None,
    ) -> None:
        """
        後台生成相似題：構建 prompt → LLM → 解析 → SVG/Chart enrichment。

        錯誤分層：
        - llm_call_failed: 模型調用失敗
        - llm_format_error: 模型輸出格式解析失敗
        - UNKNOWN_ERROR: 其他未知錯誤
        """
        session = self._sessions.find_by_session_id(session_id)
        if not session or session["status"] != "generating":
            return

        try:
            from app.infrastructure.ai_pipeline import (
                call_ollama_json, parse_questions_json,
                enrich_with_svg, enrich_with_charts, sanitize_svg,
            )
            from app.core.ai_gate import Priority, Weight

            # 1. 構建相似題 prompt（域內私有方法）
            prompt = self._build_similar_prompt(
                subject, question_text, count, difficulty_variation,
                figure_description=figure_description,
            )

            # 2. LLM 調用（最多重試 1 次）
            raw = None
            for attempt in range(1, 3):
                raw = await call_ollama_json(
                    prompt,
                    temperature=0.7 + (attempt - 1) * 0.1,
                    gate_task="similar_question",
                    gate_priority=Priority.URGENT,
                    gate_weight=Weight.ANALYSIS,
                    num_predict=16384,  # 多題需要更多 token
                )
                if raw and raw.strip():
                    break
                logger.warning(
                    "Similar Q attempt %d/2: LLM 空回應, session=%s",
                    attempt, session_id,
                )

            if not raw or not raw.strip():
                self._sessions.update(
                    {
                        "status": "generation_failed",
                        "error_code": "llm_call_failed",
                        "error_message": "模型未返回結果",
                    },
                    "session_id = %s AND status = 'generating'",
                    (session_id,),
                )
                return

            # 3. 解析 JSON
            result = parse_questions_json(raw)
            questions = result.get("questions", [])

            if not questions:
                # 嘗試直接解析
                if result and "question" in result:
                    questions = [result]

            if not questions:
                self._sessions.update(
                    {
                        "status": "generation_failed",
                        "error_code": "llm_format_error",
                        "error_message": f"模型輸出格式無法解析，keys={list(result.keys()) if result else 'EMPTY'}",
                    },
                    "session_id = %s AND status = 'generating'",
                    (session_id,),
                )
                return

            # 4. 截取到指定數量 + 設置 index
            questions = questions[:count]
            for i, q in enumerate(questions):
                q["index"] = i + 1

            # 5. SVG / Chart enrichment（fail-soft）
            try:
                await enrich_with_svg(questions, subject)
            except Exception as e:
                logger.warning("Similar SVG enrichment failed: session=%s, %s", session_id, e)

            try:
                enrich_with_charts(questions, subject)
            except Exception as e:
                logger.warning("Similar chart enrichment failed: session=%s, %s", session_id, e)

            # 6. SVG 安全過濾
            for q in questions:
                if "question" in q:
                    q["question"] = sanitize_svg(q["question"])
                if "question_svg" in q:
                    q["question_svg"] = sanitize_svg(q["question_svg"])

            # 7. 更新 session
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
                "Similar generation completed: session=%s, questions=%d",
                session_id, len(questions),
            )

        except Exception as e:
            error_code = "UNKNOWN_ERROR"
            if "timeout" in str(e).lower():
                error_code = "llm_call_failed"
            elif "json" in str(e).lower():
                error_code = "llm_format_error"

            self._sessions.update(
                {
                    "status": "generation_failed",
                    "error_code": error_code,
                    "error_message": str(e)[:500],
                },
                "session_id = %s AND status = 'generating'",
                (session_id,),
            )
            logger.error(
                "Similar generation failed: session=%s, %s: %s",
                session_id, error_code, e, exc_info=True,
            )

    # ================================================================
    # 相似題 Prompt 構建（域內私有方法）
    # ================================================================

    _SUBJECT_NAMES = {"math": "數學", "physics": "物理"}

    def _build_similar_prompt(
        self,
        subject: str,
        original_question: str,
        count: int = 3,
        difficulty_variation: bool = True,
        figure_description: Optional[str] = None,
    ) -> str:
        """
        構建相似題生成 prompt。

        強約束四個維度：知識點一致、題型結構一致、解法路徑相近、難度小幅波動。
        輸出 JSON 格式與 build_exam_prompt 一致，方便前端零改動渲染。
        """
        subject_name = self._SUBJECT_NAMES.get(subject, subject)

        if difficulty_variation:
            diff_instruction = (
                f"生成 {count} 道相似題目，難度逐漸遞進。\n"
                f"第 1 題難度比原題稍低（difficulty -1），最後一題稍高（difficulty +1），"
                f"中間題目與原題難度相當。"
            )
        else:
            diff_instruction = f"生成 {count} 道相似題目，難度與原題相當。"

        # 圖形描述區段（OCR 從圖片提取的力學圖、電路圖等結構化描述）
        figure_section = ""
        if figure_description and figure_description.strip():
            figure_section = f"""
## 原題圖形描述（由視覺模型從題目圖片中提取）

以下是原題附圖的結構化描述，請充分理解原題的物理/數學情境：

```
{figure_description}
```

**相似題圖形約束**：
- 新題的物理情境應與原題結構相似（相同類型的元件/物體/關係），但改變具體數值和配置
- 新題的文字描述必須自包含（完整描述所有物理量和條件），不依賴外部圖形
- 如果原題涉及電路，新題也應涉及電路；如果涉及力學，新題也應涉及力學
"""

        return f"""你是一位經驗豐富的DSE {subject_name}科教師。

## 原始題目
{original_question}
{figure_section}
## 任務
{diff_instruction}

## 嚴格約束（必須遵守）
1. **核心知識點一致**：每道相似題必須考察與原題相同的知識點，不能偏移到相鄰或相關知識點
2. **題型結構一致**：原題是單問就生成單問，原題是多小問就對應生成多小問，不能改變題型結構
3. **解題方法路徑相近**：相似題的解法步驟應與原題使用同類方法，不能換用完全不同的解題策略
4. **數值和情境變化**：改變具體數值、變量名、應用情境和設問角度，但保持題目本質不變

## 出題要求
- 題目文字條件必須自包含（不依賴外部圖形）
- 數學公式使用 LaTeX 標記（$...$ 行內，$$...$$ 獨立行）
- 每題標明配分（points）和難度（difficulty 1-5）
- 提供完整的解題步驟和最終答案
- 提供評分準則（marking_scheme）
- 使用繁體中文出題

## correct_answer 格式要求（極重要）
correct_answer 必須是**乾淨、標準的解題過程**，像教科書或考試標準答案一樣。
- 每一步驟用清晰的推理，逐步推導到最終答案
- **嚴禁**包含任何自我對話、自我糾正、試錯過程、回溯或探索性文字
- **嚴禁**出現「讓我們換個角度」「不，應該是…」「這似乎太複雜」「等等」「重新考慮」等思考痕跡

## 幾何題與 needs_svg 標記
- 幾何題不需要你畫圖，系統會自動為幾何題生成配圖
- 但題目文字必須自包含，即使無圖也能唯一理解幾何關係
- 不可把答案建立在目測圖形之上；需要的條件必須在文字中明確給出
- 每道題必須標記 needs_svg 字段：
  - true：題目涉及幾何圖形（三角形、四邊形、圓、角、平行線、座標幾何等），配圖能幫助理解
  - false：純代數、函數、概率、數列等不需要幾何圖形的題目
- needs_chart 和 needs_svg 互斥，同一題只設一個為 true

## 輸出格式（JSON）
```json
{{{{
  "questions": [
    {{{{
      "index": 1,
      "question": "題目（LaTeX 公式用 $ 包裹）",
      "question_type": "short_answer / multiple_choice / fill_blank",
      "options": null,
      "correct_answer": "標準解題步驟（乾淨逐步推導，禁止思考痕跡）和最終答案",
      "marking_scheme": "配分要點（如：列式 1 分，計算 2 分）",
      "points": 5,
      "difficulty": 3,
      "needs_svg": true,
      "needs_chart": false,
      "chart_spec": null
    }}}}
  ]
}}}}
```
注意：
- 只輸出 JSON
- needs_svg 根據題目是否涉及幾何圖形來決定 true/false
- 題目中的分行請使用實際換行，不要寫成 \\n
- 所有數學公式必須用 $ 包裹（行內 $...$，獨立行 $$...$$）
- 單位寫法用 $\\text{{J kg}}^{{-1}}$ 或直接寫 J kg⁻¹"""

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
