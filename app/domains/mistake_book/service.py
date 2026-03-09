"""
MistakeBookService — 錯題本核心業務邏輯
========================================
職責:
1. 錯題上傳 → OCR → 確認 → AI 分析
2. 知識點關聯與掌握度追蹤
3. AI 練習題生成與批改
4. 間隔重複複習排程
5. 學習統計與薄弱知識點報告
"""

import asyncio
import json
import os
import uuid
import logging
from datetime import datetime
from typing import Callable, Dict, List, Optional, Any

from app.domains.mistake_book.repository import (
    KnowledgePointRepository,
    MasterySnapshotRepository,
    MistakeKnowledgeLinkRepository,
    MistakeRepository,
    PracticeSessionRepository,
    ReviewLogRepository,
    StudentMasteryRepository,
)
from app.domains.mistake_book.exceptions import (
    AnalysisFailedError,
    MistakeNotFoundError,
    OCRFailedError,
    PracticeNotFoundError,
)
from app.domains.mistake_book.prompts import (
    build_analysis_prompt,
    build_practice_prompt,
    build_weakness_report_prompt,
)
from app.domains.mistake_book.subject_handler import SubjectHandlerRegistry
from app.domains.adaptive.engine import AdaptiveLearningEngine
from app.domains.vision.service import VisionService
from app.domains.vision.schemas import RecognitionSubject, RecognitionTask

logger = logging.getLogger(__name__)

UPLOAD_DIR = "uploads/mistakes"


def _truncate_repetitive(text: str, max_len: int = 3000) -> str:
    """
    檢測並截斷 AI 生成的重複文字（模型陷入循環時產生）。
    策略：將文本分段，若某段重複出現 3+ 次則截斷到第一次出現處。
    """
    if len(text) <= max_len:
        return text

    # 快速檢測：取 50-200 字長度的窗口，檢查是否在後半段大量重複
    for window_size in (200, 100, 50):
        if len(text) < window_size * 4:
            continue
        # 取前半段的一個窗口
        mid = len(text) // 3
        sample = text[mid:mid + window_size]
        # 統計在後半段出現的次數
        count = text[mid + window_size:].count(sample)
        if count >= 2:
            # 找到第二次重複位置並截斷
            first_end = text.find(sample, mid) + window_size
            return text[:first_end].rstrip() + "\n\n（分析內容過長，已截斷）"

    return text[:max_len]


def _extract_analysis_from_prose(text: str) -> Dict:
    """
    當 AI 返回散文而非 JSON 時，嘗試從文本中提取有用的分析信息。
    這是最後的回退方案，確保用戶至少能看到分析內容。

    增強：如果文本像 JSON（以 { 開頭），嘗試用正則提取各字段值。
    """
    import re

    # 移除 thinking 標籤
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()

    result = {
        "is_correct": False,
        "error_analysis": "",
        "correct_answer": "",
        "error_type": "method_error",
        "improvement_tips": [],
        "knowledge_points": [],
        "difficulty_level": 3,
        "confidence": 0.5,
    }

    # ---- 增強：如果文本看起來像 JSON，逐字段正則提取 ----
    if text.lstrip().startswith("{"):
        # 提取 correct_answer 字段
        ca_match = re.search(
            r'"correct_answer"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)', text, re.DOTALL
        )
        if ca_match:
            result["correct_answer"] = (
                ca_match.group(1)
                .replace("\\n", "\n")
                .replace('\\"', '"')
                .replace("\\\\", "\\")
            )

        # 提取 error_analysis 字段
        ea_match = re.search(
            r'"error_analysis"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)', text, re.DOTALL
        )
        if ea_match:
            analysis_raw = (
                ea_match.group(1)
                .replace("\\n", "\n")
                .replace('\\"', '"')
                .replace("\\\\", "\\")
            )
            result["error_analysis"] = _truncate_repetitive(analysis_raw)

        # 提取 error_type 字段
        et_match = re.search(r'"error_type"\s*:\s*"([^"]*)"', text)
        if et_match:
            result["error_type"] = et_match.group(1)

        # 提取 is_correct 字段
        ic_match = re.search(r'"is_correct"\s*:\s*(true|false)', text, re.I)
        if ic_match:
            result["is_correct"] = ic_match.group(1).lower() == "true"

        # 提取 knowledge_points 字段
        kp_match = re.search(r'"knowledge_points"\s*:\s*\[(.*?)\]', text)
        if kp_match:
            codes = re.findall(r'"([^"]+)"', kp_match.group(1))
            result["knowledge_points"] = codes

        # 提取 improvement_tips 字段
        tips_match = re.search(r'"improvement_tips"\s*:\s*\[(.*?)\]', text, re.DOTALL)
        if tips_match:
            tips = re.findall(r'"((?:[^"\\]|\\.)*)"', tips_match.group(1))
            result["improvement_tips"] = [
                t.replace("\\n", "\n").replace('\\"', '"') for t in tips
            ]

        # 如果沒提取到 error_analysis 但有 correct_answer，用後者作補充
        if not result["error_analysis"] and result["correct_answer"]:
            result["error_analysis"] = "請參考正確答案。"

        # 如果至少提取到了 correct_answer 或 error_analysis，返回結果
        if result["correct_answer"] or result["error_analysis"]:
            return result

    # ---- 原始回退：純散文處理 ----
    analysis_text = _truncate_repetitive(text)
    result["error_analysis"] = analysis_text

    # 嘗試判斷是否正確
    if any(kw in text for kw in ["完全正確", "答案正確", "解題正確"]):
        result["is_correct"] = True

    # 嘗試提取錯誤類型
    error_map = {
        "計算錯誤": "calculation_error",
        "calculation": "calculation_error",
        "概念錯誤": "concept_error",
        "concept": "concept_error",
        "粗心": "careless",
        "careless": "careless",
        "邏輯": "logic_error",
        "logic": "logic_error",
        "方法錯誤": "method_error",
        "method": "method_error",
    }
    for keyword, etype in error_map.items():
        if keyword in text.lower():
            result["error_type"] = etype
            break

    return result


class MistakeBookService:
    """
    錯題本核心服務

    依賴注入:
    - 6 個 Repository
    - VisionService（OCR）
    - ask_ai_func（LLM 文本分析）
    - AdaptiveLearningEngine（自適應算法）
    """

    def __init__(
        self,
        mistake_repo: MistakeRepository,
        knowledge_repo: KnowledgePointRepository,
        link_repo: MistakeKnowledgeLinkRepository,
        mastery_repo: StudentMasteryRepository,
        practice_repo: PracticeSessionRepository,
        review_repo: ReviewLogRepository,
        settings=None,
    ):
        self._mistakes = mistake_repo
        self._knowledge = knowledge_repo
        self._links = link_repo
        self._mastery = mastery_repo
        self._practices = practice_repo
        self._reviews = review_repo
        self._settings = settings

        self._snapshots = MasterySnapshotRepository()
        self._vision: Optional[VisionService] = None
        self._ask_ai_raw: Optional[Callable] = None
        self._engine = AdaptiveLearningEngine()

    # ================================================================
    # 外部依賴注入
    # ================================================================

    def set_vision_service(self, vision: VisionService):
        self._vision = vision

    def set_ai_function(self, ask_ai: Callable):
        """
        注入 AI 問答函數

        適配 ask_ai_subject 接口：
        - ask_ai_subject 是同步函數，返回 (answer, thinking) 元組
        - 本 Service 需要異步調用並只取 answer 字符串
        """
        self._ask_ai_raw = ask_ai

    async def _ask_ai(self, prompt: str, subject: str, task_type: str = "summary") -> str:
        """
        調用 AI 並適配返回值為純字符串

        優先使用直接 Ollama HTTP 調用（可控制超時），
        回退到 ask_ai_subject（經過 langchain）。
        """
        if not self._ask_ai_raw:
            return ""

        # 優先：直接異步調用 Ollama（繞過 langchain 的短超時）
        try:
            result = await self._call_ollama_direct(prompt)
            if result:
                return result
        except Exception as e:
            logger.warning("直接 Ollama 調用失敗，回退到 langchain: %s", e)

        # 回退：使用 langchain 的 ask_ai_subject
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: self._ask_ai_raw(prompt, subject, task_type=task_type),
        )

        if isinstance(result, tuple):
            return result[0] or ""
        return result or ""

    async def _call_ollama_direct(self, prompt: str) -> str:
        """
        直接異步調用 Ollama API（繞過 langchain 60s 超時限制）

        使用 /api/chat 端點，超時 300 秒，適合長時間分析任務。
        """
        import httpx

        # 從全局 LLM 配置獲取模型和 URL
        try:
            from llm.config import get_llm_config
            config = get_llm_config()
            model = config.local_model
            base_url = config.local_base_url
        except Exception:
            model = "qwen3.5:35b"
            base_url = "http://localhost:11434"

        payload = {
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are an expert teacher. You MUST respond with valid JSON only. No explanations, no reasoning, no markdown — just a single JSON object.",
                },
                {"role": "user", "content": prompt},
            ],
            "stream": False,
            "think": False,
            "format": "json",
            "options": {
                "temperature": 0.3,
                "num_predict": 4096,
            },
        }

        url = f"{base_url}/api/chat"
        timeout = httpx.Timeout(300.0, connect=10.0)

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()

        msg = data.get("message", {})
        content = msg.get("content", "")
        thinking = msg.get("thinking", "")

        import re

        # 移除 thinking 標籤（如果在 content 裡）
        content = re.sub(r"<think>[\s\S]*?</think>", "", content, flags=re.DOTALL).strip()

        # 如果 content 為空但 thinking 字段有內容，使用 thinking
        if not content and thinking:
            logger.info("Ollama content 為空，使用 thinking 字段 (len=%d)", len(thinking))
            content = re.sub(r"<think>[\s\S]*?</think>", "", thinking, flags=re.DOTALL).strip()
            if not content:
                content = thinking.strip()

        # 最終清理殘留的 think 標籤
        content = re.sub(r"</?think>", "", content).strip()

        logger.info("直接 Ollama 調用成功: model=%s, content_len=%d, thinking_len=%d", model, len(content), len(thinking))
        return content

    # ================================================================
    # 圖形描述統一寫入（收口方法）
    # ================================================================

    def _apply_figure_description(
        self, mistake_id: str, fig_json: str,
        schema_version: int = 1,
    ) -> str:
        """
        統一管理 figure_description 的寫入，保證一致性：
        - 寫入 figure_description（原始 JSON）
        - 同步生成 figure_description_readable
        - 同步設置 figure_schema_version
        - 保證「原始 JSON 變 → readable 必同步變」

        所有需要更新 figure_description 的地方都必須調用此方法。

        Returns:
            生成的 figure_description_readable
        """
        readable = ""
        if fig_json:
            try:
                readable = VisionService.generate_readable_description(
                    fig_json, schema_version
                )
            except Exception as e:
                logger.warning("生成 readable 描述失敗 (mistake=%s): %s", mistake_id, e)
                readable = "含幾何圖形"

            # 輕量 schema 校驗（v2+），結果寫日誌不阻塞
            if schema_version >= 2:
                try:
                    fig_obj = json.loads(fig_json) if isinstance(fig_json, str) else fig_json
                    if isinstance(fig_obj, dict):
                        warnings = VisionService.validate_figure_schema(fig_obj, schema_version)
                        if warnings:
                            logger.info(
                                "figure schema 校驗警告 (mistake=%s): %s",
                                mistake_id, "; ".join(warnings[:3]),
                            )
                except (json.JSONDecodeError, TypeError):
                    pass

        self._mistakes.update(
            {
                "figure_description": fig_json if fig_json else None,
                "figure_description_readable": readable if readable else None,
                "figure_schema_version": schema_version,
            },
            "mistake_id = %s",
            (mistake_id,),
        )
        return readable

    # ================================================================
    # 錯題上傳與識別
    # ================================================================

    async def upload_mistake_photo(
        self,
        student_username: str,
        subject: str,
        category: str,
        image_data: bytes,
        filename: str,
    ) -> Dict:
        """
        上傳錯題照片並執行 OCR

        流程: 保存圖片 → OCR 識別 → 創建 pending_review 記錄

        Returns:
            {mistake_id, ocr_question, ocr_answer, confidence, status}
        """
        mistake_id = str(uuid.uuid4())[:12]

        # 保存圖片
        save_dir = os.path.join(UPLOAD_DIR, student_username, subject)
        os.makedirs(save_dir, exist_ok=True)

        ext = os.path.splitext(filename)[1] or ".jpg"
        saved_filename = f"{mistake_id}{ext}"
        saved_path = os.path.join(save_dir, saved_filename)

        with open(saved_path, "wb") as f:
            f.write(image_data)

        # HEIC/HEIF → JPEG 轉換（瀏覽器無法顯示 HEIC）
        web_image_path = saved_path
        if ext.lower() in (".heic", ".heif"):
            web_image_path = self._convert_to_jpeg_for_web(saved_path, save_dir, mistake_id)

        # OCR 識別
        ocr_result = None
        if self._vision:
            recognition_subject = RecognitionSubject(subject)
            handler = SubjectHandlerRegistry.get(subject)
            task = handler.pick_recognition_task(category)
            ocr_result = await self._vision.recognize(
                saved_path, recognition_subject, task
            )

        if ocr_result and ocr_result.success:
            status = "pending_review"
            ocr_question = ocr_result.question_text
            ocr_answer = ocr_result.answer_text
            confidence = ocr_result.confidence
            figure_desc = ocr_result.figure_description
        else:
            status = "pending_ocr"
            ocr_question = ""
            ocr_answer = ""
            confidence = 0.0
            figure_desc = ""
            if ocr_result:
                logger.warning("OCR 識別失敗: %s", ocr_result.error)

        if figure_desc:
            logger.info("圖形描述已提取: %s", figure_desc[:100])

        # 構建分項置信度（支持分項置信度的科目才拆分，其他科目為 null）
        confidence_breakdown = None
        if ocr_result and ocr_result.success and handler.supports_confidence_breakdown:
            q_conf = ocr_result.question_confidence
            a_conf = ocr_result.answer_confidence
            f_conf = ocr_result.figure_confidence
            # 只有在模型返回了有效值時才存儲
            if q_conf > 0 or a_conf > 0 or f_conf > 0:
                confidence_breakdown = {
                    "question": round(q_conf, 2),
                    "answer": round(a_conf, 2),
                    "figure": round(f_conf, 2),
                }

        # 創建錯題記錄（存儲瀏覽器可顯示的 JPEG 路徑）
        insert_data = {
            "mistake_id": mistake_id,
            "student_username": student_username,
            "subject": subject,
            "category": category,
            "original_image_path": web_image_path,
            "ocr_question_text": ocr_question,
            "ocr_answer_text": ocr_answer,
            "confidence_score": confidence,
            "status": status,
            "source": "photo",
        }
        if confidence_breakdown is not None:
            insert_data["confidence_breakdown"] = json.dumps(confidence_breakdown)
        self._mistakes.insert(insert_data)

        # 通過收口方法寫入 figure_description 獨立列（新上傳使用 v2 schema）
        figure_readable = ""
        if figure_desc:
            figure_readable = self._apply_figure_description(
                mistake_id, figure_desc, schema_version=2
            )

        return {
            "mistake_id": mistake_id,
            "ocr_question": ocr_question,
            "ocr_answer": ocr_answer,
            "confidence": confidence,
            "confidence_breakdown": confidence_breakdown,
            "has_handwriting": ocr_result.has_handwriting if ocr_result else False,
            "figure_description": figure_desc,
            "figure_description_readable": figure_readable,
            "status": status,
            "message": "識別完成，請確認或修正結果" if status == "pending_review" else "識別失敗，請手動輸入",
        }

    async def confirm_and_analyze(
        self,
        mistake_id: str,
        confirmed_question: str,
        confirmed_answer: str,
        confirmed_figure_description: Optional[str] = None,
    ) -> Dict:
        """
        確認 OCR 結果並觸發 AI 分析

        流程: 更新文字 → AI 批改 → 關聯知識點 → 更新掌握度
        """
        mistake = self._mistakes.find_by_mistake_id(mistake_id)
        if not mistake:
            raise MistakeNotFoundError(mistake_id)

        # 更新確認後的文字（純題目，不含圖形描述前綴）
        self._mistakes.update(
            {
                "manual_question_text": confirmed_question,
                "manual_answer_text": confirmed_answer,
                "status": "analyzed",
            },
            "mistake_id = %s",
            (mistake_id,),
        )

        # 如果前端傳入了編輯後的 figure_description，通過收口方法更新
        if confirmed_figure_description is not None:
            self._apply_figure_description(
                mistake_id, confirmed_figure_description, schema_version=1
            )

        # 從 figure_description 獨立列讀取幾何描述
        # 重新讀取以獲取最新值（可能剛被 _apply_figure_description 更新）
        figure_description = ""
        if confirmed_figure_description:
            figure_description = confirmed_figure_description
        else:
            # 從獨立列讀取
            fig_col = mistake.get("figure_description", "")
            if fig_col:
                figure_description = fig_col
            else:
                # TODO: 遷移完成後移除舊數據回退邏輯
                # 回退：從 tags JSON 中讀取（兼容未遷移的舊記錄）
                tags_raw = mistake.get("tags")
                if tags_raw:
                    try:
                        tags_obj = json.loads(tags_raw) if isinstance(tags_raw, str) else tags_raw
                        figure_description = tags_obj.get("figure_description", "")
                    except (json.JSONDecodeError, AttributeError):
                        pass

        # AI 分析（包含圖形描述 + 歷史薄弱點累積分析）
        analysis = await self._run_analysis(
            mistake["subject"], confirmed_question, confirmed_answer,
            figure_description=figure_description,
            student_username=mistake["student_username"],
        )

        # 更新分析結果
        update_data = {
            "correct_answer": analysis.get("correct_answer", ""),
            "ai_analysis": analysis.get("error_analysis", ""),
            "error_type": analysis.get("error_type", ""),
            "difficulty_level": analysis.get("difficulty_level", 3),
            "confidence_score": analysis.get("confidence", 0.8),
        }
        self._mistakes.update(update_data, "mistake_id = %s", (mistake_id,))

        # 關聯知識點
        point_codes = analysis.get("knowledge_points", [])
        if point_codes:
            self._links.link_mistake_to_points(mistake_id, point_codes)
            self._update_mastery_on_mistake(
                mistake["student_username"], mistake["subject"], point_codes
            )

            # 記錄掌握度快照（用於知識圖譜趨勢）
            self._save_mastery_snapshots(
                mistake["student_username"], mistake["subject"],
                point_codes, "mistake", mistake_id
            )

        # 設置初始複習時間
        next_review, _, _ = self._engine.calculate_next_review(
            review_count=0, last_result="forgot"
        )
        self._mistakes.update(
            {"next_review_at": next_review},
            "mistake_id = %s",
            (mistake_id,),
        )

        return {
            "mistake_id": mistake_id,
            "is_correct": analysis.get("is_correct", False),
            "correct_answer": analysis.get("correct_answer", ""),
            "error_type": analysis.get("error_type", ""),
            "error_analysis": analysis.get("error_analysis", ""),
            "improvement_tips": analysis.get("improvement_tips", []),
            "knowledge_points": self._links.get_points_for_mistake(mistake_id),
            "next_review_at": next_review.isoformat(),
        }

    def add_manual_mistake(
        self,
        student_username: str,
        subject: str,
        category: str,
        question_text: str,
        answer_text: str,
        correct_answer: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> Dict:
        """手動添加錯題（不需要拍照）"""
        mistake_id = str(uuid.uuid4())[:12]

        self._mistakes.insert({
            "mistake_id": mistake_id,
            "student_username": student_username,
            "subject": subject,
            "category": category,
            "manual_question_text": question_text,
            "manual_answer_text": answer_text,
            "correct_answer": correct_answer or "",
            "status": "pending_review",
            "source": "manual",
            "tags": json.dumps(tags) if tags else None,
        })

        return {"mistake_id": mistake_id, "status": "pending_review"}

    # ================================================================
    # 錯題查詢
    # ================================================================

    def get_my_mistakes(
        self,
        username: str,
        subject: Optional[str] = None,
        category: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict:
        return self._mistakes.find_by_student(
            username, subject, category, status, page, page_size
        )

    def get_mistake_detail(self, mistake_id: str) -> Dict:
        mistake = self._mistakes.find_by_mistake_id(mistake_id)
        if not mistake:
            raise MistakeNotFoundError(mistake_id)

        knowledge_points = self._links.get_points_for_mistake(mistake_id)
        reviews = self._reviews.get_reviews_for_mistake(mistake_id)

        result = dict(mistake)
        result["knowledge_points"] = knowledge_points
        result["review_history"] = reviews[:10]
        result["question_text"] = (
            mistake.get("manual_question_text")
            or mistake.get("ocr_question_text")
            or ""
        )
        result["answer_text"] = (
            mistake.get("manual_answer_text")
            or mistake.get("ocr_answer_text")
            or ""
        )

        # 圖形描述作為獨立字段返回（question_text 保持純淨）
        fig_desc = mistake.get("figure_description", "")
        fig_readable = mistake.get("figure_description_readable", "")

        # TODO: 遷移完成後移除舊數據回退邏輯
        # 回退：若獨立列為空，從 tags JSON 中讀取（兼容未遷移的舊記錄）
        if not fig_desc:
            tags_raw = mistake.get("tags")
            if tags_raw:
                try:
                    tags_obj = json.loads(tags_raw) if isinstance(tags_raw, str) else tags_raw
                    if isinstance(tags_obj, dict):
                        fig_desc = tags_obj.get("figure_description", "")
                        if fig_desc and not fig_readable:
                            fig_readable = VisionService.generate_readable_description(
                                fig_desc, mistake.get("figure_schema_version", 1)
                            )
                except (json.JSONDecodeError, AttributeError):
                    pass

        result["figure_description"] = fig_desc or None
        result["figure_description_readable"] = fig_readable or None

        return result

    def regenerate_readable_descriptions(self, batch_size: int = 100) -> Dict:
        """
        批量重新生成 figure_description_readable。

        用於 schema 升級後批量刷新，或修復 readable 缺失的記錄。
        """
        from app.infrastructure.database.pool import get_connection

        stats = {"processed": 0, "updated": 0, "errors": 0}

        conn = get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                SELECT mistake_id, figure_description, figure_schema_version
                FROM student_mistakes
                WHERE is_deleted = 0
                  AND figure_description IS NOT NULL
                  AND figure_description != ''
                  AND (figure_description_readable IS NULL
                       OR figure_description_readable = '')
                LIMIT %s
            """, (batch_size,))
            rows = cursor.fetchall()

            for row in rows:
                stats["processed"] += 1
                mid = row[0] if isinstance(row, (list, tuple)) else row["mistake_id"]
                fig = row[1] if isinstance(row, (list, tuple)) else row["figure_description"]
                ver = row[2] if isinstance(row, (list, tuple)) else row.get("figure_schema_version", 1)
                try:
                    readable = VisionService.generate_readable_description(fig, ver)
                    if readable:
                        self._mistakes.update(
                            {"figure_description_readable": readable},
                            "mistake_id = %s",
                            (mid,),
                        )
                        stats["updated"] += 1
                except Exception as e:
                    logger.warning("regenerate readable 失敗 (mistake=%s): %s", mid, e)
                    stats["errors"] += 1
        finally:
            cursor.close()
            conn.close()

        logger.info(
            "regenerate_readable_descriptions 完成: processed=%d, updated=%d, errors=%d",
            stats["processed"], stats["updated"], stats["errors"],
        )
        return stats

    def delete_mistake(self, mistake_id: str, username: str) -> bool:
        mistake = self._mistakes.find_by_mistake_id(mistake_id)
        if not mistake or mistake["student_username"] != username:
            raise MistakeNotFoundError(mistake_id)
        self._mistakes.soft_delete("mistake_id = %s", (mistake_id,))
        return True

    # ================================================================
    # 知識點分析
    # ================================================================

    async def get_weakness_report(self, username: str, subject: str) -> Dict:
        """生成薄弱知識點分析報告"""
        weak_points = self._links.get_weak_points_for_student(username, subject)
        error_stats = self._mistakes.get_error_type_stats(username, subject)
        total = self._mistakes.count_by_student_subject(username, subject)

        # 如果 INNER JOIN knowledge_points 找不到記錄，
        # 回退到 mastery 表的數據（LEFT JOIN 帶名稱）
        if not weak_points:
            mastery_data = self._mastery.get_all_mastery(username, subject)
            weak_points = [
                {
                    "point_code": m["point_code"],
                    "point_name": m.get("point_name") or self._humanize_code(m["point_code"]),
                    "category": m.get("category") or "",
                    "mastery_level": m.get("mastery_level", 0),
                    "mistake_count": m.get("total_mistakes", 0),
                    "trend": m.get("trend", "stable"),
                }
                for m in mastery_data
                if (m.get("mastery_level") or 0) < 60
            ][:10]

        ai_summary = {}
        if self._ask_ai_raw and weak_points:
            prompt = build_weakness_report_prompt(subject, weak_points, error_stats)
            try:
                raw = await self._ask_ai(prompt, subject)
                ai_summary = self._parse_json_response(raw)
            except Exception as e:
                logger.error("薄弱知識點 AI 分析失敗: %s", e)
                ai_summary = {
                    "summary": "暫時無法生成 AI 分析",
                    "recommendations": [],
                }

        return {
            "subject": subject,
            "total_mistakes": total,
            "weak_points": weak_points,
            "error_type_distribution": error_stats,
            "ai_summary": ai_summary.get("summary", ""),
            "recommendations": ai_summary.get("recommendations", []),
            "encouragement": ai_summary.get("encouragement", ""),
        }

    def get_knowledge_mastery_map(self, username: str, subject: str) -> Dict:
        """獲取知識點掌握度地圖（樹形結構）"""
        all_points = self._knowledge.find_by_subject(subject)
        mastery_data = self._mastery.get_all_mastery(username, subject)
        mastery_map = {m["point_code"]: m for m in mastery_data}

        # 構建樹
        root_nodes = []
        children_map: Dict[str, List] = {}

        for pt in all_points:
            parent = pt.get("parent_code")
            if parent:
                children_map.setdefault(parent, []).append(pt)

        for pt in all_points:
            if not pt.get("parent_code"):
                node = self._build_tree_node(pt, children_map, mastery_map)
                root_nodes.append(node)

        return {"subject": subject, "knowledge_tree": root_nodes}

    # ================================================================
    # AI 練習題生成
    # ================================================================

    async def generate_practice(
        self,
        username: str,
        subject: str,
        session_type: str = "targeted",
        question_count: int = 5,
        target_points: Optional[List[str]] = None,
        difficulty: Optional[int] = None,
    ) -> Dict:
        """根據薄弱知識點生成練習題"""
        if not self._ask_ai_raw:
            raise AnalysisFailedError("AI 服務未配置")

        # 選擇目標知識點
        if target_points:
            points_data = self._knowledge.find_by_codes(target_points)
        else:
            mastery_data = self._mastery.get_all_mastery(username, subject)
            mistake_points = self._links.get_weak_points_for_student(
                username, subject, limit=10
            )
            targets = self._engine.select_practice_targets(
                mastery_data, mistake_points, count=min(question_count, 5)
            )
            codes = [t["point_code"] for t in targets]
            points_data = self._knowledge.find_by_codes(codes) if codes else []

        if not points_data:
            points_data = self._knowledge.find_by_subject(subject)[:3]

        # 獲取學生歷史錯題作為出題參考
        context = self._get_student_mistakes_context(username, subject, limit=3)

        # AI 出題
        prompt = build_practice_prompt(
            subject, points_data, question_count, difficulty, context
        )
        raw = await self._ask_ai(prompt, subject)
        questions_data = self._parse_json_response(raw)
        questions = questions_data.get("questions", [])

        # 保存練習記錄
        session_id = str(uuid.uuid4())[:12]
        self._practices.insert({
            "session_id": session_id,
            "student_username": username,
            "subject": subject,
            "session_type": session_type,
            "target_points": json.dumps([p["point_code"] for p in points_data]),
            "questions": json.dumps(questions, ensure_ascii=False),
            "total_questions": len(questions),
            "status": "generated",
        })

        return {
            "session_id": session_id,
            "subject": subject,
            "session_type": session_type,
            "questions": [
                {
                    "index": q.get("index", i + 1),
                    "question": q.get("question", ""),
                    "question_type": q.get("question_type", "short_answer"),
                    "options": q.get("options"),
                    "point_code": q.get("point_code", ""),
                    "difficulty": q.get("difficulty", 3),
                }
                for i, q in enumerate(questions)
            ],
            "total_questions": len(questions),
        }

    async def submit_practice(
        self,
        session_id: str,
        username: str,
        answers: List[Dict],
    ) -> Dict:
        """提交練習答案並批改"""
        session = self._practices.find_by_session_id(session_id)
        if not session:
            raise PracticeNotFoundError(session_id)

        questions = json.loads(session["questions"]) if isinstance(session["questions"], str) else session["questions"]

        # 批改
        correct_count = 0
        results = []
        mastery_updates = []

        for ans in answers:
            idx = ans.get("question_idx", 0)
            student_answer = ans.get("answer", "")

            if idx < len(questions):
                q = questions[idx]
                correct_answer = q.get("correct_answer", "")
                is_correct = self._simple_check(student_answer, correct_answer)

                if is_correct:
                    correct_count += 1

                results.append({
                    "question_idx": idx,
                    "student_answer": student_answer,
                    "is_correct": is_correct,
                    "correct_answer": correct_answer,
                    "explanation": q.get("explanation", ""),
                })

                # 更新掌握度
                point_code = q.get("point_code", "")
                if point_code:
                    update = self._update_mastery_on_practice(
                        username, session["subject"], point_code, is_correct,
                        q.get("difficulty", 3),
                    )
                    if update:
                        mastery_updates.append(update)

        score = (correct_count / len(questions) * 100) if questions else 0

        # 記錄掌握度快照（用於知識圖譜趨勢）
        snapshot_codes = [u["point_code"] for u in mastery_updates]
        if snapshot_codes:
            self._save_mastery_snapshots(
                username, session["subject"],
                snapshot_codes, "practice", session_id
            )

        # 更新練習記錄
        self._practices.update(
            {
                "student_answers": json.dumps(results, ensure_ascii=False),
                "correct_count": correct_count,
                "score": score,
                "status": "completed",
                "completed_at": datetime.now(),
            },
            "session_id = %s",
            (session_id,),
        )

        # AI 反饋
        ai_feedback = ""
        if self._ask_ai_raw:
            try:
                feedback_prompt = self._build_practice_feedback_prompt(
                    session["subject"], questions, results, score
                )
                ai_feedback = await self._ask_ai(feedback_prompt, session["subject"])
            except Exception as e:
                logger.warning("練習反饋 AI 生成失敗: %s", e)

        return {
            "session_id": session_id,
            "score": round(score, 1),
            "correct_count": correct_count,
            "total_questions": len(questions),
            "results": results,
            "ai_feedback": ai_feedback,
            "mastery_updates": mastery_updates,
        }

    # ================================================================
    # 間隔重複複習
    # ================================================================

    def get_review_queue(
        self, username: str, subject: Optional[str] = None, limit: int = 10
    ) -> List[Dict]:
        mistakes = self._mistakes.find_for_review(username, subject, limit)
        return [
            {
                "mistake_id": m["mistake_id"],
                "subject": m["subject"],
                "category": m["category"],
                "question_text": m.get("manual_question_text") or m.get("ocr_question_text", ""),
                "review_count": m.get("review_count", 0),
                "mastery_level": m.get("mastery_level", 0),
                "last_review_at": str(m["last_review_at"]) if m.get("last_review_at") else None,
            }
            for m in mistakes
        ]

    def record_review(
        self,
        mistake_id: str,
        username: str,
        result: str,
        time_spent: Optional[int] = None,
    ) -> Dict:
        mistake = self._mistakes.find_by_mistake_id(mistake_id)
        if not mistake or mistake["student_username"] != username:
            raise MistakeNotFoundError(mistake_id)

        # 記錄複習日誌
        self._reviews.insert({
            "mistake_id": mistake_id,
            "student_username": username,
            "review_type": "flashcard",
            "result": result,
            "time_spent_seconds": time_spent,
        })

        # 計算下次複習時間
        review_count = mistake.get("review_count", 0) + 1
        next_review, _, _ = self._engine.calculate_next_review(
            review_count=review_count,
            last_result=result,
        )

        # 更新錯題狀態
        new_status = mistake["status"]
        new_mastery = mistake.get("mastery_level", 0)

        if result == "remembered":
            new_mastery = min(100, new_mastery + 10)
            if new_mastery >= 90 and review_count >= 3:
                new_status = "mastered"
            else:
                new_status = "practicing"
        elif result == "forgot":
            new_mastery = max(0, new_mastery - 15)
            new_status = "practicing"

        self._mistakes.update(
            {
                "review_count": review_count,
                "last_review_at": datetime.now(),
                "next_review_at": next_review,
                "mastery_level": new_mastery,
                "status": new_status,
            },
            "mistake_id = %s",
            (mistake_id,),
        )

        # 記錄掌握度快照（用於知識圖譜趨勢）
        linked_points = self._links.get_points_for_mistake(mistake_id)
        review_codes = [lp["point_code"] for lp in linked_points if lp.get("point_code")]
        if review_codes:
            self._save_mastery_snapshots(
                username, mistake["subject"],
                review_codes, "review", mistake_id
            )

        return {
            "mistake_id": mistake_id,
            "new_mastery": new_mastery,
            "status": new_status,
            "next_review_at": next_review.isoformat(),
            "review_count": review_count,
        }

    # ================================================================
    # 統計與儀表板
    # ================================================================

    def get_dashboard(self, username: str) -> Dict:
        status_stats = self._mistakes.count_by_status(username)
        mastery_summary = self._mastery.get_subject_summary(username)
        review_trend = self._reviews.get_recent_reviews(username, days=7)
        streak = self._reviews.get_streak(username)

        # 按科目統計
        per_subject = {}
        for row in status_stats:
            subj = row["subject"]
            if subj not in per_subject:
                per_subject[subj] = {"total": 0, "analyzed": 0, "mastered": 0, "practicing": 0}
            per_subject[subj]["total"] += row["cnt"]
            per_subject[subj][row["status"]] = row["cnt"]

        total = sum(s["total"] for s in per_subject.values())

        # 掌握度概覽
        mastery_overview = {}
        for ms in mastery_summary:
            mastery_overview[ms["subject"]] = {
                "avg_mastery": round(float(ms["avg_mastery"] or 0), 1),
                "weak_count": ms["weak_count"],
                "strong_count": ms["strong_count"],
                "declining_count": ms["declining_count"],
            }

        return {
            "total_mistakes": total,
            "per_subject": per_subject,
            "mastery_overview": mastery_overview,
            "review_streak": streak,
            "weekly_review_trend": review_trend,
        }

    # ================================================================
    # 教師視角
    # ================================================================

    def get_student_overview(self, student_username: str) -> Dict:
        """教師查看學生全科概況"""
        status_stats = self._mistakes.count_by_status(student_username)
        mastery_summary = self._mastery.get_subject_summary(student_username)

        per_subject = {}
        for row in status_stats:
            subj = row["subject"]
            if subj not in per_subject:
                per_subject[subj] = {"total": 0}
            per_subject[subj]["total"] += row["cnt"]
            per_subject[subj][row["status"]] = row["cnt"]

        return {
            "student_username": student_username,
            "per_subject": per_subject,
            "mastery_summary": mastery_summary,
        }

    def get_class_weakness_report(
        self, class_name: str, subject: str, student_list: List[str]
    ) -> Dict:
        """班級薄弱知識點報告"""
        all_weak = {}
        for username in student_list:
            weak = self._links.get_weak_points_for_student(username, subject, limit=5)
            for wp in weak:
                code = wp["point_code"]
                if code not in all_weak:
                    all_weak[code] = {
                        "point_code": code,
                        "point_name": wp["point_name"],
                        "category": wp["category"],
                        "student_count": 0,
                        "total_mistakes": 0,
                    }
                all_weak[code]["student_count"] += 1
                all_weak[code]["total_mistakes"] += wp.get("mistake_count", 0)

        sorted_weak = sorted(
            all_weak.values(),
            key=lambda x: (-x["student_count"], -x["total_mistakes"]),
        )

        return {
            "class_name": class_name,
            "subject": subject,
            "student_count": len(student_list),
            "common_weak_points": sorted_weak[:15],
        }

    # ================================================================
    # 知識點種子數據
    # ================================================================

    def seed_knowledge_points(self, data_path: str) -> int:
        """從 JSON 文件導入知識點種子數據"""
        with open(data_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        points = data.get("points", [])
        for p in points:
            if "grade_levels" in p and isinstance(p["grade_levels"], list):
                p["grade_levels"] = json.dumps(p["grade_levels"])

        return self._knowledge.bulk_insert(points)

    # ================================================================
    # 私有方法
    # ================================================================

    async def _run_analysis(
        self, subject: str, question: str, answer: str,
        figure_description: str = "",
        student_username: str = "",
    ) -> Dict:
        """調用 LLM 分析錯題"""
        if not self._ask_ai_raw:
            return {"error_analysis": "AI 服務未配置", "confidence": 0}

        kp_context = self._get_knowledge_points_context(subject)

        # 構建累積學習上下文（歷史薄弱點）
        history_context = ""
        if student_username:
            history_context = self._build_student_history_context(student_username, subject)

        prompt = build_analysis_prompt(
            subject, question, answer, kp_context,
            figure_description=figure_description,
            student_history_context=history_context,
        )

        try:
            raw = await self._ask_ai(prompt, subject)
            return self._parse_json_response(raw)
        except Exception as e:
            logger.error("AI 分析失敗: %s", e)
            raise AnalysisFailedError(str(e))

    def _get_knowledge_points_context(self, subject: str) -> str:
        """將知識點列表格式化為 prompt 上下文"""
        points = self._knowledge.find_by_subject(subject)
        if not points:
            return "（無知識點數據）"
        lines = [f"- {p['point_code']}: {p['point_name']}（{p['category']}）" for p in points]
        return "\n".join(lines)

    def _get_student_mistakes_context(
        self, username: str, subject: str, limit: int = 3
    ) -> str:
        """獲取學生近期錯題作為出題參考"""
        result = self._mistakes.find_by_student(
            username, subject=subject, status="analyzed", page=1, page_size=limit
        )
        items = result.get("items", [])
        if not items:
            return ""

        lines = []
        for m in items:
            q = m.get("manual_question_text") or m.get("ocr_question_text", "")
            err = m.get("error_type", "")
            lines.append(f"- 題目：{q[:100]}... 錯誤類型：{err}")
        return "\n".join(lines)

    def _build_student_history_context(self, username: str, subject: str) -> str:
        """
        構建學生歷史薄弱點上下文，供 AI 累積分析使用。

        包含：各知識點掌握度 + 趨勢 + 近期錯誤類型分佈
        """
        try:
            mastery_all = self._mastery.get_all_mastery(username, subject)
            if not mastery_all:
                return ""

            weak = [m for m in mastery_all if (m.get("mastery_level") or 0) < 60]
            weak.sort(key=lambda x: x.get("mastery_level", 0))

            if not weak:
                return ""

            lines = ["此學生的歷史薄弱知識點（掌握度 < 60%）："]
            for w in weak[:8]:
                trend_icon = {"improving": "↑改善中", "declining": "↓持續下降", "stable": "→穩定"}.get(
                    w.get("trend", "stable"), "→"
                )
                lines.append(
                    f"- {w['point_code']}: 掌握度 {w.get('mastery_level', 0)}%, "
                    f"錯題 {w.get('total_mistakes', 0)} 次, 趨勢 {trend_icon}"
                )

            # 加入近期錯誤類型分佈
            error_stats = self._mistakes.get_error_type_stats(username, subject)
            if error_stats:
                lines.append("\n近期錯誤類型分佈：")
                for es in error_stats[:5]:
                    lines.append(f"- {es.get('error_type', '未知')}: {es.get('cnt', 0)} 次")

            lines.append("\n請結合以上歷史數據，給出更有針對性的建議。如果此次錯題的知識點與歷史薄弱點重疊，請特別指出並強調需要加強練習。")
            return "\n".join(lines)
        except Exception as e:
            logger.warning("構建歷史上下文失敗: %s", e)
            return ""

    def _update_mastery_on_mistake(
        self, username: str, subject: str, point_codes: List[str]
    ):
        """錯題新增時降低相關知識點掌握度"""
        for code in point_codes:
            existing = self._mastery.get_mastery(username, code)
            if existing:
                new_level, trend = self._engine.calculate_mastery_update(
                    existing["mastery_level"], is_correct=False, difficulty=3
                )
                self._mastery.upsert_mastery({
                    "student_username": username,
                    "point_code": code,
                    "subject": subject,
                    "mastery_level": new_level,
                    "total_mistakes": existing["total_mistakes"] + 1,
                    "last_mistake_at": datetime.now(),
                    "trend": trend,
                })
            else:
                self._mastery.upsert_mastery({
                    "student_username": username,
                    "point_code": code,
                    "subject": subject,
                    "mastery_level": 35,
                    "total_mistakes": 1,
                    "resolved_mistakes": 0,
                    "total_practices": 0,
                    "correct_practices": 0,
                    "last_mistake_at": datetime.now(),
                    "trend": "declining",
                })

    def _update_mastery_on_practice(
        self,
        username: str,
        subject: str,
        point_code: str,
        is_correct: bool,
        difficulty: int,
    ) -> Optional[Dict]:
        """練習答題時更新掌握度"""
        existing = self._mastery.get_mastery(username, point_code)
        current = existing["mastery_level"] if existing else 40

        new_level, trend = self._engine.calculate_mastery_update(
            current, is_correct, difficulty
        )

        practices = (existing["total_practices"] + 1) if existing else 1
        correct = (existing["correct_practices"] + (1 if is_correct else 0)) if existing else (1 if is_correct else 0)

        self._mastery.upsert_mastery({
            "student_username": username,
            "point_code": point_code,
            "subject": subject,
            "mastery_level": new_level,
            "total_practices": practices,
            "correct_practices": correct,
            "last_practice_at": datetime.now(),
            "trend": trend,
            "total_mistakes": existing["total_mistakes"] if existing else 0,
            "resolved_mistakes": existing["resolved_mistakes"] if existing else 0,
        })

        return {
            "point_code": point_code,
            "old_mastery": current,
            "new_mastery": new_level,
            "trend": trend,
        }

    def _build_tree_node(
        self,
        point: Dict,
        children_map: Dict[str, List],
        mastery_map: Dict[str, Dict],
    ) -> Dict:
        """遞歸構建知識點樹節點"""
        code = point["point_code"]
        mastery = mastery_map.get(code, {})
        children = children_map.get(code, [])

        node = {
            "point_code": code,
            "point_name": point["point_name"],
            "category": point["category"],
            "mastery_level": mastery.get("mastery_level", -1),
            "mistake_count": mastery.get("total_mistakes", 0),
            "trend": mastery.get("trend", "unknown"),
            "children": [
                self._build_tree_node(c, children_map, mastery_map)
                for c in children
            ],
        }
        return node

    # ================================================================
    # 知識圖譜 — 掌握度快照 + 圖譜數據
    # ================================================================

    def _save_mastery_snapshots(
        self,
        username: str,
        subject: str,
        point_codes: List[str],
        trigger_type: str,
        trigger_id: str,
    ):
        """批量記錄掌握度快照（用於知識圖譜趨勢分析）"""
        try:
            snapshots = []
            for code in point_codes:
                mastery = self._mastery.get_mastery(username, code)
                level = mastery["mastery_level"] if mastery else 35
                snapshots.append({
                    "student_username": username,
                    "point_code": code,
                    "subject": subject,
                    "mastery_level": level,
                    "trigger_type": trigger_type,
                    "trigger_id": trigger_id,
                })
            if snapshots:
                self._snapshots.save_batch(snapshots)
                logger.info(
                    "已記錄 %d 條掌握度快照: user=%s, trigger=%s/%s",
                    len(snapshots), username, trigger_type, trigger_id,
                )
        except Exception as e:
            logger.warning("記錄掌握度快照失敗（不影響主流程）: %s", e)

    def get_knowledge_graph_data(self, username: str, subject: str) -> Dict:
        """
        獲取知識圖譜全量數據（供前端渲染）

        Returns:
            {
              "radar": { "categories": [...], "mastery": [...], "prev_mastery": [...] },
              "tree": [...],
              "trend": { "dates": [...], "series": { category: [...] } },
              "weak_summary": { "top_weak": [...], "improving": [...], "declining": [...] }
            }
        """
        # 1. 雷達圖：各分類掌握度
        current_cats = self._snapshots.get_latest_by_category(username, subject)
        prev_cats = self._snapshots.get_prev_category_mastery(username, subject, days_ago=7)

        cat_names = sorted(set(
            [c["category"] for c in current_cats] +
            [c["category"] for c in prev_cats]
        ))

        current_map = {c["category"]: round(float(c.get("avg_mastery") or 0), 1) for c in current_cats}
        prev_map = {c["category"]: round(float(c.get("avg_mastery") or 0), 1) for c in prev_cats}

        radar = {
            "categories": cat_names,
            "mastery": [current_map.get(c, 0) for c in cat_names],
            "prev_mastery": [prev_map.get(c, 0) for c in cat_names],
        }

        # 2. 知識樹（複用現有方法）
        tree_data = self.get_knowledge_mastery_map(username, subject)
        tree = tree_data.get("knowledge_tree", [])

        # 3. 趨勢折線圖：近 30 天
        trend_data = self._snapshots.get_category_trend(username, subject, days=30)
        dates_set = sorted(set(str(t.get("snap_date", "")) for t in trend_data))
        series: Dict[str, Dict[str, float]] = {}
        for t in trend_data:
            cat = t.get("category", "")
            d = str(t.get("snap_date", ""))
            level = round(float(t.get("avg_mastery") or 0), 1)
            if cat not in series:
                series[cat] = {}
            series[cat][d] = level

        # 填充缺失日期（用前一天的值）
        trend_series = {}
        for cat, date_map in series.items():
            values = []
            last_val = 0
            for d in dates_set:
                if d in date_map:
                    last_val = date_map[d]
                values.append(last_val)
            trend_series[cat] = values

        trend = {
            "dates": [d[5:] if len(d) >= 5 else d for d in dates_set],  # MM-DD
            "series": trend_series,
        }

        # 4. 薄弱知識點摘要
        # get_all_mastery 已 LEFT JOIN knowledge_points，自帶 point_name/category
        mastery_all = self._mastery.get_all_mastery(username, subject)

        def _enrich(m):
            """構建前端展示用的知識點摘要"""
            code = m["point_code"]
            raw_name = m.get("point_name") or code
            # 如果 LEFT JOIN 沒匹配到（point_name == point_code），美化代碼為可讀名稱
            name = raw_name if raw_name != code else self._humanize_code(code)
            return {
                "point_code": code,
                "point_name": name,
                "category": m.get("category") or "",
                "parent_code": m.get("parent_code") or "",
                "mastery_level": m.get("mastery_level", 0),
                "total_mistakes": m.get("total_mistakes", 0),
                "total_practices": m.get("total_practices", 0),
                "trend": m.get("trend", "stable"),
            }

        top_weak = sorted(
            [m for m in mastery_all if (m.get("mastery_level") or 0) < 60],
            key=lambda x: x.get("mastery_level", 0),
        )[:8]
        improving = [m for m in mastery_all if m.get("trend") == "improving"][:5]
        declining = [m for m in mastery_all if m.get("trend") == "declining"][:5]

        weak_summary = {
            "top_weak": [_enrich(w) for w in top_weak],
            "improving": [_enrich(m) for m in improving],
            "declining": [_enrich(m) for m in declining],
        }

        # 5. 薄弱知識點的關聯路徑（從根到薄弱點的路徑，顯示哪個分支薄弱）
        weak_paths = self._build_weak_paths(subject, [w["point_code"] for w in top_weak])

        return {
            "subject": subject,
            "radar": radar,
            "tree": tree,
            "trend": trend,
            "weak_summary": weak_summary,
            "weak_paths": weak_paths,
        }

    def get_mastery_history(self, username: str, point_code: str, limit: int = 30) -> List[Dict]:
        """獲取單個知識點的掌握度歷史曲線"""
        return self._snapshots.get_point_history(username, point_code, limit)

    def _build_weak_paths(self, subject: str, weak_codes: List[str]) -> List[Dict]:
        """
        構建從根節點到薄弱知識點的路徑，用於顯示薄弱分支結構。

        Returns:
            [
              { "path": ["代數", "方程", "一元一次方程"], "weak_point": "G1.2", "category": "代數" },
              ...
            ]
        """
        if not weak_codes:
            return []

        all_points = self._knowledge.find_by_subject(subject)
        code_map = {p["point_code"]: p for p in all_points}

        paths = []
        for wc in weak_codes:
            if wc not in code_map:
                continue
            # 從該知識點向上追溯到根
            chain = []
            current = code_map[wc]
            visited = set()
            while current and current["point_code"] not in visited:
                visited.add(current["point_code"])
                chain.append(current["point_name"])
                parent_code = current.get("parent_code")
                current = code_map.get(parent_code) if parent_code else None
            chain.reverse()
            paths.append({
                "path": chain,
                "weak_point": wc,
                "weak_name": code_map[wc]["point_name"],
                "category": code_map[wc].get("category", ""),
            })
        return paths

    async def ask_about_knowledge_point(
        self,
        username: str,
        point_code: str,
        question: str,
    ) -> Dict:
        """
        學生針對某知識點提問，AI 結合該生的掌握情況作答。
        """
        # 查找知識點詳情
        kp = self._knowledge.find_by_code(point_code)
        point_name = kp["point_name"] if kp else point_code
        category = kp.get("category", "") if kp else ""
        subject = kp.get("subject", "math") if kp else "math"

        # 該生對此知識點的掌握情況
        mastery = self._mastery.get_mastery(username, point_code)
        mastery_level = mastery["mastery_level"] if mastery else -1
        total_mistakes = mastery.get("total_mistakes", 0) if mastery else 0

        # 該生此知識點的近期錯題
        try:
            recent_mistakes = self._links.get_mistakes_for_point_detail(point_code, username, limit=3)
        except Exception:
            recent_mistakes = []

        mistakes_context = ""
        if recent_mistakes:
            lines = []
            for m in recent_mistakes:
                q = m.get("question_text", "")
                err = m.get("error_type", "")
                lines.append(f"- 題目: {q[:120]}  錯誤類型: {err}")
            mistakes_context = "\n".join(lines)

        subj_label = SubjectHandlerRegistry.get(subject).display_name

        prompt = f"""你是一位耐心親切的香港中學{subj_label}老師。一位學生想問關於「{point_name}」（分類：{category}）的問題。

## 學生對此知識點的掌握情況
- 掌握度：{mastery_level}%（{'尚可' if mastery_level >= 60 else '薄弱' if mastery_level >= 0 else '未知'}）
- 累計錯題：{total_mistakes} 題

{f'## 學生近期在此知識點犯的錯誤{chr(10)}{mistakes_context}' if mistakes_context else ''}

## 學生的問題
{question}

## 回覆要求
1. 用繁體中文回答
2. 語氣耐心、鼓勵
3. 如果學生問的是概念，結合具體例題解釋
4. 如果學生問的是解題方法，給出清晰步驟
5. 針對學生的薄弱點給出個性化建議
6. 數學公式使用 LaTeX 表示（$ 包裹行內，$$ 包裹整行）
7. 回答控制在 300 字以內，簡潔明瞭

直接回答，不要輸出 JSON。"""

        try:
            answer = await self._ask_ai_text(prompt, subject)
            return {
                "point_code": point_code,
                "point_name": point_name,
                "question": question,
                "answer": answer,
            }
        except Exception as e:
            logger.error("知識點問答失敗: %s", e)
            return {
                "point_code": point_code,
                "point_name": point_name,
                "question": question,
                "answer": "抱歉，暫時無法回答你的問題，請稍後再試。",
            }

    async def _ask_ai_text(self, prompt: str, subject: str) -> str:
        """
        調用 AI 返回純文本回答（非 JSON 格式），用於知識點問答等場景。
        """
        import httpx
        import re

        try:
            from llm.config import get_llm_config
            config = get_llm_config()
            model = config.local_model
            base_url = config.local_base_url
        except Exception:
            model = "qwen3.5:35b"
            base_url = "http://localhost:11434"

        # /no_think 指令告訴 Qwen3 不要輸出思考過程
        prompt_with_directive = prompt.rstrip() + "\n\n/no_think"

        payload = {
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": "你是一位經驗豐富、耐心親切的香港中學老師。請直接回答學生的問題，用繁體中文，語氣溫暖鼓勵。不要輸出任何思考過程。",
                },
                {"role": "user", "content": prompt_with_directive},
            ],
            "stream": False,
            "think": False,
            "options": {"temperature": 0.5, "num_predict": 2048},
        }

        url = f"{base_url}/api/chat"
        timeout = httpx.Timeout(120.0, connect=10.0)

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()

        msg = data.get("message", {})
        raw_content = msg.get("content", "")
        thinking = msg.get("thinking", "")

        logger.info("_ask_ai_text 原始回應: content_len=%d, thinking_len=%d", len(raw_content), len(thinking))

        # 清理 content 中的 <think> 標籤
        content = re.sub(r"<think>[\s\S]*?</think>", "", raw_content, flags=re.DOTALL).strip()

        # Qwen3 有時 content 為空，實際答案在 thinking 字段
        if not content and thinking:
            logger.info("content 為空，使用 thinking 字段")
            content = re.sub(r"<think>[\s\S]*?</think>", "", thinking, flags=re.DOTALL).strip()
            if not content:
                content = thinking.strip()

        # 再做一次 content 全局清理：移除殘留的 think 標籤
        content = re.sub(r"</?think>", "", content).strip()

        return content

    @staticmethod
    def _convert_to_jpeg_for_web(heic_path: str, save_dir: str, mistake_id: str) -> str:
        """
        將 HEIC/HEIF 圖片轉為 JPEG 供瀏覽器顯示

        保留原始 HEIC 檔案不動，在同目錄生成 .jpg 副本。
        返回 JPEG 路徑。如果轉換失敗，返回原路徑。
        """
        jpeg_path = os.path.join(save_dir, f"{mistake_id}.jpg")
        try:
            # 註冊 HEIF opener 讓 Pillow 能打開 HEIC
            from pillow_heif import register_heif_opener
            register_heif_opener()

            from PIL import Image
            img = Image.open(heic_path)

            # 轉為 RGB（去掉 alpha 通道）
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")

            img.save(jpeg_path, "JPEG", quality=90)
            logger.info("HEIC → JPEG 轉換成功: %s", jpeg_path)
            return jpeg_path

        except ImportError:
            logger.warning("pillow-heif 未安裝，無法轉換 HEIC，瀏覽器將無法顯示圖片")
            return heic_path
        except Exception as e:
            logger.warning("HEIC → JPEG 轉換失敗: %s，使用原圖路徑", e)
            return heic_path

    @staticmethod
    def _humanize_code(code: str) -> str:
        """
        將知識點代碼轉為可讀名稱（當 knowledge_points 表無匹配時的後備）

        例: ratio_simplification → 比例化簡
            GEO-03 → 幾何 03
            G10.2.1 → G10.2.1（無法轉換則保留原樣）
        """
        # 常見前綴映射
        prefix_map = {
            "GEO": "幾何", "ALG": "代數", "NUM": "數與量",
            "STAT": "統計", "PROB": "概率", "TRIG": "三角",
            "RAT": "比例", "FRAC": "分數", "EQ": "方程",
            "FUNC": "函數", "MEAS": "度量", "GRAPH": "圖形",
        }
        # 常見詞彙映射
        word_map = {
            "ratio": "比例", "simplification": "化簡", "combination": "組合",
            "addition": "加法", "subtraction": "減法", "multiplication": "乘法",
            "division": "除法", "fraction": "分數", "equation": "方程",
            "geometry": "幾何", "triangle": "三角形", "circle": "圓",
            "area": "面積", "volume": "體積", "perimeter": "周長",
            "angle": "角度", "parallel": "平行", "perpendicular": "垂直",
            "probability": "概率", "statistics": "統計", "mean": "平均數",
            "median": "中位數", "mode": "眾數", "range": "範圍",
            "graph": "圖表", "coordinate": "坐標", "slope": "斜率",
            "linear": "線性", "quadratic": "二次", "polynomial": "多項式",
            "integer": "整數", "decimal": "小數", "percentage": "百分比",
            "reading": "閱讀", "writing": "寫作", "grammar": "文法",
            "vocabulary": "詞彙", "comprehension": "理解", "composition": "作文",
            "tense": "時態", "article": "冠詞", "preposition": "介詞",
        }

        # 嘗試下劃線分詞: ratio_simplification → 比例化簡
        if "_" in code:
            parts = code.lower().split("_")
            translated = [word_map.get(p, p) for p in parts]
            result = "".join(translated)
            if result != code.lower():
                return result

        # 嘗試前綴匹配: GEO-03 → 幾何 03
        for prefix, cn in prefix_map.items():
            if code.upper().startswith(prefix):
                suffix = code[len(prefix):].lstrip("-. ")
                return f"{cn} {suffix}".strip() if suffix else cn

        return code

    @staticmethod
    def _simple_check(student_answer: str, correct_answer: str) -> bool:
        """簡單答案比對（用於選擇題和填空題）"""
        sa = student_answer.strip().lower()
        ca = correct_answer.strip().lower()

        if not sa or not ca:
            return False

        # 完全匹配
        if sa == ca:
            return True

        # 選擇題（A/B/C/D）
        if len(sa) == 1 and sa in "abcd":
            return sa == ca[0].lower() if ca else False

        # 包含匹配（答案關鍵詞在學生答案中）
        if len(ca) < 50 and ca in sa:
            return True

        return False

    @staticmethod
    def _parse_json_response(raw: str) -> Dict:
        """解析 LLM 返回的 JSON（容錯處理 LaTeX 反斜槓）"""
        if not raw:
            return {}

        text = raw.strip()

        # 移除 thinking 標籤
        import re
        text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()

        # 提取 JSON
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            parts = text.split("```")
            if len(parts) >= 3:
                text = parts[1].strip()

        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            text = text[start:end + 1]

        # 多級容錯解析（處理 LaTeX 反斜槓如 \frac \sqrt 等）
        # 第一次：直接解析
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # 第二次：修復不合法的轉義（\f \s 等 → \\f \\s）
        fixed = re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', text)
        try:
            return json.loads(fixed)
        except json.JSONDecodeError:
            pass

        # 第三次：全部反斜槓雙重轉義
        try:
            return json.loads(text.replace('\\', '\\\\'))
        except json.JSONDecodeError:
            pass

        # 第四次：嘗試用正則找到最大的 JSON 對象
        json_blocks = re.findall(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', text, re.DOTALL)
        for block in sorted(json_blocks, key=len, reverse=True):
            for attempt in [block, re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', block)]:
                try:
                    parsed = json.loads(attempt)
                    if isinstance(parsed, dict) and len(parsed) >= 2:
                        logger.info("正則提取 JSON 成功: %d 個字段", len(parsed))
                        return parsed
                except json.JSONDecodeError:
                    continue

        # 最終回退：從散文文本中提取關鍵信息構建結果
        logger.warning("JSON 解析失敗，嘗試從散文提取: %s", text[:200])
        return _extract_analysis_from_prose(raw)

    @staticmethod
    def _build_practice_feedback_prompt(
        subject: str, questions: List, results: List, score: float
    ) -> str:
        """構建練習反饋 prompt"""
        wrong_items = [r for r in results if not r.get("is_correct")]
        wrong_desc = "\n".join(
            f"- 第{r['question_idx']+1}題：學生答「{r['student_answer']}」，正確答案「{r['correct_answer']}」"
            for r in wrong_items[:5]
        )

        return f"""請為這位香港中學生的練習結果撰寫簡短反饋。

得分：{score:.0f}/100（{len(results)}題中答對{len(results)-len(wrong_items)}題）

答錯的題目：
{wrong_desc if wrong_desc else "全部答對！"}

要求：
- 用繁體中文
- 語氣溫暖鼓勵
- 如果有答錯的，簡要指出需要複習的方向
- 2-4句話即可
- 不要用 JSON 格式，直接寫文字"""
