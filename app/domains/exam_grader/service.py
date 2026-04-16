"""
试卷批阅系统 — Service 层
===========================
业务编排：状态流转、调 repository 存取、调策略评分。
不直接写 SQL，不处理 HTTP，不直接调 AI。
AI/Vision 通过注入的函数调用，经过 ai_gate 调度。
"""

import asyncio
import json
import logging
import os
import threading
import time
from typing import Any, Callable, Dict, List, Optional

from app.domains.exam_grader.constants import (
    ALLOWED_BATCH_EXTENSIONS,
    ALLOWED_PAPER_EXTENSIONS,
    ExamStatus,
    GradedBy,
    MAX_BATCH_PDF_SIZE_MB,
    MAX_CLEAN_PAPER_SIZE_MB,
    PDF_DPI,
    StudentPaperStatus,
    SUPPORTED_SUBJECTS,
    UPLOAD_DIR,
    VALID_STATUS_TRANSITIONS,
)
from app.domains.exam_grader.grading import (
    calculate_total_score,
    compute_statistics,
    grade_mc,
    match_student_to_roster,
    verify_questions_match,
)
from app.domains.exam_grader.repository import (
    ExamPaperRepository,
    ExamQuestionRepository,
    ExamStudentAnswerRepository,
    ExamStudentPaperRepository,
)
from app.domains.exam_grader.strategies import get_strategy

logger = logging.getLogger(__name__)


class ExamGraderService:
    """试卷批阅核心服务"""

    def __init__(
        self,
        paper_repo: ExamPaperRepository,
        question_repo: ExamQuestionRepository,
        student_paper_repo: ExamStudentPaperRepository,
        student_answer_repo: ExamStudentAnswerRepository,
        vision_service=None,
        user_repo=None,
        settings=None,
    ):
        self._paper_repo = paper_repo
        self._question_repo = question_repo
        self._student_paper_repo = student_paper_repo
        self._student_answer_repo = student_answer_repo
        self._vision_service = vision_service
        self._user_repo = user_repo
        self._settings = settings

        # Schema 迁移（幂等）
        paper_repo.ensure_schema()

        # AI 函数注入（通过 container 设置）
        self._ask_ai_func: Optional[Callable] = None
        self._rag_func: Optional[Callable] = None

        # 批改任务状态（内存）
        self._grading_jobs: Dict[int, Dict[str, Any]] = {}

    def set_ai_function(self, ask_ai_func: Callable) -> None:
        self._ask_ai_func = ask_ai_func

    def set_rag_function(self, rag_func: Callable) -> None:
        self._rag_func = rag_func

    # ================================================================
    # CRUD
    # ================================================================

    # ── 权限判断 ──

    @staticmethod
    def can_access(exam: dict, user_id: int) -> bool:
        """创建者或协作者可访问"""
        if exam.get("created_by") == user_id:
            return True
        collabs = exam.get("collaborators")
        if isinstance(collabs, str):
            try:
                collabs = json.loads(collabs)
            except (json.JSONDecodeError, TypeError):
                collabs = []
        return isinstance(collabs, list) and user_id in collabs

    def require_access(self, exam_id: int, user_id: int) -> dict:
        """获取考试并验证访问权限，无权则抛异常"""
        exam = self._paper_repo.find_by_id(exam_id)
        if not exam or exam.get("is_deleted"):
            raise ValueError("考试不存在")
        if not self.can_access(exam, user_id):
            raise PermissionError("你沒有此考試的訪問權限")
        return exam

    # ── CRUD ──

    def create_exam(self, teacher_id: int, data: dict) -> Dict[str, Any]:
        subject = data.get("subject", "ict")
        if subject not in SUPPORTED_SUBJECTS:
            raise ValueError(f"不支持的科目: {subject}")

        collaborators = data.get("collaborators")
        if collaborators and isinstance(collaborators, list):
            # 排除自己
            collaborators = [c for c in collaborators if c != teacher_id]

        exam_id = self._paper_repo.insert_get_id({
            "title": data["title"],
            "subject": subject,
            "class_name": data["class_name"],
            "total_marks": data.get("total_marks", 40),
            "pages_per_exam": data.get("pages_per_exam", 1),
            "grading_mode": data.get("grading_mode", "moderate"),
            "status": ExamStatus.DRAFT.value,
            "created_by": teacher_id,
            "collaborators": json.dumps(collaborators) if collaborators else None,
        })
        return self._paper_repo.find_by_id(exam_id)

    def get_exam(self, exam_id: int) -> Optional[Dict[str, Any]]:
        exam = self._paper_repo.find_by_id(exam_id)
        if exam and exam.get("is_deleted"):
            return None
        return exam

    def list_exams(self, teacher_id: int, status: str = "", page: int = 1, page_size: int = 20):
        return self._paper_repo.find_by_teacher(teacher_id, status, page, page_size)

    def update_exam(self, exam_id: int, data: dict) -> Dict[str, Any]:
        fields = {}
        for key in ("title", "class_name", "pages_per_exam", "grading_mode", "total_marks"):
            if key in data and data[key] is not None:
                fields[key] = data[key]
        if "collaborators" in data:
            collabs = data["collaborators"]
            fields["collaborators"] = json.dumps(collabs) if collabs else None
        if fields:
            self._paper_repo.update(fields, "id = %s", (exam_id,))
        return self._paper_repo.find_by_id(exam_id)

    def delete_exam(self, exam_id: int) -> bool:
        return self._paper_repo.update({"is_deleted": 1}, "id = %s", (exam_id,)) > 0

    def get_questions(self, exam_id: int) -> List[Dict[str, Any]]:
        return self._question_repo.find_by_exam(exam_id)

    def update_questions(self, exam_id: int, updates: List[dict]) -> int:
        for u in updates:
            if "reference_answer" in u and u.get("answer_source") is None:
                u["answer_source"] = "manual"
        return self._question_repo.batch_update_answers(updates)

    # ================================================================
    # 文件上传
    # ================================================================

    def _ensure_upload_dir(self, exam_id: int) -> str:
        path = os.path.join(UPLOAD_DIR, str(exam_id))
        os.makedirs(path, exist_ok=True)
        return path

    def save_clean_paper(self, exam_id: int, file_bytes: bytes, filename: str) -> str:
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ALLOWED_PAPER_EXTENSIONS:
            raise ValueError(f"不支持的文件格式: {ext}")
        if len(file_bytes) > MAX_CLEAN_PAPER_SIZE_MB * 1024 * 1024:
            raise ValueError(f"文件过大，上限 {MAX_CLEAN_PAPER_SIZE_MB}MB")

        upload_dir = self._ensure_upload_dir(exam_id)
        save_path = os.path.join(upload_dir, f"clean_paper{ext}")
        with open(save_path, "wb") as f:
            f.write(file_bytes)

        self._paper_repo.update({"clean_paper_path": save_path}, "id = %s", (exam_id,))
        return save_path

    def save_answer_sheet(self, exam_id: int, file_bytes: bytes, filename: str) -> str:
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ALLOWED_PAPER_EXTENSIONS:
            raise ValueError(f"不支持的文件格式: {ext}")

        upload_dir = self._ensure_upload_dir(exam_id)
        save_path = os.path.join(upload_dir, f"answer_sheet{ext}")
        with open(save_path, "wb") as f:
            f.write(file_bytes)

        self._paper_repo.update({"answer_paper_path": save_path}, "id = %s", (exam_id,))
        return save_path

    def save_batch_pdf(self, exam_id: int, file_bytes: bytes, filename: str) -> str:
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ALLOWED_BATCH_EXTENSIONS:
            raise ValueError(f"批量文件必须是 PDF 格式")
        if len(file_bytes) > MAX_BATCH_PDF_SIZE_MB * 1024 * 1024:
            raise ValueError(f"文件过大，上限 {MAX_BATCH_PDF_SIZE_MB}MB")

        upload_dir = self._ensure_upload_dir(exam_id)
        save_path = os.path.join(upload_dir, "batch.pdf")
        with open(save_path, "wb") as f:
            f.write(file_bytes)

        self._paper_repo.update({"batch_pdf_path": save_path}, "id = %s", (exam_id,))
        return save_path

    # ================================================================
    # Vision 调用辅助（通过 ai_gate）
    # ================================================================

    async def _call_vision(self, image_path: str, prompt: str, priority: int = 2, weight: int = 3) -> dict:
        """
        调用视觉模型，通过 ai_gate 调度。
        使用 call_vision_model（普通模式），因为 call_vision_model_json 会用
        内置 vision schema 验证导致自定义 JSON 结构被丢弃。
        """
        client = self._vision_service._client
        raw = await client.call_vision_model(image_path, prompt, priority=priority, weight=weight, expect_json=True)
        return self._parse_vision_json(raw)

    async def _pdf_to_images(self, pdf_path: str) -> list:
        """PDF 转图片列表（pdf_to_images 是同步 staticmethod）"""
        from app.domains.vision.service import VisionService
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, lambda: VisionService.pdf_to_images(pdf_path, dpi=PDF_DPI),
        )

    # ================================================================
    # 题目提取（Vision，后台线程）
    # ================================================================

    _extract_jobs: Dict[int, Dict[str, Any]] = {}

    def start_extract_questions(self, exam_id: int) -> None:
        """启动后台题目提取（非阻塞，立即返回）"""
        exam = self._paper_repo.find_by_id(exam_id)
        if not exam or not exam.get("clean_paper_path"):
            raise ValueError("请先上传干净试卷")

        # 防止重复
        job = self._extract_jobs.get(exam_id)
        if job and job.get("status") == "running":
            return

        self._extract_jobs[exam_id] = {"status": "running", "error": None}
        self._paper_repo.update_status(exam_id, "extracting")

        thread = threading.Thread(
            target=self._extract_worker,
            args=(exam_id,),
            daemon=True,
        )
        thread.start()

    def get_extract_status(self, exam_id: int) -> Optional[Dict[str, Any]]:
        return self._extract_jobs.get(exam_id)

    def _extract_worker(self, exam_id: int):
        """后台线程：逐页 OCR 提取题目"""
        job = self._extract_jobs[exam_id]
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            exam = self._paper_repo.find_by_id(exam_id)
            strategy = get_strategy(exam["subject"])
            paper_path = exam["clean_paper_path"]

            # PDF → 图片
            from app.domains.vision.service import VisionService
            if paper_path.lower().endswith(".pdf"):
                images = VisionService.pdf_to_images(paper_path, dpi=PDF_DPI)
            else:
                images = [paper_path]

            # 视觉模型提取
            prompt = strategy.build_question_extraction_prompt(len(images))
            all_questions = []

            for img_path in images:
                try:
                    parsed = loop.run_until_complete(
                        self._call_vision(img_path, prompt, priority=2, weight=3)
                    )
                    questions = parsed.get("questions", [])
                    all_questions.extend(questions)
                except Exception as e:
                    logger.error("题目提取失败 (exam=%d, img=%s): %s", exam_id, img_path, e)

            if not all_questions:
                job["status"] = "error"
                job["error"] = "未能从试卷中提取到任何题目"
                self._paper_repo.update_status(exam_id, ExamStatus.DRAFT.value)
                return

            # 写入数据库
            self._question_repo.delete_by_exam(exam_id)
            self._question_repo.batch_insert(exam_id, all_questions)
            self._paper_repo.update_status(exam_id, ExamStatus.QUESTIONS_EXTRACTED.value)

            job["status"] = "done"
            logger.info("题目提取完成 exam=%d, questions=%d", exam_id, len(all_questions))

        except Exception as e:
            logger.error("题目提取异常 exam=%d: %s", exam_id, e, exc_info=True)
            job["status"] = "error"
            job["error"] = str(e)[:200]
            self._paper_repo.update_status(exam_id, ExamStatus.DRAFT.value)
        finally:
            loop.close()

    # ================================================================
    # 答案获取
    # ================================================================

    async def extract_answer_sheet(self, exam_id: int) -> Dict[str, Any]:
        """从答案卷提取红注答案"""
        exam = self._paper_repo.find_by_id(exam_id)
        if not exam or not exam.get("answer_paper_path"):
            raise ValueError("请先上传答案卷")

        strategy = get_strategy(exam["subject"])
        answer_path = exam["answer_paper_path"]

        # PDF → 图片
        if answer_path.lower().endswith(".pdf"):
            images = await self._pdf_to_images(answer_path)
        else:
            images = [answer_path]

        prompt = strategy.build_answer_sheet_extraction_prompt()
        all_answers = []

        for img_path in images:
            try:
                parsed = await self._call_vision(img_path, prompt, priority=2, weight=3)
                answers = parsed.get("answers", [])
                all_answers.extend(answers)
            except Exception as e:
                logger.error("答案卷提取失败 (exam=%d): %s", exam_id, e)

        # 匹配验证
        exam_questions = self._question_repo.find_by_exam(exam_id)
        matched, total, warnings = verify_questions_match(exam_questions, all_answers)

        # 更新答案 — 按 section 隔离建立索引，防止跨部分串号
        # 关键修复：以前的 fallback `answer_map[num] = a` 会让乙部 Q1(1)B 串到甲部 Q1，
        # 现在改成 per-section map，只有当 answer 没有 section 标记时才允许兜底。
        answer_map_by_section: Dict[str, Dict[str, Any]] = {}
        unsectioned_map: Dict[str, Any] = {}

        for a in all_answers:
            sec = str(a.get("section", "")).strip().upper()
            num = str(a.get("question_number", "")).strip()
            if not num:
                continue
            if sec:
                answer_map_by_section.setdefault(sec, {})[num] = a
            else:
                # 极少情况：LLM 没有标 section — 只用作最末兜底
                unsectioned_map.setdefault(num, a)

        updates = []
        for q in exam_questions:
            q_sec = str(q.get("section", "")).strip().upper()
            q_num = str(q["question_number"]).strip()

            # 1. 严格同 section 匹配（唯一可靠来源）
            matched_a = answer_map_by_section.get(q_sec, {}).get(q_num)

            # 2. 兜底：仅当 LLM 完全没有标 section 时才使用
            if not matched_a:
                matched_a = unsectioned_map.get(q_num)

            if matched_a:
                updates.append({
                    "id": q["id"],
                    "reference_answer": matched_a.get("answer"),
                    "answer_source": "answer_sheet",
                })
            else:
                logger.warning(
                    "答案卷未匹配到题目: section=%s q_num=%s (exam=%d)",
                    q_sec, q_num, exam_id,
                )

        if updates:
            self._question_repo.batch_update_answers(updates)

        # 所有题目都有答案 → 状态就绪
        questions_after = self._question_repo.find_by_exam(exam_id)
        all_have_answers = all(q.get("reference_answer") for q in questions_after)
        if all_have_answers:
            self._paper_repo.update_status(exam_id, ExamStatus.ANSWERS_READY.value)

        return {
            "matched": matched,
            "total": total,
            "warnings": warnings,
            "answers_count": len(updates),
        }

    async def generate_answers_with_rag(self, exam_id: int) -> Dict[str, Any]:
        """RAG + LLM 生成参考答案"""
        exam = self._paper_repo.find_by_id(exam_id)
        if not exam:
            raise ValueError("考试不存在")

        strategy = get_strategy(exam["subject"])
        questions = self._question_repo.find_by_exam(exam_id)
        if not questions:
            raise ValueError("请先提取题目")

        generated = 0
        for q in questions:
            # 保留手動輸入和答案卷識別的答案，AI 生成的允許覆蓋
            source = q.get("answer_source") or ""
            if q.get("reference_answer") and source in ("manual", "answer_sheet"):
                continue

            # RAG 检索
            rag_context = ""
            if self._rag_func:
                try:
                    rag_context = await asyncio.get_event_loop().run_in_executor(
                        None,
                        self._rag_func,
                        q["question_text"],
                        exam["subject"],
                    )
                except Exception as e:
                    logger.warning("RAG 检索失败: %s", e)

            # LLM 生成答案（通过 ai_gate，避免 Docker localhost 问题）
            prompt = strategy.build_answer_generation_prompt(
                question_text=q["question_text"],
                question_type=q["question_type"],
                max_marks=float(q["max_marks"]),
                rag_context=rag_context or "无相关知识库内容",
                mc_options=q.get("mc_options"),
            )

            try:
                from app.infrastructure.ai_pipeline.llm_caller import call_llm_json
                result_text, _ = await call_llm_json(
                    prompt=prompt,
                    gate_task="exam_generate_answers",
                    gate_priority=2,
                    gate_weight=2,
                )
                parsed = self._parse_vision_json(result_text)
                answer = parsed.get("answer", result_text if isinstance(result_text, str) else "")
                self._question_repo.batch_update_answers([{
                    "id": q["id"],
                    "reference_answer": answer,
                    "answer_source": "rag",
                }])
                generated += 1
            except Exception as e:
                logger.error("答案生成失败 (q=%d): %s", q["id"], e)

        # 检查是否全部就绪
        questions_after = self._question_repo.find_by_exam(exam_id)
        all_have_answers = all(q.get("reference_answer") for q in questions_after)
        if all_have_answers:
            self._paper_repo.update_status(exam_id, ExamStatus.ANSWERS_READY.value)

        return {"generated": generated, "total": len(questions)}

    def confirm_answers(self, exam_id: int) -> bool:
        """教师确认答案就绪"""
        self._paper_repo.update_status(exam_id, ExamStatus.ANSWERS_READY.value)
        return True

    # ================================================================
    # PDF 切分 + 自动批改
    # ================================================================

    async def split_and_start_grading(self, exam_id: int) -> Dict[str, Any]:
        """上传批量 PDF 后：切分 → 自动开始批改"""
        exam = self._paper_repo.find_by_id(exam_id)
        if not exam:
            raise ValueError("考试不存在")
        allowed = {
            ExamStatus.ANSWERS_READY.value,
            ExamStatus.QUESTIONS_EXTRACTED.value,
            ExamStatus.COMPLETED.value,  # 允许重新批改
            ExamStatus.GRADING.value,    # 允许重新上传并重新批改
        }
        if exam["status"] not in allowed:
            raise ValueError(f"当前状态 {exam['status']} 不允许开始批改，请先提取题目并设置答案")
        if not exam.get("batch_pdf_path"):
            raise ValueError("请先上传全班 PDF")

        # 取消正在进行的批改任务
        if exam["status"] == ExamStatus.GRADING.value:
            self.cancel_grading(exam_id)
            logger.info("重新上传：已取消旧批改任务 (exam=%d)", exam_id)

        # 切分 PDF → 图片
        pdf_path = exam["batch_pdf_path"]
        all_images = await self._pdf_to_images(pdf_path)
        pages_per = exam["pages_per_exam"]

        if len(all_images) % pages_per != 0:
            logger.warning(
                "PDF 总页数 %d 不能被每份页数 %d 整除，最后一份可能不完整",
                len(all_images), pages_per,
            )

        total_students = len(all_images) // pages_per
        if total_students == 0:
            raise ValueError("PDF 页数不足，无法切分")

        # 清除旧数据
        old_papers = self._student_paper_repo.find_by_exam(exam_id)
        for old in old_papers:
            self._student_answer_repo.delete_by_paper(old["id"])
        self._student_paper_repo.delete_by_exam(exam_id)

        # 创建学生试卷记录
        papers = []
        for i in range(total_students):
            start = i * pages_per
            end = start + pages_per - 1
            papers.append({
                "student_index": i + 1,
                "page_start": start + 1,
                "page_end": end + 1,
                "image_paths": all_images[start:end + 1],
            })

        self._student_paper_repo.batch_insert(exam_id, papers)
        self._paper_repo.update(
            {"total_students": total_students, "graded_count": 0},
            "id = %s", (exam_id,),
        )
        self._paper_repo.update_status(exam_id, ExamStatus.GRADING.value)

        # 启动后台批改线程
        job = {
            "status": "running",
            "total": total_students,
            "done": 0,
            "success": 0,
            "fail": 0,
            "current_student": None,
            "cancel_flag": False,
        }
        self._grading_jobs[exam_id] = job

        thread = threading.Thread(
            target=self._grading_worker,
            args=(exam_id,),
            daemon=True,
        )
        thread.start()

        return {
            "total_students": total_students,
            "status": "running",
        }

    def get_grading_progress(self, exam_id: int) -> Dict[str, Any]:
        job = self._grading_jobs.get(exam_id)
        if job:
            return {
                "status": job["status"],
                "total": job["total"],
                "processed": job["done"],
                "success": job["success"],
                "fail": job["fail"],
                "current_student": job.get("current_student"),
            }
        # 无任务，从数据库读
        exam = self._paper_repo.find_by_id(exam_id)
        if not exam:
            return {"status": "unknown"}
        return {
            "status": "completed" if exam["status"] == "completed" else exam["status"],
            "total": exam.get("total_students", 0),
            "processed": exam.get("graded_count", 0),
            "success": exam.get("graded_count", 0),
            "fail": 0,
        }

    def cancel_grading(self, exam_id: int) -> bool:
        job = self._grading_jobs.get(exam_id)
        if job and job["status"] == "running":
            job["cancel_flag"] = True
            return True
        return False

    # ================================================================
    # 批改后台线程
    # ================================================================

    def _grading_worker(self, exam_id: int):
        """后台线程：逐份批改学生试卷"""
        job = self._grading_jobs[exam_id]
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            exam = self._paper_repo.find_by_id(exam_id)
            questions = self._question_repo.find_by_exam(exam_id)
            strategy = get_strategy(exam["subject"])
            student_papers = self._student_paper_repo.find_by_exam(exam_id)

            # 获取班级学生名册（用于自动匹配）
            roster = self._get_class_roster(exam.get("class_name", ""))

            for paper in student_papers:
                if job["cancel_flag"]:
                    job["status"] = "cancelled"
                    self._paper_repo.update_status(exam_id, ExamStatus.ANSWERS_READY.value)
                    return

                paper_id = paper["id"]
                job["current_student"] = f"#{paper['student_index']}"

                try:
                    # 1. 识别学生信息
                    self._student_paper_repo.update_status(paper_id, StudentPaperStatus.OCR_PROCESSING.value)
                    loop.run_until_complete(
                        self._recognize_student_info(paper, strategy, roster)
                    )

                    # 2. OCR 提取学生答案
                    student_answers = loop.run_until_complete(
                        self._ocr_student_answers(paper, strategy)
                    )

                    # 3. 评分
                    self._student_paper_repo.update_status(paper_id, StudentPaperStatus.GRADING.value)
                    graded_answers = loop.run_until_complete(
                        self._grade_student(paper_id, questions, student_answers, strategy, exam)
                    )

                    # 4. 保存结果
                    self._student_answer_repo.batch_upsert(paper_id, graded_answers)
                    total = calculate_total_score([
                        {"score": a.get("score")} for a in graded_answers
                    ])
                    self._student_paper_repo.update_score(paper_id, total)

                    job["success"] += 1

                except Exception as e:
                    logger.error("批改学生 #%d 失败: %s", paper["student_index"], e, exc_info=True)
                    self._student_paper_repo.update_status(
                        paper_id,
                        StudentPaperStatus.ERROR.value,
                        error_message=str(e)[:500],
                    )
                    job["fail"] += 1

                job["done"] += 1
                self._paper_repo.update(
                    {"graded_count": job["done"]},
                    "id = %s", (exam_id,),
                )

            job["status"] = "completed"
            self._paper_repo.update_status(exam_id, ExamStatus.COMPLETED.value)

        except Exception as e:
            logger.error("批改任务异常 (exam=%d): %s", exam_id, e, exc_info=True)
            job["status"] = "error"

        finally:
            loop.close()

    async def _recognize_student_info(self, paper: dict, strategy, roster: list):
        """识别卷头学生信息"""
        image_paths = paper.get("image_paths", [])
        if not image_paths:
            return

        first_page = image_paths[0]
        prompt = strategy.build_student_header_ocr_prompt()

        try:
            parsed = await self._call_vision(first_page, prompt, priority=3, weight=2)

            student_name = parsed.get("student_name")
            student_number = parsed.get("student_number")
            class_name = parsed.get("class_name")

            # 确保都是字符串（JSON 可能返回 int）
            if student_number is not None:
                student_number = str(student_number).strip()
            if class_name is not None:
                class_name = str(class_name).strip()

            logger.info(
                "学生卷头 OCR (paper=%d): name=%s, number=%s, class=%s",
                paper["id"], student_name, student_number, class_name,
            )

            # 匹配学生
            matched = match_student_to_roster(
                student_name, student_number, class_name, roster,
            )
            user_id = matched["id"] if matched else None

            # 匹配成功 → 用花名册数据覆盖 OCR（花名册比手写识别可靠）
            if matched:
                student_name = matched.get("display_name") or student_name
                student_number = str(matched.get("class_number") or matched.get("student_number") or "").strip() or student_number
                class_name = str(matched.get("class_name", "")).strip() or class_name

            logger.info(
                "学生匹配结果 (paper=%d): matched=%s (id=%s), final_name=%s",
                paper["id"],
                matched.get("display_name") if matched else "None",
                user_id,
                student_name,
            )

            self._student_paper_repo.update_student_info(
                paper["id"],
                student_name=student_name,
                student_number=student_number,
                class_name=class_name,
                user_id=user_id,
            )
        except Exception as e:
            logger.warning("学生信息识别失败 (paper=%d): %s", paper["id"], e)

    @staticmethod
    def _is_valid_mc_value(val: str) -> bool:
        """检查是否为合法的选择题答案（单个或多个 A-D 字母）"""
        import re
        cleaned = re.sub(r"[\s,，、/]+", "", val.strip().upper())
        # 全角转半角
        cleaned = cleaned.replace("Ａ", "A").replace("Ｂ", "B").replace("Ｃ", "C").replace("Ｄ", "D")
        return bool(cleaned) and all(c in "ABCD" for c in cleaned)

    async def _ocr_student_answers(self, paper: dict, strategy) -> Dict[str, Any]:
        """OCR 提取学生答案"""
        image_paths = paper.get("image_paths", [])
        prompt = strategy.build_student_ocr_prompt()

        mc_answers: Dict[str, str] = {}
        short_answers: Dict[str, str] = {}

        for img_path in image_paths:
            try:
                parsed = await self._call_vision(img_path, prompt, priority=3, weight=2)
                page_mc = parsed.get("mc_answers", {})
                page_sa = parsed.get("short_answers", {})

                # MC 合并：只保留合法选项值（A-D），且不覆盖已有正确答案
                for k, v in page_mc.items():
                    if self._is_valid_mc_value(v):
                        if k not in mc_answers:
                            mc_answers[k] = v
                    else:
                        # 非选项值（如长答文字）→ 放入 short_answers
                        logger.info("MC key '%s' 值非选项 → 移至 short_answers: %s", k, v[:60])
                        if k not in short_answers:
                            short_answers[k] = v

                # SA 合并：不覆盖已有答案
                for k, v in page_sa.items():
                    if k not in short_answers:
                        short_answers[k] = v
            except Exception as e:
                logger.warning("学生答案 OCR 失败 (img=%s): %s", img_path, e)

        # 保存原始 OCR 结果
        self._student_paper_repo.update(
            {"ocr_raw": json.dumps({"mc": mc_answers, "sa": short_answers}, ensure_ascii=False)},
            "id = %s", (paper["id"],),
        )

        return {"mc_answers": mc_answers, "short_answers": short_answers}

    async def _grade_student(
        self,
        paper_id: int,
        questions: List[dict],
        student_answers: Dict[str, Any],
        strategy,
        exam: dict,
    ) -> List[Dict[str, Any]]:
        """评分：MC 直接比对 + 简答 LLM 评分"""
        mc_answers = student_answers.get("mc_answers", {})
        short_answers = student_answers.get("short_answers", {})
        grading_mode = exam.get("grading_mode", "moderate")

        logger.info(
            "评分开始: mc_keys=%s, sa_keys=%s",
            list(mc_answers.keys()), list(short_answers.keys()),
        )

        results = []

        def _find_answer(answers: dict, q_num: str) -> str:
            """模糊匹配：先精确，再数字部分，再去前缀"""
            if q_num in answers:
                return answers[q_num]
            # 提取纯数字部分 (e.g. "B1" → "1")
            import re
            digits = re.sub(r"[^0-9]", "", q_num)
            if digits and digits in answers:
                return answers[digits]
            # 反向：answers key 含前缀 (e.g. answers["B1"] vs q_num="1")
            for k, v in answers.items():
                k_digits = re.sub(r"[^0-9]", "", k)
                if k_digits == q_num or k_digits == digits:
                    return v
            return ""

        for q in questions:
            q_num = str(q["question_number"]).strip()
            q_type = q["question_type"]

            if q_type == "mc":
                student_ans = _find_answer(mc_answers, q_num)
                ref_ans = (q.get("reference_answer") or "").strip()
                is_correct = grade_mc(student_ans, ref_ans)
                score = float(q["max_marks"]) if is_correct else 0.0

                results.append({
                    "question_id": q["id"],
                    "student_answer": student_ans,
                    "score": score,
                    "max_marks": float(q["max_marks"]),
                    "feedback": "正确" if is_correct else f"正确答案: {ref_ans}",
                    "graded_by": GradedBy.AI.value,
                })

            elif q_type == "short_answer":
                student_ans = _find_answer(short_answers, q_num)
                ref_ans = q.get("reference_answer") or ""

                if not student_ans.strip():
                    results.append({
                        "question_id": q["id"],
                        "student_answer": "",
                        "score": 0.0,
                        "max_marks": float(q["max_marks"]),
                        "feedback": "未作答",
                        "graded_by": GradedBy.AI.value,
                    })
                    continue

                # LLM 评分
                prompt = strategy.build_grading_prompt(
                    question_text=q["question_text"],
                    reference_answer=ref_ans,
                    student_answer=student_ans,
                    max_marks=float(q["max_marks"]),
                    grading_mode=grading_mode,
                )

                try:
                    from app.infrastructure.ai_pipeline.llm_caller import call_llm_json
                    ai_text, _ = await call_llm_json(
                        prompt=prompt,
                        gate_task="exam_grade_sa",
                        gate_priority=3,
                        gate_weight=2,
                    )
                    parsed = self._parse_vision_json(ai_text)
                    score = min(float(parsed.get("score", 0)), float(q["max_marks"]))
                    feedback = parsed.get("feedback", "")
                except Exception as e:
                    logger.warning("简答题评分失败 (q=%d): %s", q["id"], e)
                    score = 0.0
                    feedback = f"评分出错: {str(e)[:100]}"

                results.append({
                    "question_id": q["id"],
                    "student_answer": student_ans,
                    "score": score,
                    "max_marks": float(q["max_marks"]),
                    "feedback": feedback,
                    "graded_by": GradedBy.AI.value,
                })

        return results

    # ================================================================
    # 结果查询 + 调分
    # ================================================================

    def get_student_papers(self, exam_id: int) -> List[Dict[str, Any]]:
        papers = self._student_paper_repo.find_by_exam(exam_id)
        # 计算考试总分供前端显示
        questions = self._question_repo.find_by_exam(exam_id)
        total_max = sum(float(q.get("max_marks", 0)) for q in questions)
        for p in papers:
            p["max_score"] = total_max
        return papers

    def get_student_answers(self, paper_id: int) -> List[Dict[str, Any]]:
        answers = self._student_answer_repo.find_by_paper(paper_id)
        # 关联题目信息，字段名与前端对齐
        if answers:
            paper = self._student_paper_repo.find_by_id(paper_id)
            if paper:
                questions = self._question_repo.find_by_exam(paper["exam_id"])
                q_map = {q["id"]: q for q in questions}
                for ans in answers:
                    q = q_map.get(ans.get("question_id"))
                    if q:
                        ans["question_number"] = q["question_number"]
                        ans["section"] = q["section"]
                        ans["question_type"] = q["question_type"]
                        ans["question_text"] = q["question_text"]
                        ans["reference_answer"] = q.get("reference_answer")
                        # 前端所需的别名
                        ans["question_content"] = q["question_text"]
                        ans["correct_answer"] = q.get("reference_answer", "")
                        ans["max_score"] = float(q.get("max_marks", 0))
        return answers

    def adjust_score(self, answer_id: int, score: float, feedback: Optional[str] = None) -> Dict[str, Any]:
        """教师调分"""
        answer = self._student_answer_repo.find_by_id(answer_id)
        if not answer:
            raise ValueError("答案记录不存在")

        max_marks = float(answer.get("max_marks", 0))
        if score > max_marks:
            raise ValueError(f"分数不能超过满分 {max_marks}")

        self._student_answer_repo.update_score(answer_id, score, feedback, "teacher")

        # 重算总分
        paper_id = answer["student_paper_id"]
        all_answers = self._student_answer_repo.find_by_paper(paper_id)
        total = calculate_total_score([{"score": a.get("score")} for a in all_answers])
        self._student_paper_repo.update_score(paper_id, total)

        return self._student_answer_repo.find_by_id(answer_id)

    def get_statistics(self, exam_id: int) -> Dict[str, Any]:
        papers = self._student_paper_repo.find_by_exam(exam_id)
        scores = [float(p["total_score"]) for p in papers if p.get("total_score") is not None]
        exam = self._paper_repo.find_by_id(exam_id)

        questions = self._question_repo.find_by_exam(exam_id)
        total_max = sum(float(q.get("max_marks", 0)) for q in questions)

        stats = compute_statistics(scores, total_students=exam.get("total_students", 0) if exam else 0)

        # ── 及格率 & 中位数 & 等级分布 ──
        pass_rate = None
        median_score = None
        grade_distribution = {"A+": 0, "A": 0, "B": 0, "C": 0, "D": 0, "F": 0}
        if scores and total_max > 0:
            pass_count = sum(1 for s in scores if s / total_max >= 0.5)
            pass_rate = round(pass_count / len(scores) * 100, 1)
            sorted_scores = sorted(scores)
            n = len(sorted_scores)
            median_score = round(
                sorted_scores[n // 2] if n % 2 else (sorted_scores[n // 2 - 1] + sorted_scores[n // 2]) / 2, 1
            )
            for s in scores:
                pct = s / total_max * 100
                if pct >= 90:
                    grade_distribution["A+"] += 1
                elif pct >= 80:
                    grade_distribution["A"] += 1
                elif pct >= 70:
                    grade_distribution["B"] += 1
                elif pct >= 50:
                    grade_distribution["C"] += 1
                elif pct >= 40:
                    grade_distribution["D"] += 1
                else:
                    grade_distribution["F"] += 1

        # ── 每题统计 ──
        all_answers = self._student_answer_repo.find_by_exam_with_questions(exam_id)
        # 建立题目参考答案映射
        q_ref_map = {q["id"]: q for q in questions}
        per_question: Dict[int, Dict[str, Any]] = {}
        for ans in all_answers:
            qid = ans["question_id"]
            if qid not in per_question:
                per_question[qid] = {
                    "question_number": ans.get("question_number"),
                    "section": ans.get("section"),
                    "question_type": ans.get("question_type"),
                    "question_text": (ans.get("question_text") or "")[:80],
                    "max_marks": float(ans.get("q_max_marks", 0)),
                    "scores": [],
                    "mc_choices": [],  # 收集 MC 选项分布
                }
            if ans.get("score") is not None:
                per_question[qid]["scores"].append(float(ans["score"]))
            # MC 选项分布
            if ans.get("question_type") == "mc" and ans.get("student_answer"):
                per_question[qid]["mc_choices"].append(
                    ans["student_answer"].strip().upper()[:1]
                )

        per_question_stats = []
        # 分部统计
        section_totals: Dict[str, Dict[str, float]] = {}
        for qid, info in per_question.items():
            s_list = info["scores"]
            avg = round(sum(s_list) / len(s_list), 1) if s_list else 0
            max_m = info["max_marks"]
            score_rate = round(avg / max_m * 100, 1) if max_m > 0 else 0

            correct_rate = None
            if info["question_type"] == "mc" and s_list:
                correct_rate = round(
                    sum(1 for s in s_list if s > 0) / len(s_list) * 100, 1
                )

            # MC 选项分布
            mc_dist = None
            if info["question_type"] == "mc" and info["mc_choices"]:
                mc_dist = {"A": 0, "B": 0, "C": 0, "D": 0}
                for ch in info["mc_choices"]:
                    if ch in mc_dist:
                        mc_dist[ch] += 1
                ref_q = q_ref_map.get(qid)
                mc_dist["_correct"] = (ref_q.get("reference_answer") or "").strip().upper()[:1] if ref_q else ""

            pqs = {
                "question_number": info["question_number"],
                "section": info["section"],
                "question_type": info["question_type"],
                "question_text": info["question_text"],
                "max_marks": max_m,
                "average_score": avg,
                "score_rate": score_rate,
                "correct_rate": correct_rate,
            }
            if mc_dist:
                pqs["mc_distribution"] = mc_dist
            per_question_stats.append(pqs)

            # 累计分部统计
            sec = info["section"]
            if sec not in section_totals:
                section_totals[sec] = {"sum_score": 0, "sum_max": 0, "count": 0}
            if s_list:
                section_totals[sec]["sum_score"] += sum(s_list)
                section_totals[sec]["sum_max"] += max_m * len(s_list)
                section_totals[sec]["count"] += 1

        section_stats = {}
        for sec, st in section_totals.items():
            avg_rate = round(st["sum_score"] / st["sum_max"] * 100, 1) if st["sum_max"] > 0 else 0
            section_stats[sec] = {
                "avg_rate": avg_rate,
                "question_count": st["count"],
            }

        return {
            **stats.__dict__,
            "total_max": total_max,
            "pass_rate": pass_rate,
            "median_score": median_score,
            "grade_distribution": grade_distribution,
            "section_stats": section_stats,
            "per_question_stats": per_question_stats,
        }

    # ================================================================
    # 发放 / 撤回
    # ================================================================

    def publish_exam(self, exam_id: int) -> Dict[str, Any]:
        """发放考试结果给学生"""
        from datetime import datetime
        exam = self._paper_repo.find_by_id(exam_id)
        if not exam:
            raise ValueError("考试不存在")
        if exam["status"] != ExamStatus.COMPLETED.value:
            raise ValueError("只能发放已完成批改的考试")
        self._paper_repo.update(
            {"is_published": 1, "published_at": datetime.now()},
            "id = %s", (exam_id,),
        )
        return {"is_published": True}

    def unpublish_exam(self, exam_id: int) -> Dict[str, Any]:
        """撤回发放"""
        self._paper_repo.update(
            {"is_published": 0, "published_at": None},
            "id = %s", (exam_id,),
        )
        return {"is_published": False}

    # ================================================================
    # AI 全班总结
    # ================================================================

    async def generate_class_summary(self, exam_id: int) -> str:
        """AI 生成全班表现总结"""
        from app.infrastructure.ai_pipeline.llm_caller import call_llm_json

        stats = self.get_statistics(exam_id)
        exam = self._paper_repo.find_by_id(exam_id)
        title = exam.get("title", "考试") if exam else "考试"
        subject = exam.get("subject", "") if exam else ""
        class_name = exam.get("class_name", "") if exam else ""

        # 构建数据摘要给 LLM
        pqs_lines = []
        for q in stats.get("per_question_stats", []):
            line = f"  {q.get('section','')}{q.get('question_number','')}"
            line += f"（{'選擇題' if q.get('question_type') == 'mc' else '簡答題'}，"
            line += f"滿分{q.get('max_marks', 0)}）"
            line += f"得分率 {q.get('score_rate', 0)}%"
            if q.get('correct_rate') is not None:
                line += f"，正確率 {q['correct_rate']}%"
            pqs_lines.append(line)

        sec_lines = []
        sec_labels = {"A": "甲部（選擇題）", "B": "乙部（簡答題）"}
        for sec, info in stats.get("section_stats", {}).items():
            sec_lines.append(f"  {sec_labels.get(sec, sec)}：平均得分率 {info.get('avg_rate', 0)}%")

        grade_lines = []
        for grade, count in stats.get("grade_distribution", {}).items():
            if count > 0:
                grade_lines.append(f"  {grade}: {count} 人")

        data_text = f"""考試：{title}
科目：{subject}
班級：{class_name}
總分：{stats.get('total_max', 0)}
考生人數：{stats.get('total_students', 0)}
平均分：{stats.get('average_score')}
最高分：{stats.get('highest_score')}
最低分：{stats.get('lowest_score')}
中位數：{stats.get('median_score')}
及格率：{stats.get('pass_rate')}%
標準差：{stats.get('std_deviation')}

等級分佈：
{chr(10).join(grade_lines) if grade_lines else '  無數據'}

分部表現：
{chr(10).join(sec_lines) if sec_lines else '  無數據'}

各題表現：
{chr(10).join(pqs_lines) if pqs_lines else '  無數據'}"""

        prompt = f"""你是一位資深教師，請根據以下全班考試數據，撰寫一份專業的全班表現總結報告。

{data_text}

要求：
1. 用繁體中文撰寫
2. 以 JSON 格式輸出：{{"summary": "報告內容"}}
3. 報告需包含以下部分（用段落分隔，不用 markdown）：
   - 整體表現概述（一句話總結全班水平）
   - 成績分布分析（等級分布是否合理、是否有兩極化現象）
   - 強弱項分析（哪些題目表現好、哪些題目需要加強）
   - 甲部 vs 乙部比較（選擇題和簡答題的表現差異）
   - 教學建議（針對薄弱環節的具體改進建議，2-3 條）
4. 語氣專業客觀，約 200-300 字
5. 不要用 * 號、# 號等 markdown 符號"""

        content, _ = await call_llm_json(
            prompt=prompt,
            gate_task="exam_summary",
            gate_priority=2,
            gate_weight=3,
        )
        # 解析 JSON
        parsed = self._parse_vision_json(content)
        return parsed.get("summary", content)

    # ================================================================
    # 辅助
    # ================================================================

    def _get_class_roster(self, class_name: str) -> List[Dict[str, Any]]:
        """获取班级学生名册"""
        if not self._user_repo or not class_name:
            return []
        try:
            return self._user_repo.find_all(
                where="class_name = %s AND role = 'student' AND is_active = 1",
                params=(class_name,),
            )
        except Exception:
            return []

    @staticmethod
    def _parse_vision_json(result) -> dict:
        """安全解析 Vision/LLM 返回的 JSON"""
        if isinstance(result, dict):
            return result
        if not isinstance(result, str):
            result = str(result)

        # 尝试直接解析
        try:
            return json.loads(result)
        except (json.JSONDecodeError, TypeError):
            pass

        # 提取 ```json ... ``` 代码块
        import re
        match = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", result, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except (json.JSONDecodeError, TypeError):
                pass

        # 提取 { ... } 块
        match = re.search(r"\{.*\}", result, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except (json.JSONDecodeError, TypeError):
                pass

        return {}
