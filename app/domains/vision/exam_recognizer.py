"""
試卷識別鏈路
============
從 VisionService 拆出。處理試卷多題 OCR：
prompt 構建、模型調用、結果解析、降級恢復。
"""

import json
import logging
import os
import re
from typing import Optional

from app.domains.vision.schemas import ExamPaperResult, RecognitionSubject
from app.domains.vision.ollama_client import OllamaVisionClient
from app.domains.vision import json_utils

logger = logging.getLogger(__name__)


class ExamRecognizer:
    """試卷識別器"""

    def __init__(self, client: OllamaVisionClient):
        self._client = client

    async def recognize_exam_paper(
        self,
        image_path: str,
        subject: RecognitionSubject = RecognitionSubject.CHINESE,
    ) -> ExamPaperResult:
        """
        識別試卷圖片中的所有題目、答案和分數。
        """
        try:
            if not os.path.exists(image_path):
                return ExamPaperResult(
                    success=False, error=f"圖片文件不存在: {image_path}"
                )

            processed_path = await self._client.preprocess_image(image_path)
            prompt = self._build_exam_paper_prompt(subject)

            # 首選 JSON 強制模式
            fallback_mode = "json"
            raw_response = await self._client.call_vision_model_json(processed_path, prompt)

            # 回退到普通模式
            if raw_response is None:
                fallback_mode = "normal"
                logger.warning("試卷識別: JSON 模式失敗，回退到普通模式")
                raw_response = await self._client.call_vision_model(processed_path, prompt)

            if raw_response is None:
                logger.error("試卷識別: 所有模式均失敗, fallback_mode=%s", fallback_mode)
                return ExamPaperResult(success=False, error="視覺模型調用失敗")

            result = self._parse_exam_paper_response(raw_response)

            logger.info(
                "試卷識別完成: fallback_mode=%s, success=%s, question_count=%d, "
                "confidence=%.2f, warnings=%s",
                fallback_mode,
                result.success,
                len(result.questions) if result.questions else 0,
                result.confidence if result.confidence else 0,
                result.warnings or [],
            )
            return result

        except Exception as e:
            logger.error("試卷識別異常: %s", e, exc_info=True)
            return ExamPaperResult(success=False, error=str(e))

    def _build_exam_paper_prompt(self, subject: RecognitionSubject) -> str:
        """構建試卷多題識別專用 prompt"""
        subject_hint = {
            RecognitionSubject.CHINESE: "這是一份中文科試卷。",
            RecognitionSubject.MATH: "這是一份數學科試卷。數學公式請用 LaTeX 格式（如 $x^2 + y^2 = r^2$）。",
            RecognitionSubject.ENGLISH: "This is an English exam paper.",
            RecognitionSubject.PHYSICS: "這是一份物理科試卷。公式請用 LaTeX 格式。",
        }.get(subject, "這是一份試卷。如果包含數學或物理公式，請用 LaTeX 格式（如 $x^2 + y^2 = r^2$）。")

        return f"""/no_think
IMPORTANT: Return EXACTLY one JSON object. Do NOT output any analysis or reasoning.
Do NOT describe what you see. Do NOT start with "首先" or "Let me". Directly output JSON.

{subject_hint}

請識別圖片中的**所有內容**，包括資料段落和題目。

要求:
1. 識別每一道題的題號、題目文字、參考答案（如果可見）和分值（如果標註）
2. 如果圖片中沒有顯示答案，answer_text 填空字串，answer_source 填 "missing"
3. 如果答案是你推斷的（非圖片中可見），answer_source 填 "inferred"
4. 如果答案是圖片中明確可見的，answer_source 填 "extracted"
5. 分值（points）如果圖片中沒有標註，設為 null
6. 題型（question_type）不確定時設為 "open"
7. 子題也要獨立列出（如 1a, 1b 分開）
8. 數學公式用 LaTeX 格式
9. 資料段落 (passage) 識別:
   - 試卷中的資料表格、文字段落、圖表說明等非題目內容 → question_type = "passage"
   - passage 的 question_text 放完整的資料文字內容（表格用 markdown 格式）
   - passage 的 points = null, answer_text = "", answer_source = "missing"
   - passage 應該排在引用它的題目之前
10. 填空題 (fill_blank) 識別 — 保守判定:
   - 題目中出現 ____（底線空格）或分項答題表格（如 論點/論據/論述） → question_type = "fill_blank"
   - 如果不確定是否為填空，寧可設為 "open"
   - fill_blank 必須額外輸出 metadata:
     {{"blank_mode": "inline / section / mixed", "template_text": "原題文字，空格位置用 {{{{bN}}}} 標記", "blanks": [{{"id":"b1","label":"","input_type":"short_text","points":分值,"answer":""}}]}}
   - template_text: 保留原題的完整文字，在空格處插入 {{{{b1}}}}, {{{{b2}}}} 等佔位符。換行用 \n
   - input_type: 短填空（一兩個詞/數字）用 "short_text"，長答（一段話）用 "long_text"
   - blank_mode: 純行內空格用 "inline"，純分項答題用 "section"，混合（既有短填又有長答）用 "mixed"
   - label: 如果分項有標題（如「製造業」「建造業」），填入 label；否則 label 填空字串
   - 題目 points = blanks 的 points 總和

你的回答必須是且僅是一個 JSON 對象。禁止任何推理文字、分析說明、markdown code fence。
如果無法確定某字段，用空字串或 null，但仍必須輸出合法 JSON。

輸出格式:
{{
  "questions": [
    {{
      "question_number": "",
      "question_text": "資料A：2012至2022年各行業每周工時表...",
      "answer_text": "",
      "answer_source": "missing",
      "points": null,
      "question_type": "passage",
      "has_math_formula": false,
      "confidence": 0.9
    }},
    {{
      "question_number": "1",
      "question_text": "根據資料A，描述各行業每周工時的趨勢...",
      "answer_text": "",
      "answer_source": "missing",
      "points": 18,
      "question_type": "fill_blank",
      "has_math_formula": false,
      "confidence": 0.85,
      "metadata": {{
        "blank_mode": "mixed",
        "template_text": "製造業而言，平均每周工時由2012年的 {{{{b1}}}} 小時下降至2022年的 {{{{b2}}}} 小時。\\n建造業而言，{{{{b3}}}}\\n小結：{{{{b4}}}}",
        "blanks": [
          {{"id": "b1", "label": "", "input_type": "short_text", "points": 2, "answer": ""}},
          {{"id": "b2", "label": "", "input_type": "short_text", "points": 2, "answer": ""}},
          {{"id": "b3", "label": "建造業", "input_type": "long_text", "points": 6, "answer": ""}},
          {{"id": "b4", "label": "小結", "input_type": "long_text", "points": 8, "answer": ""}}
        ]
      }}
    }},
    {{
      "question_number": "2",
      "question_text": "一般題目...",
      "answer_text": "",
      "answer_source": "missing",
      "points": 5,
      "question_type": "open",
      "has_math_formula": false,
      "confidence": 0.9
    }}
  ],
  "paper_title": "試卷標題或空字串",
  "total_score": null
}}"""

    def _parse_exam_paper_response(self, raw: str) -> ExamPaperResult:
        """鲁棒解析試卷多題 OCR 回應。"""
        warnings = []

        # Step 1: 直接解析
        parsed = json_utils.try_parse_exam_json(raw)

        # Step 2: 提取 JSON block
        if parsed is None:
            match = re.search(r'\{[\s\S]*\}', raw)
            if match:
                parsed = json_utils.try_parse_exam_json(match.group())

        # Step 3: 去除 code fence
        if parsed is None:
            cleaned = re.sub(r'```(?:json)?\s*', '', raw)
            cleaned = re.sub(r'```\s*$', '', cleaned).strip()
            parsed = json_utils.try_parse_exam_json(cleaned)

        # Step 4: 有限度修復 (trailing comma)
        if parsed is None:
            fixed = re.sub(r',\s*([}\]])', r'\1', raw)
            match = re.search(r'\{[\s\S]*\}', fixed)
            if match:
                parsed = json_utils.try_parse_exam_json(match.group())

        # Step 5: 自然語言降級恢復
        if parsed is None:
            recovered = recover_questions_from_text(raw)
            if recovered:
                parsed = recovered
                warnings.append("JSON 解析失敗，從文本內容降級恢復 (low confidence)")

        if parsed is None:
            logger.error("試卷 OCR 回應解析完全失敗，raw=%s", raw[:500])
            return ExamPaperResult(
                success=False,
                error="無法解析模型輸出為 JSON",
                raw_text=raw[:2000],
            )

        # 提取 questions 列表
        questions_raw = parsed.get("questions", [])
        if not isinstance(questions_raw, list):
            questions_raw = [questions_raw] if isinstance(questions_raw, dict) else []
            warnings.append("questions 字段不是列表，已自動包裝")

        # 標準化每道題
        LOW_CONFIDENCE_THRESHOLD = 0.6
        low_count = 0
        questions = []
        for i, q in enumerate(questions_raw):
            if not isinstance(q, dict):
                continue

            q_text = str(q.get("question_text", "")).strip()
            if not q_text:
                continue

            points_raw = q.get("points")
            points = parse_points_value(points_raw)

            confidence = float(q.get("confidence", 0.0))
            if confidence < LOW_CONFIDENCE_THRESHOLD:
                low_count += 1

            metadata_raw = q.get("metadata")
            metadata = metadata_raw if isinstance(metadata_raw, dict) else {}
            metadata["has_math_formula"] = bool(q.get("has_math_formula", False))
            if "blanks" in metadata and isinstance(metadata["blanks"], list):
                for bi, blank in enumerate(metadata["blanks"]):
                    if isinstance(blank, dict):
                        if not blank.get("id"):
                            blank["id"] = f"b{bi + 1}"
                        if blank.get("input_type") not in ("short_text", "long_text"):
                            blank["input_type"] = "short_text"

            questions.append({
                "question_number": str(q.get("question_number", str(i + 1))).strip(),
                "question_text": q_text,
                "answer_text": str(q.get("answer_text", "")).strip(),
                "answer_source": str(q.get("answer_source", "missing")).strip(),
                "points": points,
                "question_type": str(q.get("question_type", "open")).strip(),
                "has_math_formula": metadata.get("has_math_formula", False),
                "confidence": confidence,
                "metadata": metadata if metadata else None,
            })

        paper_title = str(parsed.get("paper_title", "")).strip()
        total_score_raw = parsed.get("total_score")
        total_score = parse_points_value(total_score_raw)

        overall_confidence = (
            sum(q.get("confidence", 0) for q in questions) / len(questions)
            if questions else 0.0
        )

        if not questions:
            warnings.append("未識別到任何有效題目")

        return ExamPaperResult(
            questions=questions,
            paper_title=paper_title,
            total_score=total_score,
            confidence=overall_confidence,
            warnings=warnings,
            raw_text=raw[:2000],
            success=True,
        )


# ================================================================
#  工具函數
# ================================================================

def recover_questions_from_text(raw: str) -> Optional[dict]:
    """
    從自然語言文本降級恢復試卷結構。
    當 JSON 完全解析失敗時的最後手段。
    """
    text = raw.strip()
    text = re.sub(r'</?think>', '', text, flags=re.IGNORECASE).strip()

    if len(text) < 50:
        return None

    questions = []

    # 提取試卷標題
    paper_title = ""
    title_match = re.search(
        r'(?:標題|試卷|paper_title)[：:]\s*(.+?)(?:\n|$)', text
    )
    if title_match:
        paper_title = title_match.group(1).strip()

    # 提取 passage
    passage_pattern = re.compile(
        r'(?:資料|资料)\s*([A-Za-z\d一二三四五])[：:]?\s*(.+?)(?=(?:資料|资料)\s*[A-Za-z\d一二三四五]|(?:第?\s*\d+|問題|题目|question)\s*[.、：:]|\Z)',
        re.DOTALL
    )
    for m in passage_pattern.finditer(text):
        label = m.group(1).strip()
        content = m.group(2).strip()
        if len(content) > 10:
            questions.append({
                "question_number": "",
                "question_text": f"資料{label}：{content}",
                "answer_text": "",
                "answer_source": "missing",
                "points": None,
                "question_type": "passage",
                "has_math_formula": False,
                "confidence": 0.3,
            })

    # 提取題目 — 只匹配行首的題號格式，避免把正文中的數字誤判
    q_pattern = re.compile(
        r'(?:^|\n)\s*(?:'
        r'(?:第\s*(\d+[a-z]?)\s*[題题])'           # "第1題" / "第2a題"
        r'|(?:(\d{1,3}[a-z]?)\s*[.、)\）]\s)'       # "1." / "2a、" / "3)"（需要後跟空格）
        r'|(?:(?:問題|题目|question)\s*(\d+[a-z]?))'  # "問題1" / "question 2"
        r')\s*[：:]?\s*(.+?)(?=\n\s*(?:第\s*\d+[a-z]?\s*[題题]|\d{1,3}[a-z]?\s*[.、)\）]\s|(?:問題|题目|question)\s*\d+)|\Z)',
        re.DOTALL | re.IGNORECASE
    )
    for m in q_pattern.finditer(text):
        q_num = (m.group(1) or m.group(2) or m.group(3) or "").strip()
        q_text = m.group(4).strip()
        q_text = q_text[:500].strip()
        if len(q_text) > 10:  # 至少 10 字才算有效題目
            questions.append({
                "question_number": q_num,
                "question_text": q_text,
                "answer_text": "",
                "answer_source": "missing",
                "points": None,
                "question_type": "open",
                "has_math_formula": False,
                "confidence": 0.3,
            })

    # 防止降級恢復產生過多碎片（超過 50 題大概率是誤識別）
    if len(questions) > 50:
        logger.warning("降級恢復產生 %d 題，超出合理範圍，丟棄結果", len(questions))
        return None

    if not questions:
        return None

    logger.info(
        "文本降級恢復成功: passages=%d, questions=%d, title=%s",
        sum(1 for q in questions if q["question_type"] == "passage"),
        sum(1 for q in questions if q["question_type"] != "passage"),
        repr(paper_title[:50]),
    )
    return {
        "questions": questions,
        "paper_title": paper_title,
        "total_score": None,
    }


def parse_points_value(raw) -> Optional[float]:
    """容錯解析分值: 5 / 5.0 / "5分" / "5 marks" → float"""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw) if raw > 0 else None
    if isinstance(raw, str):
        match = re.search(r'(\d+(?:\.\d+)?)', raw)
        if match:
            val = float(match.group(1))
            return val if val > 0 else None
    return None
