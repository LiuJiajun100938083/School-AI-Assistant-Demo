"""
錯題本科目處理器基類與註冊表
============================
定義每個科目必須實現的接口，以及自動發現、加載、緩存科目處理器的 Registry。

架構概述:
- BaseSubjectHandler: 抽象基類，定義科目處理器接口
- DefaultSubjectHandler: 通用處理器，適配未自定義的科目
- SubjectHandlerRegistry: 自動掃描 subjects/ 包，發現並緩存處理器
"""

import importlib
import logging
import pkgutil
from abc import ABC, abstractmethod
from typing import Dict, List, Optional

from app.domains.vision.schemas import RecognitionTask

logger = logging.getLogger(__name__)


# ============================================================
# 基類
# ============================================================

class BaseSubjectHandler(ABC):
    """
    科目處理器基類。

    每個科目可實現自己的 Handler，封裝:
    - 錯誤類型列表
    - AI 分析 / 出題 / 報告 Prompt
    - OCR 任務選擇
    - 前端 UI 特性標記
    """

    # ---- 身份 ----

    @property
    @abstractmethod
    def subject_code(self) -> str:
        """科目代碼，須與 subjects 表的 subject_code 一致，如 'math'"""
        ...

    @property
    @abstractmethod
    def display_name(self) -> str:
        """繁體中文顯示名稱，如 '數學'"""
        ...

    # ---- 題目類型（分類） ----

    @property
    def categories(self) -> List[Dict]:
        """
        該科目可用的題目類型列表。
        每項: {"value": "存入DB的值", "label": "前端顯示名稱"}
        默認提供通用分類，各科應覆蓋。
        """
        return [
            {"value": "選擇題", "label": "選擇題"},
            {"value": "填空題", "label": "填空題"},
            {"value": "簡答題", "label": "簡答題"},
            {"value": "問答題", "label": "問答題"},
        ]

    # ---- 錯誤類型 ----

    @property
    def error_types(self) -> List[str]:
        """
        該科目適用的 error_type 值列表。
        默認為通用集合，各科可覆蓋。
        """
        return [
            "concept_error", "calculation_error", "comprehension_gap",
            "careless", "expression_weak", "memory_error",
            "logic_error", "method_error",
        ]

    # ---- Prompt 構建 ----

    @abstractmethod
    def build_analysis_prompt(
        self,
        question_text: str,
        student_answer: str,
        knowledge_points_context: str = "",
        figure_description: str = "",
        student_history_context: str = "",
    ) -> str:
        """構建 AI 錯題分析 prompt。"""
        ...

    @abstractmethod
    def build_practice_prompt(
        self,
        target_points: List[Dict],
        question_count: int,
        difficulty: Optional[int] = None,
        student_mistakes_context: str = "",
        student_history_context: str = "",
    ) -> str:
        """構建 AI 練習題生成 prompt。"""
        ...

    def build_weakness_report_prompt(
        self,
        weak_points: List[Dict],
        error_stats: List[Dict],
        student_name: str = "同學",
    ) -> str:
        """
        構建薄弱知識點報告 prompt。
        默認實現為通用模板，各科可覆蓋。
        """
        points_text = "\n".join(
            f"- {wp.get('point_name', '')}: 掌握度 {wp.get('mastery_level', 0)}%, "
            f"錯題數 {wp.get('mistake_count', 0)}, 趨勢 {wp.get('trend', 'stable')}"
            for wp in weak_points
        )
        errors_text = "\n".join(
            f"- {es.get('error_type', '未知')}: {es.get('cnt', 0)} 次"
            for es in error_stats
        )

        return f"""你是一位關心學生學習的香港中學教師。請根據以下數據，為學生撰寫一份{self.display_name}科學習分析摘要。

## 學生的薄弱知識點
{points_text if points_text else "暫無數據"}

## 錯誤類型分佈
{errors_text if errors_text else "暫無數據"}

## 要求
1. 用繁體中文撰寫
2. 語氣溫暖鼓勵，不要批評
3. 指出 2-3 個最需要關注的知識點
4. 給出具體、可操作的改進建議
5. 適當肯定學生已有的進步

## 輸出格式（JSON）
```json
{{
  "summary": "整體學習情況簡述（2-3句）",
  "key_weaknesses": ["最需關注的知識點1", "知識點2"],
  "recommendations": ["具體建議1", "具體建議2", "具體建議3"],
  "encouragement": "一句鼓勵的話"
}}
```
只輸出 JSON。"""

    # ---- OCR 配置 ----

    def pick_recognition_task(self, category: str) -> RecognitionTask:
        """
        根據題目類型選擇 OCR 任務。
        默認返回 QUESTION_AND_ANSWER，各科可覆蓋。
        """
        return RecognitionTask.QUESTION_AND_ANSWER

    # ---- 語言偵測 ----

    @staticmethod
    def _is_english_text(text: str) -> bool:
        """
        判斷文本是否主要為英文。
        用於英文班學生上傳的數學/物理題目——若題目是英文，回覆也用英文。
        """
        if not text:
            return False
        # 計算 CJK 字符數（中日韓統一表意文字）
        cjk_count = sum(
            1 for ch in text
            if '\u4e00' <= ch <= '\u9fff'      # CJK Unified
            or '\u3400' <= ch <= '\u4dbf'       # CJK Extension A
            or '\uf900' <= ch <= '\ufaff'       # CJK Compatibility
        )
        non_space = sum(1 for ch in text if not ch.isspace())
        if non_space == 0:
            return False
        return (cjk_count / non_space) < 0.1

    # ---- SVG 圖形生成 ----

    @property
    def supports_svg_generation(self) -> bool:
        """此科目是否支持 SVG 圖形生成（默認否）"""
        return False

    def needs_svg(self, question_text: str) -> bool:
        """判斷此題是否需要 SVG 圖形（默認否）"""
        return False

    def build_practice_grading_prompt(
        self,
        question_text: str,
        student_answer: str,
        correct_answer: str,
        question_type: str = "short_answer",
    ) -> str:
        """構建練習批改 prompt（LLM 評語層）。默認通用版，各科可覆寫。"""
        return f"""你是一位經驗豐富的{self.display_name}科教師。請批改以下練習題。

題目：{question_text}
學生答案：{student_answer}
參考答案：{correct_answer}
題型：{question_type}

## 評分等級（必須嚴格遵守邊界）
| 等級 | 含義 | is_correct |
|------|------|------------|
| A | 完全正確，結果與表達都合格 | true |
| B | 本質正確，有輕微表達問題（未化簡、格式） | true |
| C | 主要思路對，但答案不完整/部分缺失 | false |
| D | 有明顯方法或計算錯誤，但體現出部分理解 | false |
| E | 基本不理解核心概念 | false |
| F | 無關、空白、拒答、嚴重偏離題意 | false |

## error_type 枚舉（只能選其一，A 級填 null）
careless / concept / calculation / method / format / incomplete / irrelevant

## 輸出（只輸出 JSON，不要解釋）
```json
{{"correctness_level": "A", "is_correct": true, "error_analysis": "1-2句繁體中文評語", "error_type": null}}
```"""

    def build_svg_prompt(self, question_text: str) -> str:
        """為題目構建 SVG 生成 prompt（子類覆寫）"""
        return ""

    def build_geometry_spec_prompt(self, question_text: str) -> str:
        """構建幾何 spec JSON 提取 prompt（V2 中間層，子類覆寫）"""
        return ""

    def build_svg_from_spec_prompt(self, question_text: str, spec_json: str) -> str:
        """從幾何 spec JSON 構建 SVG 生成 prompt（V2 中間層，子類覆寫）"""
        return ""

    # ---- 前端 UI 特性 ----

    @property
    def ui_features(self) -> Dict:
        """
        前端特性標記，通過 API 傳給前端用於條件渲染。
        例如: {"katex": True} 表示需要數學公式渲染。
        """
        return {}

    @property
    def supports_confidence_breakdown(self) -> bool:
        """OCR 結果是否包含分項置信度（question/answer/figure）。"""
        return False


# ============================================================
# 默認處理器
# ============================================================

class DefaultSubjectHandler(BaseSubjectHandler):
    """
    通用處理器，適配沒有自定義 Handler 的科目。
    使用通用 Prompt 模板，能處理基本的分析和出題需求。
    """

    def __init__(self, code: str, name: str = ""):
        self._code = code
        self._name = name or code

    @property
    def subject_code(self) -> str:
        return self._code

    @property
    def display_name(self) -> str:
        return self._name

    def build_analysis_prompt(
        self,
        question_text: str,
        student_answer: str,
        knowledge_points_context: str = "",
        figure_description: str = "",
        student_history_context: str = "",
    ) -> str:
        figure_note = f"\n圖形描述：{figure_description}" if figure_description else ""
        history_note = f"\n學生歷史：{student_history_context}" if student_history_context else ""
        return f"""請分析以下學生的答題情況。

題目：{question_text}{figure_note}
學生答案：{student_answer}
知識點列表：{knowledge_points_context}{history_note}

請以 JSON 格式回覆：
{{
  "is_correct": false,
  "correct_answer": "正確答案",
  "error_type": "錯誤類型",
  "error_analysis": "錯誤分析",
  "improvement_tips": ["建議"],
  "knowledge_points": ["相關知識點"],
  "difficulty_level": 3,
  "confidence": 0.8
}}
只輸出 JSON。"""

    def build_practice_prompt(
        self,
        target_points: List[Dict],
        question_count: int,
        difficulty: Optional[int] = None,
        student_mistakes_context: str = "",
        student_history_context: str = "",
    ) -> str:
        points_desc = "\n".join(f"- {p['point_name']}" for p in target_points)
        history_section = f"\n{student_history_context}\n" if student_history_context else ""
        return f"""請根據以下知識點出 {question_count} 道練習題：
{points_desc}
{history_section}
輸出 JSON 格式，每題包含 question, correct_answer, explanation, point_code, difficulty。
只輸出 JSON。"""


# ============================================================
# 註冊表
# ============================================================

class SubjectHandlerRegistry:
    """
    科目處理器註冊表。

    發現順序:
    1. 自動掃描 app.domains.mistake_book.subjects 包
    2. 通過 register() 手動註冊
    3. 未找到自定義 Handler 時回退到 DefaultSubjectHandler
    """

    _handlers: Dict[str, BaseSubjectHandler] = {}
    _discovered: bool = False

    @classmethod
    def discover(cls) -> None:
        """自動掃描 subjects 包，加載所有 HANDLER_CLASS。"""
        if cls._discovered:
            return

        try:
            import app.domains.mistake_book.subjects as subjects_pkg
            for _importer, modname, _ispkg in pkgutil.iter_modules(
                subjects_pkg.__path__, subjects_pkg.__name__ + "."
            ):
                try:
                    module = importlib.import_module(modname)
                    handler_class = getattr(module, "HANDLER_CLASS", None)
                    if handler_class and issubclass(handler_class, BaseSubjectHandler):
                        instance = handler_class()
                        cls._handlers[instance.subject_code] = instance
                        logger.info(
                            "科目處理器已加載: %s (%s)",
                            instance.subject_code, instance.display_name,
                        )
                except Exception as e:
                    logger.warning("加載科目處理器失敗 %s: %s", modname, e)
        except ImportError:
            logger.warning("subjects 包未找到，僅使用默認處理器")

        cls._discovered = True

    @classmethod
    def register(cls, handler: BaseSubjectHandler) -> None:
        """手動註冊一個處理器。"""
        cls._handlers[handler.subject_code] = handler

    @classmethod
    def get(cls, subject_code: str) -> BaseSubjectHandler:
        """
        獲取科目處理器。
        若無自定義 Handler，返回 DefaultSubjectHandler。
        """
        if not cls._discovered:
            cls.discover()

        handler = cls._handlers.get(subject_code)
        if handler:
            return handler

        # 為未知科目創建並緩存默認處理器
        default = DefaultSubjectHandler(subject_code)
        cls._handlers[subject_code] = default
        return default

    @classmethod
    def get_all(cls) -> Dict[str, BaseSubjectHandler]:
        """返回所有已註冊的處理器。"""
        if not cls._discovered:
            cls.discover()
        return dict(cls._handlers)

    @classmethod
    def reset(cls) -> None:
        """重置註冊表（用於測試）。"""
        cls._handlers = {}
        cls._discovered = False
