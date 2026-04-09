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
import re
import uuid
import logging
from datetime import datetime
from typing import Callable, Dict, List, Optional, Any, Tuple

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


def _strip_thinking_from_field(text: str) -> str:
    """
    清理 AI 字段中的思考過程殘留。

    Qwen3 等模型有時會在 JSON 字段值中混入推理過程，
    如「等等，讓我重新檢查」「驚人的發現」等。
    此函數檢測並移除這些內容，只保留最終結論。
    """
    if not text or len(text) < 200:
        return text

    import re

    # 常見的思考轉折標記（中文）
    thinking_markers = [
        r'等等，讓我',
        r'讓我重新檢查',
        r'讓我再次',
        r'讓我再看',
        r'讓我再確認',
        r'修正分析[：:]',
        r'重新評估[：:]',
        r'重新審視[：:]',
        r'驚人的發現[：:]',
        r'再確認[：:]',
        r'再檢查一遍',
        r'或者，我是否',
        r'但是，題目要求',
        r'不過，如果必須',
        r'決定[：:]',
        r'結論[：:]',
    ]

    # 如果存在思考標記，嘗試只保留最後的結論部分
    has_thinking = False
    for marker in thinking_markers:
        if re.search(marker, text):
            has_thinking = True
            break

    if not has_thinking:
        return text

    # 策略：找最後一個「結論」/「決定」/「修正後」後的內容
    conclusion_markers = [
        r'結論[：:]',
        r'決定[：:]',
        r'修正後的',
        r'最終[：:]',
        r'因此[，,]',
    ]

    best_pos = -1
    for marker in conclusion_markers:
        for m in re.finditer(marker, text):
            if m.start() > best_pos:
                best_pos = m.start()

    if best_pos > 0 and best_pos < len(text) - 50:
        # 取結論部分，但如果太短就保留更多
        conclusion = text[best_pos:].strip()
        if len(conclusion) >= 50:
            return conclusion

    # 回退策略：截取前 800 字符（第一段分析通常是合理的，後面是反復推敲）
    # 找到第一個思考標記的位置
    first_think_pos = len(text)
    for marker in thinking_markers:
        m = re.search(marker, text)
        if m and m.start() < first_think_pos:
            first_think_pos = m.start()

    if first_think_pos > 50:
        return text[:first_think_pos].rstrip()

    return text[:800].rstrip() if len(text) > 800 else text


def _clean_analysis_fields(analysis: Dict) -> Dict:
    """對 AI 返回的分析結果進行思考過程清理"""
    for field in ("error_analysis", "correct_answer"):
        if field in analysis and isinstance(analysis[field], str):
            analysis[field] = _strip_thinking_from_field(analysis[field])
    return analysis


def _repair_latex_json_corruption(text: str) -> str:
    """
    修復外層 JSON 解析對 LaTeX 命令的損壞。

    問題：Ollama API 返回的 JSON 中，LaTeX 反斜線序列被 response.json() 解析為控制字符：
      \\times → \\t(TAB) + "imes"
      \\text  → \\t(TAB) + "ext"
      \\frac  → \\f(FF)  + "rac"
      \\bar   → \\b(BS)  + "ar"
      \\right → \\r(CR)  + "ight"
      \\n...  → \\n(LF)  + "abla" 等（但換行符本身也合法，需謹慎處理）
    """
    import re

    # 控制字符 → 原始反斜線字母的映射
    # 只修復後面跟著 2+ 字母的情況（避免誤修真正的控制字符）
    repairs = [
        ('\t', 't'),    # \times, \text, \theta, \tan, \tau, \triangle, \top
        ('\x08', 'b'),  # \bar, \binom, \begin, \beta, \boldsymbol, \bmod
        ('\f', 'f'),    # \frac, \forall, \flat
        ('\r', 'r'),    # \right, \rangle, \rho, \rightarrow, \rm
    ]
    for ctrl, letter in repairs:
        text = re.sub(
            re.escape(ctrl) + r'([a-zA-Z]{2,})',
            '\\\\' + letter + r'\1',
            text
        )
    return text


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

        # 提取 error_type 字段（可能是 "string" 或 null）
        et_null_match = re.search(r'"error_type"\s*:\s*null', text)
        if et_null_match:
            result["error_type"] = ""
        else:
            et_match = re.search(r'"error_type"\s*:\s*"([^"]*)"', text)
            if et_match:
                val = et_match.group(1)
                result["error_type"] = "" if val == "null" else val

        # 提取 correctness_level 字段
        cl_match = re.search(r'"correctness_level"\s*:\s*"([A-F])"', text)
        if cl_match:
            result["correctness_level"] = cl_match.group(1)

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


def _sanitize_svg_content(text: str) -> str:
    """清除 SVG 中的危險內容，保留安全繪圖標籤（資料防線）"""
    if not text or "<" not in text:
        return text
    # 刪除危險標籤（含閉合和自閉合）
    text = re.sub(
        r"<(script|foreignObject|image|iframe|object|embed)[^>]*>.*?</\1>",
        "", text, flags=re.DOTALL | re.IGNORECASE,
    )
    text = re.sub(
        r"<(script|foreignObject|image|iframe|object|embed)[^>]*/?\s*>",
        "", text, flags=re.IGNORECASE,
    )
    # 刪除事件處理器屬性
    text = re.sub(r"\s+on\w+\s*=\s*[\"'][^\"']*[\"']", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+on\w+\s*=\s*\S+", "", text, flags=re.IGNORECASE)
    # 刪除 javascript: / data:text/html URL
    text = re.sub(r"javascript\s*:", "", text, flags=re.IGNORECASE)
    text = re.sub(r"data\s*:\s*text/html", "", text, flags=re.IGNORECASE)
    return text


def _extract_svg_from_response(raw: str) -> str:
    """從 SVG 模型回應中提取 SVG，三層 fallback"""
    if not raw:
        return ""
    # 1. 嚴格 JSON parse
    try:
        svg = json.loads(raw).get("svg", "")
        if svg and "<svg" in svg and "</svg>" in svg:
            return svg
    except (json.JSONDecodeError, AttributeError):
        pass
    # 2. 提取第一個包含 "svg" 的 JSON 對象再 parse
    m = re.search(r'\{[^{}]*"svg"[^{}]*\}', raw, re.DOTALL)
    if m:
        try:
            svg = json.loads(m.group()).get("svg", "")
            if svg and "<svg" in svg and "</svg>" in svg:
                return svg
        except (json.JSONDecodeError, AttributeError):
            pass
    # 3. 正則直接抽第一個 <svg>...</svg>
    m = re.search(r"<svg[\s\S]*?</svg>", raw, re.IGNORECASE)
    if m:
        return m.group()
    return ""


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

    async def _call_ollama_direct(self, prompt: str, model_override: str = None,
                                  timeout_override: float = None,
                                  gate_task: str = None, gate_priority=None,
                                  gate_weight=None,
                                  temperature: float = 0.3) -> str:
        """
        直接異步調用 Ollama API（繞過 langchain 60s 超時限制）

        委託給 infrastructure.ai_pipeline.llm_caller，保持向後相容。
        """
        from app.infrastructure.ai_pipeline.llm_caller import call_ollama_json
        return await call_ollama_json(
            prompt=prompt,
            model=model_override,
            temperature=temperature,
            timeout=timeout_override or 300.0,
            gate_task=gate_task or "mistake_analysis",
            gate_priority=gate_priority,
            gate_weight=gate_weight,
        )

    # ================================================================
    # SVG 幾何圖生成（專用模型增強）
    # ================================================================

    async def _enrich_questions_with_svg(self, questions: list, subject: str) -> None:
        """
        為需要 SVG 的題目生成幾何圖形，直接修改 questions list。
        委託給 infrastructure.ai_pipeline.question_enricher。
        """
        from app.infrastructure.ai_pipeline.question_enricher import enrich_with_svg
        await enrich_with_svg(questions, subject)

    # _generate_svg_two_step 已遷移到 infrastructure.ai_pipeline.question_enricher

    # ================================================================
    # 統計圖表 SVG 生成（chart_spec → 確定性渲染）
    # ================================================================

    def _enrich_questions_with_charts(self, questions: list, subject: str) -> None:
        """
        為含 chart_spec 的題目生成統計圖表 SVG，直接修改 questions list。
        委託給 infrastructure.ai_pipeline.question_enricher。
        """
        from app.infrastructure.ai_pipeline.question_enricher import enrich_with_charts
        enrich_with_charts(questions, subject)

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

    # ================================================================
    # 上傳：拆分為 create + background process
    # ================================================================

    # 自動確認置信度門檻（低於此值不自動分析，進入 needs_review）
    AUTO_CONFIRM_THRESHOLD = 0.5

    async def create_mistake_record(
        self,
        student_username: str,
        subject: str,
        category: str,
        image_data: bytes,
        filename: str,
        extra_images: Optional[List[Tuple[bytes, str]]] = None,
    ) -> Dict:
        """
        快速創建錯題記錄（保存圖片 + 建 DB 記錄，不做 OCR）。

        支持多張照片：第一張存 original_image_path，其餘存 extra_image_paths (JSON)。
        後台由 process_mistake_background() 執行 OCR + 分析。

        Args:
            extra_images: 額外圖片列表 [(bytes, filename), ...]

        Returns:
            {mistake_id, status: "processing"}
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

        # 保存額外圖片
        extra_paths = []
        if extra_images:
            for idx, (img_bytes, img_name) in enumerate(extra_images, start=2):
                e_ext = os.path.splitext(img_name)[1] or ".jpg"
                e_filename = f"{mistake_id}_p{idx}{e_ext}"
                e_path = os.path.join(save_dir, e_filename)
                with open(e_path, "wb") as f:
                    f.write(img_bytes)
                # HEIC 轉換
                if e_ext.lower() in (".heic", ".heif"):
                    e_path = self._convert_to_jpeg_for_web(e_path, save_dir, f"{mistake_id}_p{idx}")
                extra_paths.append(e_path)

        # 創建記錄（status=processing，表示後台正在處理）
        record = {
            "mistake_id": mistake_id,
            "student_username": student_username,
            "subject": subject,
            "category": category,
            "original_image_path": web_image_path,
            "ocr_question_text": "",
            "ocr_answer_text": "",
            "confidence_score": 0.0,
            "status": "processing",
            "source": "photo",
        }
        if extra_paths:
            record["extra_image_paths"] = json.dumps(extra_paths)

        self._mistakes.insert(record)

        return {
            "mistake_id": mistake_id,
            "status": "processing",
            "message": "已上傳，AI 正在背景識別分析...",
        }

    async def process_mistake_background(self, mistake_id: str):
        """
        後台處理：OCR → 置信度閘門 → 自動確認 + AI 分析。

        設計為冪等：只有 status="processing" 時才執行，
        避免重複提交或任務重跑導致重複處理。
        """
        mistake = self._mistakes.find_by_mistake_id(mistake_id)
        if not mistake:
            logger.error("後台處理：找不到錯題 %s", mistake_id)
            return

        # 冪等保護：只處理 processing 狀態
        if mistake["status"] != "processing":
            logger.info(
                "後台處理：錯題 %s 狀態已為 %s，跳過",
                mistake_id, mistake["status"],
            )
            return

        subject = mistake["subject"]
        image_path = mistake["original_image_path"]
        category = mistake.get("category", "")

        # 收集所有圖片路徑
        all_image_paths = [image_path]
        extra_raw = mistake.get("extra_image_paths")
        if extra_raw:
            try:
                extra_list = json.loads(extra_raw) if isinstance(extra_raw, str) else extra_raw
                all_image_paths.extend(extra_list)
            except (json.JSONDecodeError, TypeError):
                logger.warning("無法解析 extra_image_paths: %s", extra_raw)

        # ---- Step 1: OCR（支持多張圖片） ----
        ocr_result = None
        if self._vision:
            recognition_subject = RecognitionSubject(subject)
            handler = SubjectHandlerRegistry.get(subject)
            task = handler.pick_recognition_task(category)

            if len(all_image_paths) == 1:
                # 單張圖片：原有邏輯
                try:
                    ocr_result = await self._vision.recognize(
                        image_path, recognition_subject, task
                    )
                except Exception as e:
                    logger.error("後台 OCR 異常 (mistake=%s): %s", mistake_id, e)
            else:
                # 多張圖片：逐張 OCR，合併結果
                try:
                    ocr_result = await self._ocr_multiple_images(
                        all_image_paths, recognition_subject, task, mistake_id
                    )
                except Exception as e:
                    logger.error("後台多圖 OCR 異常 (mistake=%s): %s", mistake_id, e)

        if not ocr_result or not ocr_result.success or not ocr_result.question_text:
            self._mistakes.update(
                {"status": "ocr_failed"},
                "mistake_id = %s", (mistake_id,),
            )
            logger.warning("後台 OCR 失敗 (mistake=%s)", mistake_id)
            return

        # 保存 OCR 結果
        figure_desc = ocr_result.figure_description or ""
        update_data = {
            "ocr_question_text": ocr_result.question_text,
            "ocr_answer_text": ocr_result.answer_text,
            "confidence_score": ocr_result.confidence,
        }

        # 構建分項置信度（支持所有啟用 confidence_breakdown 的科目）
        if getattr(handler, "supports_confidence_breakdown", False):
            q_conf = ocr_result.question_confidence
            a_conf = ocr_result.answer_confidence
            f_conf = ocr_result.figure_confidence
            if q_conf > 0 or a_conf > 0 or f_conf > 0:
                update_data["confidence_breakdown"] = json.dumps({
                    "question": round(q_conf, 2),
                    "answer": round(a_conf, 2),
                    "figure": round(f_conf, 2),
                })

        # 競態保護：寫入 OCR 結果前確認仍在 processing
        if not self._check_still_processing(mistake_id):
            return
        self._mistakes.update(update_data, "mistake_id = %s", (mistake_id,))

        # 保存圖形描述
        if figure_desc:
            logger.info("圖形描述已提取: %s", figure_desc[:100])
            self._apply_figure_description(mistake_id, figure_desc, schema_version=2)

        # ---- Step 2: 置信度閘門 ----
        # 沒有答案文字時，轉人工確認（避免 AI 自己生成答案）
        if not ocr_result.answer_text or not ocr_result.answer_text.strip():
            if not self._check_still_processing(mistake_id):
                return
            self._mistakes.update(
                {"status": "needs_review"},
                "mistake_id = %s", (mistake_id,),
            )
            logger.info(
                "後台 OCR 未提取到答案 (mistake=%s)，需人工輸入答案",
                mistake_id,
            )
            return

        if ocr_result.confidence < self.AUTO_CONFIRM_THRESHOLD:
            if not self._check_still_processing(mistake_id):
                return
            self._mistakes.update(
                {"status": "needs_review"},
                "mistake_id = %s", (mistake_id,),
            )
            logger.info(
                "後台 OCR 置信度不足 (mistake=%s, conf=%.2f < %.2f)，需人工確認",
                mistake_id, ocr_result.confidence, self.AUTO_CONFIRM_THRESHOLD,
            )
            return

        # ---- Step 3: 自動確認 + AI 分析 ----
        if not self._check_still_processing(mistake_id):
            return
        try:
            await self.confirm_and_analyze(
                mistake_id=mistake_id,
                confirmed_question=ocr_result.question_text,
                confirmed_answer=ocr_result.answer_text,
                confirmed_figure_description=figure_desc or None,
            )
            logger.info("後台處理完成 (mistake=%s) → analyzed", mistake_id)
        except Exception as e:
            logger.error("後台分析失敗 (mistake=%s): %s", mistake_id, e)
            if self._check_still_processing(mistake_id):
                self._mistakes.update(
                    {"status": "analysis_failed"},
                    "mistake_id = %s", (mistake_id,),
                )

    async def upload_mistake_photo(
        self,
        student_username: str,
        subject: str,
        category: str,
        image_data: bytes,
        filename: str,
    ) -> Dict:
        """
        上傳錯題照片並執行 OCR（同步版，向後兼容）。

        新流程推薦使用 create_mistake_record() + process_mistake_background()。
        """
        # 使用新方法創建記錄
        result = await self.create_mistake_record(
            student_username, subject, category, image_data, filename,
        )
        mistake_id = result["mistake_id"]

        # 同步執行 OCR + 分析（兼容舊調用方式）
        await self.process_mistake_background(mistake_id)

        # 重新讀取最新狀態返回
        mistake = self._mistakes.find_by_mistake_id(mistake_id)
        fig_desc = mistake.get("figure_description", "")
        fig_readable = mistake.get("figure_description_readable", "")

        return {
            "mistake_id": mistake_id,
            "ocr_question": mistake.get("ocr_question_text", ""),
            "ocr_answer": mistake.get("ocr_answer_text", ""),
            "confidence": mistake.get("confidence_score", 0.0),
            "confidence_breakdown": json.loads(mistake["confidence_breakdown"])
                if mistake.get("confidence_breakdown") else None,
            "has_handwriting": False,
            "figure_description": fig_desc,
            "figure_description_readable": fig_readable,
            "status": mistake.get("status", "processing"),
            "message": "處理完成",
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
                "status": "analyzing",
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
        tips = analysis.get("improvement_tips", [])
        # 正規化 error_type：AI 可能返回 null / "null" / None（表示答案完全正確）
        raw_error_type = analysis.get("error_type", "")
        if raw_error_type is None or raw_error_type == "null":
            raw_error_type = ""
        update_data = {
            "correct_answer": analysis.get("correct_answer", ""),
            "ai_analysis": analysis.get("error_analysis", ""),
            "improvement_tips": json.dumps(tips, ensure_ascii=False) if tips else None,
            "key_insight": analysis.get("key_insight", ""),
            "error_type": raw_error_type,
            "difficulty_level": analysis.get("difficulty_level", 3),
            "confidence_score": analysis.get("confidence", 0.8),
            "status": "analyzed",
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
            "correctness_level": analysis.get("correctness_level", ""),
            "correct_answer": analysis.get("correct_answer", ""),
            "error_type": raw_error_type,
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

        # 解析 improvement_tips JSON
        tips_raw = mistake.get("improvement_tips")
        if tips_raw:
            try:
                result["improvement_tips"] = json.loads(tips_raw) if isinstance(tips_raw, str) else tips_raw
            except (json.JSONDecodeError, TypeError):
                result["improvement_tips"] = []
        else:
            result["improvement_tips"] = []

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

    def cancel_processing(self, mistake_id: str, username: str) -> bool:
        """取消正在處理/分析中的錯題（將 processing/analyzing → cancelled）"""
        mistake = self._mistakes.find_by_mistake_id(mistake_id)
        if not mistake or mistake["student_username"] != username:
            raise MistakeNotFoundError(mistake_id)

        status = mistake["status"]
        if status == "cancelled":
            return True  # 冪等：已取消 → 成功
        if status not in ("processing", "analyzing"):
            raise ValueError(f"只能取消 processing/analyzing 狀態的錯題，當前狀態: {status}")

        self._mistakes.update(
            {"status": "cancelled"},
            "mistake_id = %s", (mistake_id,),
        )
        logger.info("用戶取消錯題處理: %s (原狀態: %s)", mistake_id, status)
        return True

    def _check_still_processing(self, mistake_id: str) -> bool:
        """重新讀取狀態，確認仍為 processing 或 analyzing（競態保護）"""
        mistake = self._mistakes.find_by_mistake_id(mistake_id)
        if not mistake or mistake["status"] not in ("processing", "analyzing"):
            logger.info("競態保護：錯題 %s 狀態已變為 %s，中止後續寫入",
                        mistake_id, mistake["status"] if mistake else "deleted")
            return False
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

    def get_practice_mastery_list(self, username: str, subject: str) -> List[Dict]:
        """
        獲取練習用知識點掌握度列表（含狀態標籤和推薦標記）。
        前端直接可用，無需二次計算。
        """
        all_points = self._knowledge.find_by_subject(subject)
        mastery_data = self._mastery.get_all_mastery(username, subject)
        mastery_map = {m["point_code"]: m for m in mastery_data}

        # 獲取錯題頻率 — 用於推薦排序
        mistake_points = self._links.get_weak_points_for_student(
            username, subject, limit=50
        )
        mistake_count_map = {
            mp["point_code"]: mp.get("mistake_count", 0) for mp in mistake_points
        }

        result = []
        for pt in all_points:
            code = pt["point_code"]
            m = mastery_map.get(code)
            mastery_level = m["mastery_level"] if m else None
            error_count = mistake_count_map.get(code, 0)
            trend = m.get("trend", "stable") if m else "stable"
            last_practice = m.get("last_practice_at") if m else None

            # status_label + status_reason
            if mastery_level is None:
                status_label = "unknown"
                status_reason = "暫無數據"
            elif mastery_level < 40:
                status_label = "weak"
                if error_count > 3:
                    status_reason = "近期錯誤較多"
                else:
                    status_reason = "掌握度偏低"
            elif mastery_level < 70:
                status_label = "consolidating"
                if trend == "declining":
                    status_reason = "掌握度下降中"
                else:
                    status_reason = "待鞏固"
            else:
                status_label = "mastered"
                status_reason = "表現穩定"

            result.append({
                "point_code": code,
                "point_name": pt.get("point_name", code),
                "category": pt.get("category", ""),
                "mastery_level": mastery_level,
                "error_count": error_count,
                "trend": trend,
                "last_practice_at": last_practice.isoformat() if last_practice else None,
                "status_label": status_label,
                "status_reason": status_reason,
                "is_recommended": False,  # 後面標記
            })

        # 標記推薦：按掌握度 ASC + 錯誤次數 DESC 取前 3 個薄弱知識點
        weak_items = [
            r for r in result
            if r["mastery_level"] is not None and r["mastery_level"] < 60
        ]
        weak_items.sort(
            key=lambda x: (x["mastery_level"], -x["error_count"])
        )
        recommended_codes = set()
        for item in weak_items[:3]:
            item["is_recommended"] = True
            recommended_codes.add(item["point_code"])

        # 若推薦不足 3 個，補充數據稀疏或 declining 的
        if len(recommended_codes) < 3:
            declining = [
                r for r in result
                if r["trend"] == "declining"
                and r["point_code"] not in recommended_codes
            ]
            for item in declining[:3 - len(recommended_codes)]:
                item["is_recommended"] = True
                recommended_codes.add(item["point_code"])

        return result

    # ================================================================
    #  手寫答案識別（練習輔助輸入）
    # ================================================================

    async def recognize_handwriting(
        self,
        image_data: bytes,
        filename: str,
        subject: str,
        mode: str = "canvas",
    ) -> Dict:
        """
        識別手寫答案，返回文字/LaTeX。
        輔助輸入能力，不是主答案層。

        Args:
            image_data: 圖片二進制數據
            filename: 原始文件名
            subject: 科目代碼
            mode: 輸入模式 (canvas/photo)
        """
        import time as _time
        t0 = _time.monotonic()
        temp_path = None

        try:
            from app.domains.vision.schemas import RecognitionSubject

            # 保存臨時文件
            upload_dir = os.path.join(UPLOAD_DIR, "handwriting_temp")
            os.makedirs(upload_dir, exist_ok=True)
            import uuid
            ext = os.path.splitext(filename)[1] or ".jpg"
            temp_path = os.path.join(upload_dir, f"{uuid.uuid4().hex}{ext}")
            with open(temp_path, "wb") as f:
                f.write(image_data)

            # 調用 VisionService
            if not self._vision:
                return {
                    "text": "", "has_math": False,
                    "low_confidence": True, "warnings": ["empty_result"],
                }

            subject_enum = RecognitionSubject(subject)
            result = await self._vision.recognize_handwriting_answer(
                temp_path, subject_enum,
            )

            latency = _time.monotonic() - t0
            logger.info(
                "手寫識別業務層: subject=%s, mode=%s, latency=%.1fs, "
                "text_len=%d, warnings=%s",
                subject, mode, latency,
                len(result.get("text", "")), result.get("warnings", []),
            )

            return result

        except Exception as e:
            logger.error("手寫識別業務層異常: %s", e, exc_info=True)
            return {
                "text": "", "has_math": False,
                "low_confidence": True, "warnings": ["empty_result"],
            }
        finally:
            # 清理臨時文件
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass

    # ── 練習題生成（異步兩步模式） ──────────────────────────

    # 超時閾值：超過此時間的 generating session 視為卡死
    _STUCK_TIMEOUT_MINUTES = 10

    def _recover_stuck_sessions(self, username: str) -> int:
        """掃描並回收當前用戶卡死的 generating sessions。"""
        stuck = self._practices.raw_query(
            "SELECT session_id FROM practice_sessions "
            "WHERE student_username = %s AND status = 'generating' "
            "AND created_at < DATE_SUB(NOW(), INTERVAL %s MINUTE)",
            (username, self._STUCK_TIMEOUT_MINUTES),
        )
        for row in stuck:
            self._practices.update(
                {"status": "generation_failed", "error_code": "STUCK_TIMEOUT",
                 "error_message": "生成超時，請重新嘗試"},
                "session_id = %s", (row["session_id"],),
            )
        if stuck:
            logger.warning("Recovered %d stuck generating sessions for %s",
                           len(stuck), username)
        return len(stuck)

    def start_practice_generation(
        self,
        username: str,
        subject: str,
        session_type: str = "targeted",
        question_count: int = 5,
        target_points: Optional[List[str]] = None,
        difficulty: Optional[int] = None,
        provider: str = "local",
    ) -> Dict:
        """
        Step A: 快速返回 session_id，不做 LLM 調用。

        包含 stuck recovery + 去重保護。
        """
        if not self._ask_ai_raw:
            raise AnalysisFailedError("AI 服務未配置")

        # Stuck recovery：標記超時的 generating sessions
        self._recover_stuck_sessions(username)

        # 去重：若已有活躍 generating session → 直接返回
        existing = self._practices.raw_query(
            "SELECT session_id, subject, session_type, target_points, created_at "
            "FROM practice_sessions "
            "WHERE student_username = %s AND status = 'generating' "
            "ORDER BY created_at DESC LIMIT 1",
            (username,),
        )
        if existing:
            row = existing[0]
            logger.info("Reusing existing generating session %s for %s",
                        row["session_id"], username)
            return {
                "session_id": row["session_id"],
                "status": "generating",
                "reused": True,
            }

        # Step 1-3: 快速解析（< 1s）
        points_data, recommendation_mode = self._resolve_target_points(
            username, subject, target_points, question_count
        )
        mastery_data = self._mastery.get_all_mastery(username, subject)
        mastery_map = {m["point_code"]: m for m in mastery_data}
        points_mastery = [
            mastery_map[p["point_code"]]
            for p in points_data if p["point_code"] in mastery_map
        ]
        resolved_difficulty, difficulty_source = self._resolve_difficulty(
            difficulty, points_mastery
        )
        generation_context = self._build_generation_context(
            username, subject, points_data, mastery_map, difficulty_source
        )

        # 構建推薦信息
        recommended_info = []
        if recommendation_mode == "auto_recommended":
            for p in points_data:
                m = mastery_map.get(p["point_code"])
                recommended_info.append({
                    "point_code": p["point_code"],
                    "point_name": p.get("point_name", p["point_code"]),
                    "mastery_level": m["mastery_level"] if m else None,
                })

        logger.info(
            "Practice generation decision: subject=%s, count=%d, "
            "mode=%s, difficulty=%d(%s), points=%s, dedupe_refs=%d",
            subject, question_count, recommendation_mode,
            resolved_difficulty, difficulty_source,
            [p["point_code"] for p in points_data],
            len(generation_context.get("recent_practice_summaries", [])),
        )

        # 建立 session 記錄（status=generating）
        session_id = str(uuid.uuid4())[:12]
        self._practices.insert({
            "session_id": session_id,
            "student_username": username,
            "subject": subject,
            "session_type": session_type,
            "target_points": json.dumps([p["point_code"] for p in points_data]),
            "questions": json.dumps([]),  # 空佔位
            "total_questions": question_count,
            "status": "generating",
        })

        return {
            "session_id": session_id,
            "status": "generating",
            "subject": subject,
            "session_type": session_type,
            "recommendation_mode": recommendation_mode,
            "recommended_points": recommended_info,
            "difficulty": resolved_difficulty,
            "difficulty_source": difficulty_source,
            # 傳遞給後台任務的上下文
            "_bg_context": {
                "points_data": points_data,
                "question_count": question_count,
                "resolved_difficulty": resolved_difficulty,
                "generation_context": generation_context,
                "provider": provider,
            },
        }

    async def generate_practice_background(
        self,
        session_id: str,
        points_data: List[Dict],
        question_count: int,
        resolved_difficulty: int,
        generation_context: Dict,
        provider: str = "local",
    ) -> None:
        """
        Step B: 後台生成題目（LLM + SVG + chart）。

        幂等保護：只在 status='generating' 時執行。
        """
        # 幂等檢查
        session = self._practices.find_by_session_id(session_id)
        if not session or session["status"] != "generating":
            logger.warning("Skipping background generation for %s (status=%s)",
                           session_id, session.get("status") if session else "NOT_FOUND")
            return

        subject = session["subject"]

        try:
            import random
            seed = random.randint(1000, 9999)
            prompt = build_practice_prompt(
                subject, points_data, question_count,
                resolved_difficulty,
                generation_context.get("student_mistakes_context", ""),
                student_history_context=generation_context.get("history_context", ""),
            )
            prompt += f"\n\n[seed={seed}] 請確保每次出題的數值、情境、設問方式都不同。"
            from app.infrastructure.ai_pipeline.llm_caller import call_llm_json
            raw, usage = await call_llm_json(
                prompt, provider=provider, temperature=0.8,
                gate_task="practice_generation",
            )

            # 非阻塞記錄 API 調用（無論是否有 token 數據都記錄）
            import asyncio
            from app.services.container import get_services
            from llm.config import get_llm_config as _get_llm_cfg
            _cfg = _get_llm_cfg()
            _model = _cfg.api_model if provider == "deepseek" else _cfg.local_model
            asyncio.create_task(get_services().llm_usage.record_async(
                user_id=None, provider=provider, model=_model,
                purpose="practice_gen", usage_dict=usage or {},
            ))

            questions_data = self._parse_json_response(raw)
            questions = questions_data.get("questions", [])

            # 為需要 SVG 的題目生成圖形
            await self._enrich_questions_with_svg(questions, subject)

            # 為需要統計圖表的題目生成 chart SVG
            self._enrich_questions_with_charts(questions, subject)

            # SVG 安全過濾
            for q in questions:
                if "question" in q:
                    q["question"] = _sanitize_svg_content(q["question"])
                if "question_svg" in q:
                    q["question_svg"] = _sanitize_svg_content(q["question_svg"])

            # 更新 session 記錄
            self._practices.update(
                {
                    "questions": json.dumps(questions, ensure_ascii=False),
                    "total_questions": len(questions),
                    "status": "generated",
                },
                "session_id = %s AND status = 'generating'",
                (session_id,),
            )
            logger.info("Practice generation completed: session=%s, questions=%d",
                        session_id, len(questions))

        except Exception as e:
            # 結構化失敗信息
            error_code = "UNKNOWN_ERROR"
            error_message = str(e)[:500]

            if "timeout" in str(e).lower() or "timed out" in str(e).lower():
                error_code = "LLM_TIMEOUT"
            elif "json" in str(e).lower() or "parse" in str(e).lower():
                error_code = "PARSE_ERROR"
            elif "svg" in str(e).lower():
                error_code = "SVG_ERROR"

            self._practices.update(
                {
                    "status": "generation_failed",
                    "error_code": error_code,
                    "error_message": error_message,
                },
                "session_id = %s AND status = 'generating'",
                (session_id,),
            )
            logger.error("Practice generation failed: session=%s, error=%s: %s",
                         session_id, error_code, e, exc_info=True)

    def get_practice_generation_status(
        self, session_id: str, username: str
    ) -> Optional[Dict]:
        """查詢練習生成狀態（含 ownership 檢查）"""
        session = self._practices.find_by_session_id(session_id)
        if not session or session["student_username"] != username:
            return None

        result = {
            "session_id": session_id,
            "status": session["status"],
            "subject": session["subject"],
            "session_type": session["session_type"],
            "created_at": session["created_at"].isoformat() if session.get("created_at") else None,
        }

        if session["status"] == "generated":
            questions = json.loads(session["questions"]) if session["questions"] else []
            result["questions"] = [
                {
                    "index": q.get("index", i + 1),
                    "question": q.get("question", ""),
                    "question_svg": q.get("question_svg", ""),
                    "question_type": q.get("question_type", "short_answer"),
                    "options": q.get("options"),
                    "point_code": q.get("point_code", ""),
                    "difficulty": q.get("difficulty", 3),
                }
                for i, q in enumerate(questions)
            ]
            result["total_questions"] = len(questions)
            # 補充推薦信息
            target_points = json.loads(session["target_points"]) if session.get("target_points") else []
            if target_points:
                mastery_data = self._mastery.get_all_mastery(username, session["subject"])
                mastery_map = {m["point_code"]: m for m in mastery_data}
                points_data = self._knowledge.find_by_codes(target_points)
                result["recommended_points"] = [
                    {
                        "point_code": p["point_code"],
                        "point_name": p.get("point_name", p["point_code"]),
                        "mastery_level": mastery_map.get(p["point_code"], {}).get("mastery_level"),
                    }
                    for p in points_data
                ]

        elif session["status"] == "generation_failed":
            error_code = session.get("error_code", "UNKNOWN_ERROR")
            result["error_code"] = error_code
            result["error_message"] = session.get("error_message", "生成失敗")
            result["retryable"] = error_code in ("LLM_TIMEOUT", "STUCK_TIMEOUT", "UNKNOWN_ERROR")

        return result

    def _resolve_target_points(
        self,
        username: str,
        subject: str,
        target_points: Optional[List[str]],
        question_count: int,
    ) -> Tuple[List[Dict], str]:
        """
        Step 1: 解析目標知識點。

        Returns:
            (points_data, recommendation_mode)
            recommendation_mode: 'user_selected' | 'auto_recommended'
        """
        if target_points:
            points_data = self._knowledge.find_by_codes(target_points)
            return points_data, "user_selected"

        # 智能推薦：按固定優先級選 2~3 點
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

        return points_data, "auto_recommended"

    @staticmethod
    def _resolve_difficulty(
        difficulty: Optional[int],
        points_mastery: List[Dict],
    ) -> Tuple[int, str]:
        """
        Step 2: 解析難度。

        Returns:
            (resolved_difficulty, difficulty_source)
        """
        if difficulty is not None:
            return difficulty, "manual"

        from app.domains.adaptive.engine import AdaptiveLearningEngine
        auto_diff = AdaptiveLearningEngine.adapt_difficulty(points_mastery)
        return auto_diff, "auto_from_mastery"

    def _build_generation_context(
        self,
        username: str,
        subject: str,
        points_data: List[Dict],
        mastery_map: Dict[str, Dict],
        difficulty_source: str,
    ) -> Dict:
        """
        Step 3: 構建結構化上下文。

        返回 dict 結構，由 Prompt 層轉為文字。
        """
        # 學生錯題摘要
        student_mistakes_context = self._get_student_mistakes_context(
            username, subject, limit=5
        )

        # 學生歷史上下文（掌握度 + 趨勢 + 錯誤類型分佈）
        history_context = self._build_practice_history_context(
            username, subject, points_data, mastery_map, difficulty_source
        )

        # 近期練習題摘要（去重用）
        recent_summaries = self._get_recent_practice_summaries(username, subject)

        return {
            "student_mistakes_context": student_mistakes_context,
            "history_context": history_context,
            "recent_practice_summaries": recent_summaries,
        }

    def _build_practice_history_context(
        self,
        username: str,
        subject: str,
        points_data: List[Dict],
        mastery_map: Dict[str, Dict],
        difficulty_source: str,
    ) -> str:
        """構建練習出題用的結構化學生畫像上下文"""
        lines = []

        # 1. 目標知識點掌握度
        lines.append("## 學生畫像")
        lines.append("目標知識點：")
        for p in points_data:
            code = p["point_code"]
            m = mastery_map.get(code)
            if m:
                trend_str = {"improving": "↑改善中", "declining": "↓下降中", "stable": "→穩定"}.get(
                    m.get("trend", "stable"), ""
                )
                lines.append(
                    f"- {p.get('point_name', code)}（{p.get('category', '')}）"
                    f"— 掌握度 {m.get('mastery_level', 0)}% {trend_str}"
                    f"，錯題 {m.get('total_mistakes', 0)} 次"
                )
            else:
                lines.append(
                    f"- {p.get('point_name', code)}（{p.get('category', '')}）— 暫無掌握度數據"
                )

        # 2. 難度來源
        if difficulty_source == "manual":
            lines.append("\n難度來源：學生手動指定")
        else:
            lines.append("\n難度來源：系統根據掌握度自動匹配")

        # 3. 錯誤類型分佈
        try:
            error_stats = self._mistakes.get_error_type_stats(username, subject)
            if error_stats:
                lines.append("\n## 錯誤類型分佈")
                for es in error_stats[:3]:
                    lines.append(f"- {es.get('error_type', '未知')}: {es.get('cnt', 0)} 次")
        except Exception:
            pass

        # 4. 分層出題規則
        lines.append("\n## 分層出題規則")
        lines.append("- 掌握度 < 40%：出基礎理解題（單步、直接辨識）")
        lines.append("- 掌握度 40-70%：出常規應用題（兩步推導）")
        lines.append("- 掌握度 > 70%：出綜合變式題（跨點遷移）")

        # 5. 近期練習去重
        recent = self._get_recent_practice_summaries(username, subject)
        if recent:
            lines.append("\n## 近期已出過的題目（請避免重複相同題型和解法）")
            for s in recent:
                lines.append(f"- [{s['point']}] {s['stem_summary']}")

        return "\n".join(lines)

    def _get_recent_practice_summaries(
        self, username: str, subject: str, session_limit: int = 2
    ) -> List[Dict]:
        """獲取近期練習題摘要（用於去重）"""
        result = self._practices.find_by_student(
            username, subject=subject, page=1, page_size=session_limit
        )
        sessions = result.get("items", [])
        summaries = []
        for sess in sessions:
            questions = sess.get("questions")
            if isinstance(questions, str):
                try:
                    questions = json.loads(questions)
                except (json.JSONDecodeError, TypeError):
                    continue
            if not questions:
                continue
            for q in questions:
                stem = q.get("question", "")[:80]
                summaries.append({
                    "point": q.get("point_code", ""),
                    "type": q.get("question_type", "short_answer"),
                    "stem_summary": stem,
                })
        return summaries

    async def submit_practice(
        self,
        session_id: str,
        username: str,
        answers: List[Dict],
    ) -> Dict:
        """提交練習答案並批改（混合批改管線）"""
        import asyncio

        session = self._practices.find_by_session_id(session_id)
        if not session:
            raise PracticeNotFoundError(session_id)

        questions = json.loads(session["questions"]) if isinstance(session["questions"], str) else session["questions"]
        subject = session["subject"]

        # 並行 LLM 批改（Semaphore 限制併發）
        sem = asyncio.Semaphore(2)

        async def _grade_with_sem(q, student_answer):
            async with sem:
                return await self._grade_single_question(subject, q, student_answer)

        # 構建批改任務
        grade_tasks = []
        answer_map = {}  # idx → student_answer
        for ans in answers:
            idx = ans.get("question_idx", 0)
            student_answer = ans.get("answer", "")
            answer_map[idx] = student_answer
            if idx < len(questions):
                grade_tasks.append((idx, _grade_with_sem(questions[idx], student_answer)))

        # 並行執行批改
        grade_results = {}
        if grade_tasks:
            indices, coros = zip(*grade_tasks)
            graded = await asyncio.gather(*coros, return_exceptions=True)
            for idx, result in zip(indices, graded):
                if isinstance(result, Exception):
                    logger.warning("題 %d 批改異常: %s", idx + 1, result)
                    grade_results[idx] = {}
                else:
                    grade_results[idx] = result

        # 組裝結果
        correct_count = 0
        results = []
        mastery_updates = []

        for ans in answers:
            idx = ans.get("question_idx", 0)
            student_answer = answer_map.get(idx, "")

            if idx < len(questions):
                q = questions[idx]
                grading = grade_results.get(idx, {})
                is_correct = grading.get("is_correct", False)

                if is_correct:
                    correct_count += 1

                results.append({
                    "question_idx": idx,
                    "student_answer": student_answer,
                    "is_correct": is_correct,
                    "correctness_level": grading.get("correctness_level"),
                    "correct_answer": q.get("correct_answer", ""),
                    "error_analysis": grading.get("error_analysis"),
                    "error_type": grading.get("error_type"),
                    "explanation": q.get("explanation", ""),
                    "grading_source": grading.get("grading_source", "deterministic"),
                    "grading_model": grading.get("grading_model"),
                })

                # 更新掌握度
                point_code = q.get("point_code", "")
                if point_code:
                    update = self._update_mastery_on_practice(
                        username, subject, point_code, is_correct,
                        q.get("difficulty", 3),
                    )
                    if update:
                        mastery_updates.append(update)

        score = (correct_count / len(questions) * 100) if questions else 0

        # 記錄掌握度快照（用於知識圖譜趨勢）
        snapshot_codes = [u["point_code"] for u in mastery_updates]
        if snapshot_codes:
            self._save_mastery_snapshots(
                username, subject,
                snapshot_codes, "practice", session_id
            )

        # AI 總評（結構驅動 + best-effort）
        ai_feedback = ""
        try:
            feedback_prompt = self._build_practice_feedback_prompt(
                subject, questions, results, score
            )
            ai_feedback = await self._ask_ai(feedback_prompt, subject)
        except Exception as e:
            logger.warning("練習反饋 AI 生成失敗: %s", e)

        # 更新練習記錄（含 ai_feedback）
        self._practices.update(
            {
                "student_answers": json.dumps(results, ensure_ascii=False),
                "correct_count": correct_count,
                "score": score,
                "ai_feedback": ai_feedback or None,
                "status": "completed",
                "completed_at": datetime.now(),
            },
            "session_id = %s",
            (session_id,),
        )

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
    # 練習歷史 + 詳情 + 重練
    # ================================================================

    def get_practice_history(
        self,
        username: str,
        subject: Optional[str] = None,
        page: int = 1,
        page_size: int = 10,
    ) -> Dict:
        """
        獲取練習歷史列表（含所有狀態：generating / completed / generation_failed）。
        後端計算趨勢信號：錯題數 + 主要 error_type（僅 completed）。
        """
        result = self._practices.find_by_student(
            username=username,
            subject=subject,
            status=None,  # 不過濾狀態 — 返回所有
            page=page,
            page_size=page_size,
        )

        items = []
        for s in result.get("items", []):
            status = s.get("status", "completed")

            # generating / failed 狀態返回簡化數據
            if status in ("generating", "generation_failed"):
                items.append({
                    "session_id": s["session_id"],
                    "subject": s.get("subject", ""),
                    "status": status,
                    "total_questions": s.get("total_questions", 0),
                    "created_at": str(s.get("created_at", "")),
                })
                continue

            # completed 狀態：原有邏輯
            total = s.get("total_questions", 0)
            correct = s.get("correct_count", 0)
            wrong_count = total - correct

            # 解析 student_answers 提取主要 error_type
            primary_error_type = None
            if wrong_count > 0:
                try:
                    answers = s.get("student_answers")
                    if isinstance(answers, str):
                        answers = json.loads(answers)
                    if isinstance(answers, list):
                        error_counts: Dict[str, int] = {}
                        for a in answers:
                            if not a.get("is_correct") and a.get("error_type"):
                                et = a["error_type"]
                                error_counts[et] = error_counts.get(et, 0) + 1
                        if error_counts:
                            primary_error_type = max(error_counts, key=error_counts.get)
                except Exception:
                    pass

            items.append({
                "session_id": s["session_id"],
                "subject": s.get("subject", ""),
                "status": status,
                "score": round(s.get("score", 0) or 0, 1),
                "correct_count": correct,
                "total_questions": total,
                "wrong_count": wrong_count,
                "primary_error_type": primary_error_type,
                "session_type": s.get("session_type", "targeted"),
                "completed_at": str(s["completed_at"]) if s.get("completed_at") else None,
            })

        return {
            "items": items,
            "total": result.get("total", 0),
            "page": page,
            "page_size": page_size,
        }

    def delete_practice_session(self, session_id: str, username: str) -> None:
        """刪除練習記錄（僅限本人）"""
        session = self._practices.find_by_session_id(session_id)
        if not session:
            raise MistakeNotFoundError(session_id)
        if session.get("student_username") != username:
            raise MistakeNotFoundError(session_id)
        self._practices.delete("session_id = %s AND student_username = %s", (session_id, username))
        logger.info("Practice session deleted: %s by %s", session_id, username)

    def get_practice_session_detail(
        self, session_id: str, username: str,
    ) -> Dict:
        """
        獲取練習詳情（題目 + 批改結果）。
        對舊格式 student_answers 做 normalize。
        """
        session = self._practices.find_by_session_id(session_id)
        if not session:
            raise PracticeNotFoundError(session_id)

        if session.get("student_username") != username:
            raise PracticeNotFoundError(session_id)

        questions = session.get("questions")
        if isinstance(questions, str):
            questions = json.loads(questions)
        questions = questions or []

        student_answers = session.get("student_answers")
        if isinstance(student_answers, str):
            student_answers = json.loads(student_answers)
        student_answers = student_answers or []

        # Normalize 舊格式（補默認字段）
        for r in student_answers:
            r.setdefault("correctness_level", None)
            r.setdefault("error_analysis", None)
            r.setdefault("error_type", None)
            r.setdefault("grading_source", "legacy")

        # 合併題目與批改結果
        merged = []
        for idx, q in enumerate(questions):
            answer_data = next(
                (a for a in student_answers if a.get("question_idx") == idx),
                {},
            )
            merged.append({
                "question_idx": idx,
                "question": q.get("question", ""),
                "correct_answer": q.get("correct_answer", ""),
                "explanation": q.get("explanation", ""),
                "point_code": q.get("point_code", ""),
                "difficulty": q.get("difficulty", 3),
                "question_type": q.get("question_type", "short_answer"),
                # 批改結果
                "student_answer": answer_data.get("student_answer", ""),
                "is_correct": answer_data.get("is_correct", False),
                "correctness_level": answer_data.get("correctness_level"),
                "error_analysis": answer_data.get("error_analysis"),
                "error_type": answer_data.get("error_type"),
                "grading_source": answer_data.get("grading_source", "legacy"),
            })

        return {
            "session_id": session_id,
            "subject": session.get("subject", ""),
            "session_type": session.get("session_type", "targeted"),
            "score": round(session.get("score", 0) or 0, 1),
            "correct_count": session.get("correct_count", 0),
            "total_questions": session.get("total_questions", 0),
            "ai_feedback": session.get("ai_feedback"),
            "completed_at": str(session["completed_at"]) if session.get("completed_at") else None,
            "created_at": str(session["created_at"]) if session.get("created_at") else None,
            "questions": merged,
        }

    async def generate_repractice(
        self,
        username: str,
        source_session_id: str,
        mode: str = "redo_wrong",
    ) -> Dict:
        """
        從歷史 session 生成重練。

        mode:
        - "redo_wrong": 直接用原錯題（快照重做）
        - "similar": 按錯題 point_code 生成新題
        """
        source = self._practices.find_by_session_id(source_session_id)
        if not source or source.get("student_username") != username:
            raise PracticeNotFoundError(source_session_id)

        questions = source.get("questions")
        if isinstance(questions, str):
            questions = json.loads(questions)
        questions = questions or []

        student_answers = source.get("student_answers")
        if isinstance(student_answers, str):
            student_answers = json.loads(student_answers)
        student_answers = student_answers or []

        # 找出錯題
        wrong_indices = set()
        for a in student_answers:
            if not a.get("is_correct"):
                wrong_indices.add(a.get("question_idx"))
        wrong_questions = [q for idx, q in enumerate(questions) if idx in wrong_indices]

        if not wrong_questions:
            return {"error": "no_wrong_questions", "message": "這次練習全部答對，沒有需要重練的題目！"}

        subject = source.get("subject", "math")
        import uuid as _uuid

        if mode == "redo_wrong":
            # 原題重做：直接用錯題快照
            new_session_id = f"practice_{_uuid.uuid4().hex[:12]}"
            self._practices.insert({
                "session_id": new_session_id,
                "student_username": username,
                "subject": subject,
                "session_type": "targeted",
                "target_points": json.dumps([], ensure_ascii=False),
                "questions": json.dumps(wrong_questions, ensure_ascii=False),
                "total_questions": len(wrong_questions),
                "status": "generated",
                "created_at": datetime.now(),
            })

            return {
                "session_id": new_session_id,
                "questions": wrong_questions,
                "total_questions": len(wrong_questions),
                "source_session_id": source_session_id,
                "source_mode": "redo_wrong",
            }

        elif mode == "similar":
            # 同類再練：按 point_code 生成新題
            point_codes = list({q.get("point_code", "") for q in wrong_questions if q.get("point_code")})
            if not point_codes:
                # 沒有 point_code → 回退到原題重做
                return await self.generate_repractice(username, source_session_id, "redo_wrong")

            target_points = []
            for code in point_codes:
                point = self._knowledge.find_by_code(code)
                if point:
                    target_points.append({
                        "point_code": code,
                        "point_name": point.get("point_name", code),
                        "category": point.get("category", ""),
                    })

            if not target_points:
                return await self.generate_repractice(username, source_session_id, "redo_wrong")

            # 用現有 generate_practice 生成新題
            result = await self.generate_practice(
                username=username,
                subject=subject,
                target_points=target_points,
                question_count=len(wrong_questions),
            )

            # 記錄來源鏈（在 session 創建後追加 metadata）
            if result.get("session_id"):
                result["source_session_id"] = source_session_id
                result["source_mode"] = "similar"

            return result

        else:
            return {"error": "invalid_mode", "message": f"不支援的模式: {mode}"}

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

    def get_learning_summary(
        self, username: str, subject: str = None,
    ) -> Dict[str, Any]:
        """
        返回預聚合的學習摘要，供跨域分析使用。

        這是一個穩定的公開介面，由 AnalyticsService 等外部服務調用。
        內部復用已注入的 repo 方法，不暴露底層實現。

        Args:
            username: 學生用戶名
            subject: 學科代碼（None 表示全部）

        Returns:
            dict: 包含錯題、掌握度、練習成績等摘要
        """
        dashboard = self.get_dashboard(username)
        error_stats = self._mistakes.get_error_type_stats(username, subject)
        weakest = self._mastery.get_weakest(username, subject or "", limit=5)
        declining = self._mastery.get_declining(username, subject)

        practice_scores = []
        if subject:
            practice_scores = self._practices.get_recent_scores(
                username, subject, limit=10,
            )

        return {
            "total_mistakes": dashboard["total_mistakes"],
            "per_subject": dashboard["per_subject"],
            "mastery_overview": dashboard["mastery_overview"],
            "review_streak": dashboard["review_streak"],
            "weekly_review_trend": dashboard["weekly_review_trend"],
            "error_type_stats": error_stats,
            "weakest_points": weakest,
            "declining_points": declining,
            "recent_practice_scores": practice_scores,
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

    def seed_knowledge_points(self, data_path: str) -> Dict[str, Any]:
        """從 JSON 文件導入知識點種子數據 (含完整 reconciliation)。

        策略:對每個 subject 獨立做 diff,新的 INSERT、已存在的 UPDATE、
        DB 裡有但 JSON 裡沒有的 mark is_active=FALSE (保留歷史引用)。

        Returns:
            {total: int, by_subject: {subject: {inserted, deactivated, kept}}}
        """
        with open(data_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        points = data.get("points", [])
        # grade_levels: list → JSON string (for DB storage)
        for p in points:
            if "grade_levels" in p and isinstance(p["grade_levels"], list):
                p["grade_levels"] = json.dumps(p["grade_levels"])

        # Group by subject
        by_subject: Dict[str, List[Dict]] = {}
        for p in points:
            subj = p.get("subject")
            if not subj:
                logger.warning("知識點 seed 缺 subject: %s", p.get("point_code"))
                continue
            by_subject.setdefault(subj, []).append(p)

        # 對每個科目做 reconciliation
        result = {"total": 0, "by_subject": {}}
        for subject, desired in by_subject.items():
            stats = self._knowledge.reconcile_subject(subject, desired)
            result["by_subject"][subject] = stats
            result["total"] += stats["inserted"]
            logger.info(
                "知識點 seed [%s]: inserted=%d, deactivated=%d, kept=%d",
                subject, stats["inserted"], stats["deactivated"], stats["kept"],
            )

        return result

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
            result = self._parse_json_response(raw)
            return _clean_analysis_fields(result)
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
            "options": {"temperature": 0.5, "num_predict": 8192},
        }

        from app.core.ai_gate import ai_gate, Priority, Weight

        timeout = httpx.Timeout(300.0, connect=20.0)

        async with ai_gate("mistake_qa", Priority.INTERACTIVE, Weight.CHAT) as client:
            response = await client.post("/api/chat", json=payload, timeout=timeout)
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

    async def _ocr_multiple_images(
        self,
        image_paths: List[str],
        subject: "RecognitionSubject",
        task: "RecognitionTask",
        mistake_id: str,
    ) -> Optional["OCRResult"]:
        """
        逐張 OCR 多張圖片，合併為單一 OCRResult。

        策略：
        - 按順序 OCR 每張圖片
        - question_text / answer_text / figure_description 分別拼接
        - confidence 取平均值
        - 任意一張成功即視為整體成功
        """
        from app.domains.vision.schemas import OCRResult

        results = []
        for idx, path in enumerate(image_paths):
            try:
                r = await self._vision.recognize(path, subject, task)
                results.append(r)
                logger.info(
                    "多圖 OCR 第 %d/%d 張完成 (mistake=%s, conf=%.2f)",
                    idx + 1, len(image_paths), mistake_id, r.confidence,
                )
            except Exception as e:
                logger.warning(
                    "多圖 OCR 第 %d/%d 張失敗 (mistake=%s): %s",
                    idx + 1, len(image_paths), mistake_id, e,
                )

        if not results:
            return None

        # 合併結果
        ok_results = [r for r in results if r.success and r.question_text]
        if not ok_results:
            # 全部失敗，返回第一個結果（保留錯誤信息）
            return results[0]

        sep = "\n\n---\n\n"  # 多張圖片分隔符
        merged = OCRResult(
            question_text=sep.join(r.question_text for r in ok_results if r.question_text),
            answer_text=sep.join(r.answer_text for r in ok_results if r.answer_text),
            figure_description=sep.join(r.figure_description for r in ok_results if r.figure_description),
            confidence=sum(r.confidence for r in ok_results) / len(ok_results),
            has_math_formula=any(r.has_math_formula for r in ok_results),
            has_handwriting=any(r.has_handwriting for r in ok_results),
            success=True,
            question_confidence=sum(r.question_confidence for r in ok_results) / len(ok_results),
            answer_confidence=sum(r.answer_confidence for r in ok_results) / len(ok_results),
            figure_confidence=sum(r.figure_confidence for r in ok_results) / len(ok_results),
            metadata={"multi_image": True, "image_count": len(image_paths), "success_count": len(ok_results)},
        )
        return merged

    # ================================================================
    # 混合批改管線 (Hybrid Grading Pipeline)
    # ================================================================

    VALID_ERROR_TYPES = {
        "careless", "concept", "calculation", "method",
        "format", "incomplete", "irrelevant",
    }
    VALID_LEVELS = {"A", "B", "C", "D", "E", "F"}
    CORRECT_LEVELS = {"A", "B"}  # is_correct=true 的等級

    @staticmethod
    def _deterministic_check(
        student_answer: str, correct_answer: str, question_type: str = "short_answer",
    ) -> dict:
        """
        確定性判定（保守：寧可 low 也不誤判）。
        返回 {is_correct, confidence: "high"|"low", hard_wrong: bool}
        """
        sa = student_answer.strip()
        ca = correct_answer.strip()

        # 硬判錯：空白答案
        if not sa:
            return {"is_correct": False, "confidence": "high", "hard_wrong": True}
        if not ca:
            return {"is_correct": False, "confidence": "low", "hard_wrong": False}

        sa_lower = sa.lower()
        ca_lower = ca.lower()

        # 選擇題
        if question_type == "multiple_choice" or (len(sa) == 1 and sa_lower in "abcd"):
            ca_first = ca_lower[0] if ca_lower else ""
            if sa_lower == ca_first and ca_first in "abcd":
                return {"is_correct": True, "confidence": "high", "hard_wrong": False}
            if sa_lower in "abcd" and ca_first in "abcd":
                return {"is_correct": False, "confidence": "high", "hard_wrong": True}
            return {"is_correct": False, "confidence": "low", "hard_wrong": False}

        # 精確匹配（去空格標準化）
        def _normalize(s):
            import re as _re
            s = s.strip().lower()
            s = s.replace('（', '(').replace('）', ')').replace('，', ',')
            s = _re.sub(r'\s+', '', s)
            return s

        if _normalize(sa) == _normalize(ca):
            return {"is_correct": True, "confidence": "high", "hard_wrong": False}

        # 數值等價
        def _try_numeric(s):
            import re as _re
            s = s.strip().replace(' ', '')
            # 分數 a/b
            m = _re.match(r'^(-?\d+)/(\d+)$', s)
            if m:
                try:
                    return float(m.group(1)) / float(m.group(2))
                except (ValueError, ZeroDivisionError):
                    pass
            try:
                return float(s)
            except ValueError:
                return None

        sa_num = _try_numeric(sa)
        ca_num = _try_numeric(ca)
        if sa_num is not None and ca_num is not None:
            if abs(sa_num - ca_num) < 1e-9:
                return {"is_correct": True, "confidence": "high", "hard_wrong": False}
            return {"is_correct": False, "confidence": "high", "hard_wrong": False}

        # 無法確定 → low（交 LLM 處理）
        return {"is_correct": False, "confidence": "low", "hard_wrong": False}

    async def _llm_grade_question(
        self, subject: str,
        question_text: str, student_answer: str,
        correct_answer: str, question_type: str = "short_answer",
    ) -> dict:
        """LLM 評語層：生成 correctness_level + error_analysis。"""
        from app.domains.mistake_book.subject_handler import SubjectHandlerRegistry
        from app.core.ai_gate import Priority

        handler = SubjectHandlerRegistry.get(subject)
        prompt = handler.build_practice_grading_prompt(
            question_text, student_answer, correct_answer, question_type,
        )

        try:
            from llm.config import get_llm_config
            model = get_llm_config().local_model
        except Exception:
            model = "qwen3.5:35b"

        try:
            raw = await self._call_ollama_direct(
                prompt,
                timeout_override=30.0,
                gate_task="practice_grading",
                gate_priority=Priority.NORMAL,
            )
            result = self._parse_json_response(raw)
            if not result:
                return {}

            # 嚴格校驗
            level = result.get("correctness_level", "").upper()
            if level not in self.VALID_LEVELS:
                level = None

            # is_correct 必須與等級邊界一致
            if level:
                is_correct = level in self.CORRECT_LEVELS
            else:
                is_correct = result.get("is_correct", False)

            error_type = result.get("error_type")
            if error_type and error_type not in self.VALID_ERROR_TYPES:
                error_type = None

            analysis = result.get("error_analysis", "")
            if isinstance(analysis, str) and len(analysis) > 500:
                analysis = analysis[:500]

            return {
                "correctness_level": level,
                "is_correct": is_correct,
                "error_analysis": analysis or None,
                "error_type": error_type,
                "grading_model": model,
            }
        except Exception as e:
            logger.warning("LLM 批改失敗: %s", e)
            return {}

    async def _grade_single_question(
        self, subject: str, question: dict, student_answer: str,
    ) -> dict:
        """混合批改管線：deterministic + LLM。"""
        correct_answer = question.get("correct_answer", "")
        question_type = question.get("question_type", "short_answer")
        question_text = question.get("question", "")

        # Step 1: 確定性判定
        det = self._deterministic_check(student_answer, correct_answer, question_type)

        # Step 2: LLM 補充
        llm_result = {}
        grading_source = "deterministic"

        try:
            llm_result = await self._llm_grade_question(
                subject, question_text, student_answer, correct_answer, question_type,
            )
        except Exception as e:
            logger.warning("LLM 批改異常: %s", e)

        # Step 3: 合併
        if llm_result:
            if det.get("hard_wrong"):
                # 硬判錯：LLM 不可翻正
                is_correct = False
                grading_source = "deterministic+llm"
            elif det["confidence"] == "high":
                # 確定性判定可靠：用 det 的 is_correct
                is_correct = det["is_correct"]
                grading_source = "deterministic+llm"
            else:
                # confidence low：以 LLM 為準
                is_correct = llm_result.get("is_correct", det["is_correct"])
                grading_source = "llm"
        else:
            # LLM 失敗
            is_correct = det["is_correct"]
            grading_source = "fallback_deterministic" if det["confidence"] == "low" else "deterministic"

        return {
            "is_correct": is_correct,
            "correctness_level": llm_result.get("correctness_level"),
            "error_analysis": llm_result.get("error_analysis"),
            "error_type": llm_result.get("error_type"),
            "grading_source": grading_source,
            "grading_model": llm_result.get("grading_model"),
        }

    @staticmethod
    def _parse_json_response(raw: str) -> Dict:
        """
        解析 LLM 返回的 JSON（容錯處理 LaTeX 反斜槓）。
        委託給 infrastructure.ai_pipeline.llm_caller，
        失敗時 fallback 到 _extract_analysis_from_prose（錯題分析專用）。
        """
        from app.infrastructure.ai_pipeline.llm_caller import parse_questions_json
        result = parse_questions_json(raw)
        if result:
            return result
        # ai_pipeline 返回空 dict 時，嘗試從散文提取（錯題分析場景專用）
        return _extract_analysis_from_prose(raw) if raw else {}

    @staticmethod
    def _build_practice_feedback_prompt(
        subject: str, questions: List, results: List, score: float
    ) -> str:
        """構建練習反饋 prompt（結構化摘要驅動）"""
        wrong_items = [r for r in results if not r.get("is_correct")]
        correct_count = len(results) - len(wrong_items)

        # 統計 error_type 分佈
        error_counts = {}
        for r in wrong_items:
            et = r.get("error_type") or "unknown"
            error_counts[et] = error_counts.get(et, 0) + 1
        error_dist = ", ".join(f"{k}: {v}次" for k, v in sorted(error_counts.items(), key=lambda x: -x[1]))

        # 統計 correctness_level 分佈
        level_counts = {}
        for r in results:
            lv = r.get("correctness_level") or "?"
            level_counts[lv] = level_counts.get(lv, 0) + 1
        level_dist = ", ".join(f"{k}: {v}題" for k, v in sorted(level_counts.items()))

        wrong_desc = "\n".join(
            f"- 第{r['question_idx']+1}題（{r.get('correctness_level', '?')}級）：{r.get('error_analysis', '未知錯誤')}"
            for r in wrong_items[:5]
        )

        return f"""請為這位香港中學生的練習結果撰寫簡短反饋。

得分：{score:.0f}/100（{len(results)}題中答對{correct_count}題）
等級分佈：{level_dist}
錯誤類型：{error_dist if error_dist else "無"}

答錯摘要：
{wrong_desc if wrong_desc else "全部答對！"}

要求：
- 用繁體中文
- 語氣溫暖鼓勵
- 基於以上數據總結，不要重複列舉每題
- 如果有答錯的，指出最需要加強的方向
- 2-4句話即可
- 不要用 JSON 格式，直接寫文字"""
