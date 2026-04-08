#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
英文默書模組 Service
====================
業務層（含權限、狀態流、背景 OCR 任務），不直接碰 SQL、
不直接拼 HTTP 回應；SQL 走 repository，輸入輸出用 dict / schema。

狀態機:
    submission.status:
        submitted → ocr_processing → graded
                                  ↘ ocr_failed (可 re-ocr)

背景任務:
    submit_dictation() 會 schedule _process_submission_ocr()；
    用 asyncio.create_task，單機單 worker 情境下足夠；
    若未來要放多 worker / queue，只改這一個 schedule 點。
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import UploadFile

from app.core.exceptions import (
    AuthorizationError,
    NotFoundError,
    ValidationError,
)
from app.domains.dictation.comparator import compare_dictation
from app.domains.dictation.constants import (
    MAX_FILE_SIZE,
    MAX_FILES_PER_SUBMISSION,
    SUPPORTED_IMAGE_EXTS,
    UPLOAD_DIR,
    DictationStatus,
    Language,
    Mode,
    SubmissionStatus,
    detect_language,
)
from app.domains.dictation.repository import (
    DictationRepository,
    DictationSubmissionFileRepository,
    DictationSubmissionRepository,
)
from app.domains.dictation.grader import DictationGrader, GradingResult
from app.domains.handwriting_ocr.registry import HandwritingOCRRegistry
from app.domains.vision.schemas import RecognitionSubject, RecognitionTask
from app.domains.vision.service import VisionService

logger = logging.getLogger(__name__)


class DictationService:
    """默書業務層 — 串流程,不做 OCR 細節也不做判分細節。"""

    def __init__(
        self,
        dictation_repo: DictationRepository,
        submission_repo: DictationSubmissionRepository,
        file_repo: DictationSubmissionFileRepository,
        handwriting_ocr_registry: HandwritingOCRRegistry,
        vision_service: VisionService,
        user_repo=None,
        grader_provider=None,
        usage_recorder_provider=None,
        settings=None,
    ):
        """
        Args:
            handwriting_ocr_registry: 學生提交圖 → forensic OCR
                (這條 path 必須嚴禁糾錯)
            vision_service: 老師上傳的「參考原文」抽取使用
                (這條 path 是印刷體文字,用 LLM 通用 OCR 是 OK 的;
                 它與學生 forensic 路徑徹底分離)
            grader_provider: 0-arg callable 回傳 DictationGrader | None。
                用 callable 而非直接傳 grader 是因為 grader 依賴 ask_ai,
                而 ask_ai 在 inject_ai_functions() 時才注入,可能晚於
                DictationService 構造。每次呼叫時拿最新狀態。
            usage_recorder_provider: 0-arg callable 回傳 LlmUsageService。
                用於把 OCR / grader 的 LLM 呼叫記錄到 llm_usage 表,
                讓管理後台可以看到。同樣 callable 注入,避免循環依賴。
            settings: app 全域設定,讀取 grader / OCR 信心閾值
        """
        self._dict_repo = dictation_repo
        self._sub_repo = submission_repo
        self._file_repo = file_repo
        self._ocr_registry = handwriting_ocr_registry
        self._vision = vision_service
        self._user_repo = user_repo
        self._grader_provider = grader_provider or (lambda: None)
        self._usage_recorder_provider = usage_recorder_provider or (lambda: None)
        self._settings = settings

        # 確保上傳資料夾存在
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    # ================================================================
    # 佈置目標 (班級 / 學生清單)
    # ================================================================

    def get_available_targets(self) -> Dict[str, Any]:
        """回傳可佈置的班級與學生清單,供前端 picker 使用。"""
        if not self._user_repo:
            return {"classes": [], "students": []}

        rows = self._user_repo.raw_query(
            "SELECT DISTINCT class_name FROM users "
            "WHERE class_name IS NOT NULL AND class_name != '' "
            "ORDER BY class_name"
        )
        classes = [r["class_name"] for r in rows]

        students = self._user_repo.find_all(
            where="role = 'student' AND is_active = 1",
            columns="id, username, display_name, class_name",
            order_by="class_name ASC, username ASC",
        )
        return {"classes": classes, "students": students}

    # ================================================================
    # 文件 / 照片 → 原文文字
    # ================================================================

    async def extract_reference_text(self, file: UploadFile) -> Dict[str, Any]:
        """從老師上傳的文件或照片中抽取純文字,填入 reference_text。

        支援:
          - 文件 (.txt .md .pdf .docx .pptx) — 走 llm.rag.file_processor
          - 圖片 (jpg/png/webp...)         — 走 vision 模型 OCR

        回傳:
            {"text": str, "source": "file"|"image", "length": int}
        """
        original = file.filename or "unnamed"
        ext = Path(original).suffix.lower()
        content = await file.read()
        if not content:
            raise ValidationError("檔案為空")

        # ── 圖片走 OCR ─────────────────────────────
        if ext in SUPPORTED_IMAGE_EXTS:
            if len(content) > MAX_FILE_SIZE:
                raise ValidationError(
                    f"圖片過大 (上限 {MAX_FILE_SIZE // 1024 // 1024}MB)",
                )
            tmp_name = f"{uuid.uuid4().hex}{ext}"
            tmp_path = UPLOAD_DIR / tmp_name
            with open(tmp_path, "wb") as fh:
                fh.write(content)
            try:
                # 原文是印刷體英文,用通用英文 OCR (QUESTION_AND_ANSWER) 比
                # dictation task 更適合,因為 dictation 會把印刷字當 question
                result = await self._vision.recognize(
                    str(tmp_path),
                    RecognitionSubject.ENGLISH,
                    RecognitionTask.QUESTION_AND_ANSWER,
                )
                text = (result.question_text or result.answer_text
                        or result.raw_text or "").strip()
            finally:
                try:
                    tmp_path.unlink()
                except Exception:
                    pass

            if not text:
                raise ValidationError("未能從圖片辨識到文字")
            return {"text": text, "source": "image", "length": len(text)}

        # ── 文件走 FileProcessor ────────────────────
        tmp_name = f"{uuid.uuid4().hex}{ext or '.bin'}"
        tmp_path = UPLOAD_DIR / tmp_name
        with open(tmp_path, "wb") as fh:
            fh.write(content)
        try:
            from llm.rag.file_processor import FileProcessor
            processor = FileProcessor()
            success, text, _info = processor.process_file(
                str(tmp_path), original,
            )
        finally:
            try:
                tmp_path.unlink()
            except Exception:
                pass

        if not success or not text or not text.strip():
            raise ValidationError("未能從文件抽取到文字 (格式不支援或內容為空)")
        return {"text": text.strip(), "source": "file", "length": len(text)}

    # ================================================================
    # 老師端：CRUD
    # ================================================================

    def create_dictation(
        self,
        teacher_id: int,
        teacher_name: str,
        title: str,
        reference_text: str,
        description: str = "",
        language: str = Language.ENGLISH,
        mode: str = Mode.PARAGRAPH,
        lenient_variants: Optional[bool] = None,
        target_type: str = "all",
        target_value: str = "",
        deadline: Optional[datetime] = None,
        allow_late: bool = False,
    ) -> Dict[str, Any]:
        """建立默書草稿"""
        if not title.strip():
            raise ValidationError("標題不能為空")
        if not reference_text.strip():
            raise ValidationError("默書原文不能為空")
        if language not in (Language.ENGLISH, Language.CHINESE):
            raise ValidationError("不支援的語言")
        if mode not in (Mode.PARAGRAPH, Mode.WORD_LIST):
            raise ValidationError("不支援的模式")
        # 中文目前只支援段落模式
        if language == Language.CHINESE and mode == Mode.WORD_LIST:
            mode = Mode.PARAGRAPH

        ref = reference_text.strip()
        insert_data: Dict[str, Any] = {
            "title": title.strip(),
            "description": description or "",
            "reference_text": ref,
            "language": language,
            "mode": mode,
            "created_by": teacher_id,
            "created_by_name": teacher_name,
            "target_type": target_type,
            "target_value": target_value or "",
            "status": DictationStatus.DRAFT.value,
            "deadline": deadline,
            "allow_late": 1 if allow_late else 0,
        }
        # 只在呼叫者顯式給值時寫入 lenient_variants;否則由 DB schema
        # DEFAULT 1 接手 — 單一真相來源
        if lenient_variants is not None:
            insert_data["lenient_variants"] = 1 if lenient_variants else 0
        dictation_id = self._dict_repo.insert_get_id(insert_data)
        logger.info("老師 %s 建立默書 #%d: %s", teacher_name, dictation_id, title)
        return self.get_dictation_detail(dictation_id)

    def update_dictation(
        self, dictation_id: int, teacher_id: int, data: Dict[str, Any],
    ) -> Dict[str, Any]:
        self._get_dictation_or_raise(dictation_id, owner_id=teacher_id)
        update_data = {k: v for k, v in data.items() if v is not None}
        if not update_data:
            return self.get_dictation_detail(dictation_id)

        if "allow_late" in update_data:
            update_data["allow_late"] = 1 if update_data["allow_late"] else 0

        if "lenient_variants" in update_data:
            update_data["lenient_variants"] = 1 if update_data["lenient_variants"] else 0

        # 中文不允許 word_list
        if update_data.get("language") == Language.CHINESE:
            update_data["mode"] = Mode.PARAGRAPH

        self._dict_repo.update(
            data=update_data, where="id = %s", params=(dictation_id,),
        )
        return self.get_dictation_detail(dictation_id)

    def publish_dictation(self, dictation_id: int, teacher_id: int) -> Dict[str, Any]:
        self._get_dictation_or_raise(dictation_id, owner_id=teacher_id)
        self._dict_repo.update(
            data={
                "status": DictationStatus.PUBLISHED.value,
                "published_at": datetime.now(),
            },
            where="id = %s",
            params=(dictation_id,),
        )
        return self.get_dictation_detail(dictation_id)

    def close_dictation(self, dictation_id: int, teacher_id: int) -> Dict[str, Any]:
        self._get_dictation_or_raise(dictation_id, owner_id=teacher_id)
        self._dict_repo.update(
            data={"status": DictationStatus.CLOSED.value},
            where="id = %s",
            params=(dictation_id,),
        )
        return self.get_dictation_detail(dictation_id)

    def delete_dictation(self, dictation_id: int, teacher_id: int) -> bool:
        self._get_dictation_or_raise(dictation_id, owner_id=teacher_id)
        self._dict_repo.soft_delete_by_id(dictation_id)
        return True

    def list_teacher_dictations(
        self, teacher_id: int, status: str = "",
        page: int = 1, page_size: int = 20,
    ) -> Dict[str, Any]:
        return self._dict_repo.find_active(
            status=status,
            created_by=teacher_id,
            page=page,
            page_size=page_size,
        )

    def get_dictation_detail(
        self, dictation_id: int, include_reference: bool = True,
    ) -> Dict[str, Any]:
        row = self._dict_repo.find_by_id(dictation_id)
        if not row or row.get("is_deleted"):
            raise NotFoundError("默書不存在")

        if not include_reference:
            row = dict(row)
            row["reference_text"] = ""

        # 附上提交統計
        stats = self._dict_repo.raw_query_one(
            "SELECT COUNT(*) AS total, "
            "SUM(CASE WHEN status = 'graded' THEN 1 ELSE 0 END) AS graded "
            "FROM dictation_submissions WHERE dictation_id = %s",
            (dictation_id,),
        ) or {}
        row["submission_total"] = int(stats.get("total") or 0)
        row["submission_graded"] = int(stats.get("graded") or 0)
        return row

    # ================================================================
    # 學生端：列表與提交
    # ================================================================

    def list_student_dictations(
        self, student_id: int, student_class: str = "", student_username: str = "",
    ) -> List[Dict[str, Any]]:
        items = self._dict_repo.find_published_for_student(
            student_id=student_id,
            student_class=student_class,
            student_username=student_username,
        )
        # 附上該生的 submission 狀態
        for it in items:
            sub = self._sub_repo.find_by_dictation_student(it["id"], student_id)
            it["my_submission"] = _minimal_submission(sub) if sub else None
            # 學生列表不回傳 reference_text（避免洩題）
            it["reference_text"] = ""
        return items

    async def submit_dictation(
        self,
        dictation_id: int,
        student: Dict[str, Any],
        files: List[UploadFile],
    ) -> Dict[str, Any]:
        """學生提交默書 (拍照上傳)。

        步驟:
            1. 權限/狀態/截止日期檢查
            2. 儲存檔案
            3. 建立/覆寫 submission 記錄 (狀態 ocr_processing)
            4. 背景啟動 OCR + 比對任務
            5. 立即回傳 submission (前端可 poll 狀態)
        """
        dictation = self._get_dictation_or_raise(dictation_id)

        if dictation["status"] != DictationStatus.PUBLISHED.value:
            raise ValidationError("該默書尚未發布或已關閉")

        # 截止日期檢查
        if dictation.get("deadline") and not dictation.get("allow_late"):
            deadline = dictation["deadline"]
            if isinstance(deadline, str):
                deadline = datetime.fromisoformat(deadline)
            if datetime.now() > deadline:
                raise ValidationError("已過截止日期")

        if not files:
            raise ValidationError("至少需上傳一張圖片")
        if len(files) > MAX_FILES_PER_SUBMISSION:
            raise ValidationError(
                f"最多只能上傳 {MAX_FILES_PER_SUBMISSION} 張圖片",
            )

        student_id = student["id"]

        # 若已有提交，刪舊檔記錄 & 重置欄位
        existing = self._sub_repo.find_by_dictation_student(
            dictation_id, student_id,
        )
        if existing:
            submission_id = existing["id"]
            self._sub_repo.update(
                data={
                    "status": SubmissionStatus.OCR_PROCESSING.value,
                    "ocr_text": None,
                    "diff_result": None,
                    "score": None,
                    "correct_count": None,
                    "wrong_count": None,
                    "missing_count": None,
                    "extra_count": None,
                    "teacher_feedback": None,
                    "submitted_at": datetime.now(),
                    "graded_at": None,
                },
                where="id = %s",
                params=(submission_id,),
            )
            self._file_repo.delete_by_submission(submission_id)
        else:
            submission_id = self._sub_repo.insert_get_id({
                "dictation_id": dictation_id,
                "student_id": student_id,
                "student_name": student.get("display_name", ""),
                "username": student.get("username", ""),
                "class_name": student.get("class_name", ""),
                "status": SubmissionStatus.OCR_PROCESSING.value,
                "submitted_at": datetime.now(),
            })

        # 儲存檔案（依序 await）
        saved_files: List[Dict[str, Any]] = []
        for page_order, f in enumerate(files):
            saved = await self._save_upload_file(submission_id, f, page_order)
            saved_files.append(saved)

        logger.info(
            "學生 %s 提交默書 #%d (%d 張圖)",
            student.get("username"), dictation_id, len(saved_files),
        )

        # 背景啟動 OCR 任務 (fire-and-forget)
        asyncio.create_task(self._process_submission_ocr(submission_id))

        return self.get_submission_detail(
            submission_id, viewer_is_student=True, reveal_reference=False,
        )

    async def _save_upload_file(
        self, submission_id: int, file: UploadFile, page_order: int,
    ) -> Dict[str, Any]:
        original_name = file.filename or "unnamed"
        ext = Path(original_name).suffix.lower()
        if ext not in SUPPORTED_IMAGE_EXTS:
            raise ValidationError(f"不支援的圖片格式: {ext}")

        content = await file.read()
        size = len(content)
        if size > MAX_FILE_SIZE:
            raise ValidationError(
                f"檔案過大 (上限 {MAX_FILE_SIZE // 1024 // 1024}MB)",
            )

        stored_name = f"{uuid.uuid4().hex}{ext}"
        path = UPLOAD_DIR / stored_name
        with open(path, "wb") as fh:
            fh.write(content)

        file_id = self._file_repo.insert_get_id({
            "submission_id": submission_id,
            "original_name": original_name,
            "stored_name": stored_name,
            "file_path": f"uploads/dictation/{stored_name}",
            "file_size": size,
            "page_order": page_order,
        })
        return {
            "id": file_id,
            "original_name": original_name,
            "stored_name": stored_name,
            "file_path": f"uploads/dictation/{stored_name}",
            "file_size": size,
            "page_order": page_order,
        }

    # ================================================================
    # 核心流程：背景 OCR + 比對
    # ================================================================

    async def _process_submission_ocr(self, submission_id: int) -> None:
        """背景任務:OCR → 比對 → 落庫 → status 轉移。

        這個方法只做四件事的串接,每件事是一個私有 helper:
          1. _load_submission_context()  載入 submission/dictation/files
          2. _ocr_pages()                呼叫 registry 跑 OCR (含 fallback)
          3. compare_dictation()          純函數機械 diff
          4. _save_ocr_result()           落庫 + 狀態轉移
        """
        try:
            ctx = self._load_submission_context(submission_id)
            if ctx is None:
                return  # already logged + status set

            submission, dictation, files = ctx
            language = dictation.get("language") or detect_language(
                dictation.get("reference_text") or ""
            )
            mode = dictation.get("mode") or Mode.PARAGRAPH

            student_id = submission.get("student_id")

            ocr_text, ocr_engine, ocr_conf = await self._ocr_pages(
                files, language, student_id=student_id,
            )
            if not ocr_text:
                self._mark_failed(submission_id, "OCR 未辨識到任何文字")
                return

            diff = compare_dictation(
                reference=dictation["reference_text"],
                ocr=ocr_text,
                language=language,
                mode=mode,
                lenient_variants=bool(dictation.get("lenient_variants", 1)),
            )

            grading = await self._maybe_grade(
                reference=dictation["reference_text"],
                ocr_text=ocr_text,
                diff=diff,
                language=language,
                mode=mode,
                student_id=student_id,
            )

            self._save_ocr_result(
                submission_id=submission_id,
                ocr_text=ocr_text,
                ocr_engine=ocr_engine,
                ocr_confidence=ocr_conf,
                diff=diff,
                grading=grading,
            )
            logger.info(
                "默書 submission #%d OCR 完成 engine=%s accuracy=%.1f%% grader=%s",
                submission_id, ocr_engine, diff["accuracy"],
                "ok" if (grading and grading.success) else "skipped",
            )

        except Exception as e:  # 兜底:任何錯誤都要把狀態落地,避免卡在 processing
            logger.exception("默書 OCR 處理失敗 submission=%s", submission_id)
            self._mark_failed(submission_id, f"OCR 失敗: {e}")

    def _load_submission_context(self, submission_id: int):
        """載入 submission + dictation + files,失敗時 log + 標記並回 None"""
        submission = self._sub_repo.find_by_id(submission_id)
        if not submission:
            logger.warning("OCR 任務找不到 submission #%d", submission_id)
            return None
        dictation = self._dict_repo.find_by_id(submission["dictation_id"])
        if not dictation:
            logger.warning("OCR 任務找不到 dictation #%d", submission["dictation_id"])
            return None
        files = self._file_repo.find_by_submission(submission_id)
        if not files:
            self._mark_failed(submission_id, "沒有上傳圖片")
            return None
        return submission, dictation, files

    async def _ocr_pages(
        self,
        files: List[Dict[str, Any]],
        language: str,
        student_id: Optional[int] = None,
    ) -> tuple[str, str, float]:
        """逐張呼叫 registry,合併文字。回傳 (text, engine_name, mean_confidence)。

        每張圖記一筆 llm_usage,purpose='dictation_ocr',讓管理後台
        看得到 OCR 流量。
        """
        import time
        base_dir = Path(__file__).resolve().parent.parent.parent.parent
        pieces: List[str] = []
        engines_used: List[str] = []
        confidences: List[float] = []

        for f in files:
            image_path = str(base_dir / f["file_path"])
            t0 = time.monotonic()
            result = await self._ocr_registry.recognize_with_fallback(
                image_path, language,
            )
            duration_ms = int((time.monotonic() - t0) * 1000)
            await self._record_usage(
                user_id=student_id,
                provider="ollama" if result.engine == "vision_llm" else "local",
                model=result.engine or "unknown",
                purpose="dictation_ocr",
                duration_ms=duration_ms,
                status="ok" if result.success else "error",
            )
            if result.success and result.text:
                pieces.append(result.text)
                engines_used.append(result.engine)
                confidences.append(result.confidence or 0.0)

        merged = "\n".join(pieces).strip()
        engine_name = engines_used[0] if engines_used else "none"
        mean_conf = (
            sum(confidences) / len(confidences) if confidences else 0.0
        )
        return merged, engine_name, mean_conf

    async def _maybe_grade(
        self,
        *,
        reference: str,
        ocr_text: str,
        diff: Dict[str, Any],
        language: str,
        mode: str,
        student_id: Optional[int] = None,
    ) -> Optional[GradingResult]:
        """選擇性呼叫 LLM grader,失敗回 None,service 自動降級為 difflib 分數。

        記一筆 llm_usage purpose='dictation_grading' 讓管理後台看得到。
        """
        import time
        grader = self._grader_provider() if self._grader_provider else None
        if grader is None:
            return None
        t0 = time.monotonic()
        try:
            result = await grader.grade(
                reference=reference,
                student_text=ocr_text,
                diff=diff,
                language=language,
                mode=mode,
            )
            duration_ms = int((time.monotonic() - t0) * 1000)
            await self._record_usage(
                user_id=student_id,
                provider="ollama",
                model="grader_llm",
                purpose="dictation_grading",
                duration_ms=duration_ms,
                status="ok" if result.success else "error",
            )
            return result
        except Exception as e:
            duration_ms = int((time.monotonic() - t0) * 1000)
            await self._record_usage(
                user_id=student_id,
                provider="ollama",
                model="grader_llm",
                purpose="dictation_grading",
                duration_ms=duration_ms,
                status="error",
            )
            logger.warning("dictation grader error (will fall back to diff): %s", e)
            return None

    async def _record_usage(
        self,
        *,
        user_id: Optional[int],
        provider: str,
        model: str,
        purpose: str,
        duration_ms: Optional[int],
        status: str,
    ) -> None:
        """把一條 LLM 呼叫記到 llm_usage 表。安靜失敗 — 不能讓記錄錯誤
        影響主流程。"""
        recorder = self._usage_recorder_provider() if self._usage_recorder_provider else None
        if recorder is None:
            return
        try:
            await recorder.record_async(
                user_id=user_id,
                provider=provider,
                model=model,
                purpose=purpose,
                usage_dict={},  # vision/grader 沒有 token 數,留空
                duration_ms=duration_ms,
                status=status,
            )
        except Exception as e:
            logger.debug("llm_usage record_async failed (non-fatal): %s", e)

    def _save_ocr_result(
        self,
        *,
        submission_id: int,
        ocr_text: str,
        ocr_engine: str,
        ocr_confidence: float,
        diff: Dict[str, Any],
        grading: Optional[GradingResult],
    ) -> None:
        """落庫:OCR 結果 + diff + LLM 判分,並由 _decide_final_status 決定狀態。

        分數規則:有 grader 結果用 grader.score,否則用 difflib accuracy。
        """
        from app.domains.dictation.grader import DictationGrader as _DG

        if grading and grading.success:
            score = grading.score
            grading_dict = _DG.grading_to_dict(grading)
        else:
            score = diff["accuracy"]
            grading_dict = None

        final_status = self._decide_final_status(
            ocr_confidence=ocr_confidence, grading=grading,
        )

        self._sub_repo.update(
            data={
                "status": final_status.value,
                "ocr_text": ocr_text,
                "ocr_engine": ocr_engine,
                "ocr_confidence": round(ocr_confidence, 3),
                "diff_result": json.dumps(diff, ensure_ascii=False),
                "llm_grading": (
                    json.dumps(grading_dict, ensure_ascii=False)
                    if grading_dict else None
                ),
                "score": score,
                "correct_count": diff["correct_count"],
                "wrong_count": diff["wrong_count"],
                "missing_count": diff["missing_count"],
                "extra_count": diff["extra_count"],
                "graded_at": datetime.now(),
            },
            where="id = %s",
            params=(submission_id,),
        )

    def _decide_final_status(
        self,
        *,
        ocr_confidence: float,
        grading: Optional[GradingResult],
    ) -> SubmissionStatus:
        """根據 OCR / grader 信心判斷最終狀態。

        - OCR 信心 < settings.dictation_ocr_min_confidence → needs_review
        - grader 存在但失敗 → graded (我們已 fallback 到 difflib 分數,信任機械結果)
        - grader 成功但信心 < settings.dictation_grader_min_confidence → needs_review
        - 否則 → graded
        """
        if self._settings is None:
            return SubmissionStatus.GRADED

        llm_settings = self._settings  # Settings flat-inherits LLMSettings
        if ocr_confidence < llm_settings.dictation_ocr_min_confidence:
            return SubmissionStatus.NEEDS_REVIEW
        if (
            grading is not None
            and grading.success
            and grading.confidence < llm_settings.dictation_grader_min_confidence
        ):
            return SubmissionStatus.NEEDS_REVIEW
        return SubmissionStatus.GRADED

    def _mark_failed(self, submission_id: int, reason: str) -> None:
        self._sub_repo.update(
            data={
                "status": SubmissionStatus.OCR_FAILED.value,
                "teacher_feedback": reason,
            },
            where="id = %s",
            params=(submission_id,),
        )

    async def reprocess_submission(self, submission_id: int, teacher_id: int) -> Dict[str, Any]:
        submission = self._sub_repo.find_by_id(submission_id)
        if not submission:
            raise NotFoundError("提交不存在")
        self._get_dictation_or_raise(submission["dictation_id"], owner_id=teacher_id)

        self._sub_repo.update(
            data={"status": SubmissionStatus.OCR_PROCESSING.value},
            where="id = %s",
            params=(submission_id,),
        )
        asyncio.create_task(self._process_submission_ocr(submission_id))
        return self.get_submission_detail(submission_id, viewer_is_student=False)

    # ================================================================
    # 查詢：提交
    # ================================================================

    def list_submissions(self, dictation_id: int, teacher_id: int) -> List[Dict[str, Any]]:
        self._get_dictation_or_raise(dictation_id, owner_id=teacher_id)
        rows = self._sub_repo.find_by_dictation(dictation_id)
        # 去掉 diff_result JSON 字串以減輕列表負擔
        for r in rows:
            r.pop("diff_result", None)
            r.pop("ocr_text", None)
        return rows

    def export_submissions_csv(
        self, dictation_id: int, teacher_id: int,
    ) -> tuple[bytes, str]:
        """匯出某份默書全班提交成績為 CSV bytes。

        Returns:
            (csv_bytes_with_BOM, suggested_filename)
        """
        dictation = self._get_dictation_or_raise(dictation_id, owner_id=teacher_id)
        rows = self._sub_repo.find_by_dictation(dictation_id)
        return _build_submissions_csv(dictation, rows)

    def get_submission_detail(
        self,
        submission_id: int,
        viewer_is_student: bool = False,
        reveal_reference: bool = True,
    ) -> Dict[str, Any]:
        submission = self._sub_repo.find_by_id(submission_id)
        if not submission:
            raise NotFoundError("提交不存在")

        dictation = self._dict_repo.find_by_id(submission["dictation_id"])
        files = self._file_repo.find_by_submission(submission_id)

        # 解析 diff_result + llm_grading
        diff = None
        if submission.get("diff_result"):
            try:
                diff = json.loads(submission["diff_result"])
            except Exception:
                diff = None

        grading = None
        if submission.get("llm_grading"):
            try:
                grading = json.loads(submission["llm_grading"])
            except Exception:
                grading = None

        result = dict(submission)
        result["diff_result"] = diff
        result["llm_grading"] = grading
        result["files"] = files
        result["dictation_title"] = dictation["title"] if dictation else ""
        # 把語言/模式 surface 出來給前端
        if dictation:
            result["language"] = dictation.get("language") or "en"
            result["mode"] = dictation.get("mode") or "paragraph"
        # 學生端:只有批改完成才回傳原文
        if dictation:
            if reveal_reference and submission["status"] == SubmissionStatus.GRADED.value:
                result["reference_text"] = dictation["reference_text"]
            elif not viewer_is_student:
                result["reference_text"] = dictation["reference_text"]
            else:
                result["reference_text"] = ""
        return result

    def override_submission(
        self, submission_id: int, teacher_id: int, payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        submission = self._sub_repo.find_by_id(submission_id)
        if not submission:
            raise NotFoundError("提交不存在")
        dictation = self._get_dictation_or_raise(
            submission["dictation_id"], owner_id=teacher_id,
        )

        update: Dict[str, Any] = {}

        # 如果老師手動修正 OCR,重新比對
        if payload.get("manual_ocr_text") is not None:
            new_ocr = payload["manual_ocr_text"]
            language = dictation.get("language") or detect_language(
                dictation.get("reference_text") or ""
            )
            mode = dictation.get("mode") or Mode.PARAGRAPH
            diff = compare_dictation(
                dictation["reference_text"], new_ocr,
                language=language, mode=mode,
                lenient_variants=bool(dictation.get("lenient_variants", 1)),
            )
            update.update({
                "ocr_text": new_ocr,
                "diff_result": json.dumps(diff, ensure_ascii=False),
                "correct_count": diff["correct_count"],
                "wrong_count": diff["wrong_count"],
                "missing_count": diff["missing_count"],
                "extra_count": diff["extra_count"],
                "score": diff["accuracy"],
                "status": SubmissionStatus.GRADED.value,
                "graded_at": datetime.now(),
            })

        if payload.get("score") is not None:
            update["score"] = float(payload["score"])
        if payload.get("teacher_feedback") is not None:
            update["teacher_feedback"] = payload["teacher_feedback"]

        if not update:
            return self.get_submission_detail(submission_id)

        self._sub_repo.update(
            data=update, where="id = %s", params=(submission_id,),
        )
        return self.get_submission_detail(submission_id)

    # ================================================================
    # 私有工具
    # ================================================================

    def _get_dictation_or_raise(
        self, dictation_id: int, owner_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        row = self._dict_repo.find_by_id(dictation_id)
        if not row or row.get("is_deleted"):
            raise NotFoundError("默書不存在")
        if owner_id is not None and row.get("created_by") != owner_id:
            raise AuthorizationError("只有默書建立者可以操作")
        return row


# ─── module-level helpers (純函式,無依賴) ────────────────────
def _minimal_submission(sub: Dict[str, Any]) -> Dict[str, Any]:
    """用於學生列表頁的精簡 submission 表示。"""
    return {
        "id": sub.get("id"),
        "status": sub.get("status"),
        "score": sub.get("score"),
        "correct_count": sub.get("correct_count"),
        "wrong_count": sub.get("wrong_count"),
        "missing_count": sub.get("missing_count"),
        "extra_count": sub.get("extra_count"),
        "submitted_at": sub.get("submitted_at"),
    }


_STATUS_LABEL_ZH = {
    "submitted": "已提交",
    "ocr_processing": "辨識中",
    "graded": "已批改",
    "needs_review": "待複核",
    "ocr_failed": "辨識失敗",
}


def _build_submissions_csv(
    dictation: Dict[str, Any], submissions: List[Dict[str, Any]],
) -> tuple[bytes, str]:
    """純函數:把 submissions 列表轉成 CSV bytes。

    UTF-8 BOM 開頭,讓 Excel / Numbers 自動辨識為 UTF-8 並正確顯示中文。
    """
    import csv
    import io
    import re
    from datetime import datetime as _dt

    buf = io.StringIO()
    buf.write("\ufeff")  # BOM
    writer = csv.writer(buf)

    writer.writerow([
        "班級", "學號", "姓名",
        "狀態", "正確率(%)",
        "正確", "錯字", "漏字", "多字",
        "提交時間", "批改時間",
    ])

    def _fmt_dt(v):
        if not v:
            return ""
        if isinstance(v, _dt):
            return v.strftime("%Y-%m-%d %H:%M:%S")
        return str(v)

    for s in submissions:
        status = s.get("status") or ""
        writer.writerow([
            s.get("class_name") or "",
            s.get("username") or "",
            s.get("student_name") or "",
            _STATUS_LABEL_ZH.get(status, status),
            "" if s.get("score") is None else f"{float(s['score']):.2f}",
            s.get("correct_count") if s.get("correct_count") is not None else "",
            s.get("wrong_count") if s.get("wrong_count") is not None else "",
            s.get("missing_count") if s.get("missing_count") is not None else "",
            s.get("extra_count") if s.get("extra_count") is not None else "",
            _fmt_dt(s.get("submitted_at")),
            _fmt_dt(s.get("graded_at")),
        ])

    # 安全的檔名 (中英數字 / -_)
    raw_title = (dictation.get("title") or "dictation").strip()
    safe_title = re.sub(r"[^\w\u4e00-\u9fff\-]+", "_", raw_title)[:60]
    today = _dt.now().strftime("%Y%m%d")
    filename = f"{safe_title}_{today}.csv"
    return buf.getvalue().encode("utf-8"), filename
