#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
抄襲檢測 Service
=================
業務邏輯層，提供兩層抄襲檢測:

第一層 — N-gram 文本相似度 (快速篩選)
    將文本切成連續 N 個字元的片段，用 Jaccard 係數衡量兩份提交的重疊率。
    純 Python 實現，無需額外依賴，30 人班級 < 5 秒。

第二層 — AI 語義分析 (深度確認)
    對相似度超過閾值的配對，調用本地 Ollama 模型做語義級判斷，
    區分「合理引用」和「抄襲」。

用法:
    service = PlagiarismService(...)
    report = service.start_check(assignment_id=1, teacher_id=5)
    result = service.get_report(report_id=1)
    pairs  = service.get_flagged_pairs(report_id=1)
"""

import json
import logging
import re
from collections import Counter
from datetime import datetime
from itertools import combinations
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.core.exceptions import ValidationError
from app.domains.assignment.constants import DOCUMENT_EXTENSIONS, TEXT_READABLE_EXTENSIONS
from app.domains.assignment.exceptions import AssignmentNotFoundError
from app.domains.assignment.plagiarism_repository import (
    PlagiarismPairRepository,
    PlagiarismReportRepository,
)
from app.domains.assignment.repository import (
    AssignmentRepository,
    SubmissionFileRepository,
    SubmissionRepository,
)

logger = logging.getLogger(__name__)

# 上傳目錄（與 AssignmentService 保持一致）
UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent.parent / "uploads" / "assignments"

# N-gram 參數
DEFAULT_NGRAM_SIZE = 5
DEFAULT_THRESHOLD = 60.0
MAX_TEXT_LENGTH = 15000
MAX_FRAGMENTS_PER_PAIR = 10


class PlagiarismService:
    """
    抄襲檢測服務

    職責:
    - 啟動檢測（背景任務調用 run_check）
    - N-gram 相似度計算
    - AI 語義分析
    - 報告與配對查詢
    """

    def __init__(
        self,
        report_repo: PlagiarismReportRepository,
        pair_repo: PlagiarismPairRepository,
        assignment_repo: AssignmentRepository,
        submission_repo: SubmissionRepository,
        file_repo: SubmissionFileRepository,
        settings=None,
    ):
        self._report_repo = report_repo
        self._pair_repo = pair_repo
        self._assignment_repo = assignment_repo
        self._submission_repo = submission_repo
        self._file_repo = file_repo
        self._settings = settings
        self._ask_ai_func: Optional[Callable] = None

    def set_ai_function(self, ask_ai: Callable) -> None:
        """注入 AI 函數（與 AssignmentService 共用）"""
        self._ask_ai_func = ask_ai

    # ================================================================
    # 公開 API
    # ================================================================

    def start_check(
        self,
        assignment_id: int,
        teacher_id: int,
        threshold: float = DEFAULT_THRESHOLD,
    ) -> Dict[str, Any]:
        """
        建立檢測報告記錄（狀態=pending）。

        調用者應在背景線程中呼叫 run_check(report_id) 來執行實際檢測。
        """
        assignment = self._assignment_repo.find_by_id(assignment_id)
        if not assignment:
            raise AssignmentNotFoundError(assignment_id)

        report_id = self._report_repo.insert_get_id({
            "assignment_id": assignment_id,
            "status": "pending",
            "threshold": threshold,
            "created_by": teacher_id,
            "created_at": datetime.now(),
        })

        return {
            "report_id": report_id,
            "assignment_id": assignment_id,
            "status": "pending",
            "threshold": threshold,
        }

    def run_check(self, report_id: int) -> None:
        """
        執行抄袭檢測的完整流程（應在背景線程中調用）。

        步驟:
        1. 提取所有提交的文本
        2. 兩兩計算 N-gram 相似度
        3. 對超過閾值的配對進行 AI 分析
        4. 寫入配對結果並更新報告
        """
        report = self._report_repo.find_by_id(report_id)
        if not report:
            logger.error("抄袭檢測報告 #%d 不存在", report_id)
            return

        self._report_repo.update_status(report_id, "running")

        try:
            assignment_id = report["assignment_id"]
            threshold = float(report.get("threshold") or DEFAULT_THRESHOLD)

            # 1) 取得所有提交及其文本內容
            submissions = self._submission_repo.find_by_assignment(assignment_id)
            if len(submissions) < 2:
                self._report_repo.update_status(
                    report_id, "completed", total_pairs=0, flagged_pairs=0,
                )
                return

            sub_texts = self._extract_all_texts(submissions)
            if len(sub_texts) < 2:
                self._report_repo.update_status(
                    report_id, "completed", total_pairs=0, flagged_pairs=0,
                )
                return

            # 2) 兩兩對比
            sub_ids = list(sub_texts.keys())
            all_pairs: List[Dict[str, Any]] = []
            flagged_count = 0

            for id_a, id_b in combinations(sub_ids, 2):
                text_a = sub_texts[id_a]["text"]
                text_b = sub_texts[id_b]["text"]

                # 跳過空內容
                if not text_a.strip() or not text_b.strip():
                    continue

                score, fragments = self._compute_similarity(text_a, text_b)

                is_flagged = score >= threshold

                pair_data: Dict[str, Any] = {
                    "report_id": report_id,
                    "submission_a_id": id_a,
                    "submission_b_id": id_b,
                    "student_a_name": sub_texts[id_a]["name"],
                    "student_b_name": sub_texts[id_b]["name"],
                    "similarity_score": round(score, 2),
                    "matched_fragments": fragments[:MAX_FRAGMENTS_PER_PAIR],
                    "is_flagged": is_flagged,
                }

                # 3) AI 深度分析（僅對可疑配對）
                if is_flagged and self._ask_ai_func:
                    try:
                        ai_result = self._ai_analyze_pair(text_a, text_b, score)
                        pair_data["ai_analysis"] = ai_result
                    except Exception as e:
                        logger.warning("AI 分析配對失敗: %s", e)
                        pair_data["ai_analysis"] = f"AI 分析失敗: {e}"

                if is_flagged:
                    flagged_count += 1
                all_pairs.append(pair_data)

            # 4) 寫入資料庫
            self._pair_repo.batch_insert(all_pairs)
            self._report_repo.update_status(
                report_id, "completed",
                total_pairs=len(all_pairs),
                flagged_pairs=flagged_count,
            )
            logger.info(
                "抄袭檢測完成: 報告 #%d, 共 %d 對, 可疑 %d 對",
                report_id, len(all_pairs), flagged_count,
            )

        except Exception as e:
            logger.error("抄袭檢測報告 #%d 執行失敗: %s", report_id, e)
            self._report_repo.update_status(
                report_id, "failed", error_message=str(e),
            )

    def get_report(self, assignment_id: int) -> Optional[Dict[str, Any]]:
        """取得某作業最新的檢測報告"""
        return self._report_repo.find_latest_by_assignment(assignment_id)

    def get_report_by_id(self, report_id: int) -> Optional[Dict[str, Any]]:
        """取得報告詳情"""
        return self._report_repo.find_by_id(report_id)

    def get_pairs(
        self,
        report_id: int,
        flagged_only: bool = False,
    ) -> List[Dict[str, Any]]:
        """取得配對列表"""
        return self._pair_repo.find_by_report(report_id, flagged_only=flagged_only)

    def get_pair_detail(self, pair_id: int) -> Optional[Dict[str, Any]]:
        """取得單個配對詳情（含文本內容，用於並排對比）"""
        pair = self._pair_repo.find_pair_detail(pair_id)
        if not pair:
            return None

        # 附帶兩份提交的原始文本
        for side, sub_id_key in [("a", "submission_a_id"), ("b", "submission_b_id")]:
            sub = self._submission_repo.find_by_id(pair[sub_id_key])
            if sub:
                files = self._file_repo.find_by_submission(sub["id"])
                text = self._extract_submission_text(sub, files)
                pair[f"text_{side}"] = text
                pair[f"student_{side}_username"] = sub.get("username", "")
            else:
                pair[f"text_{side}"] = ""
                pair[f"student_{side}_username"] = ""

        return pair

    # ================================================================
    # N-gram 相似度核心算法
    # ================================================================

    def _compute_similarity(
        self,
        text_a: str,
        text_b: str,
        n: int = DEFAULT_NGRAM_SIZE,
    ) -> Tuple[float, List[Dict[str, str]]]:
        """
        計算兩段文本的 N-gram Jaccard 相似度。

        算法:
        1. 預處理: 去除空白、統一小寫
        2. 切分 N-gram
        3. 計算 Jaccard 係數 = |A ∩ B| / |A ∪ B|
        4. 提取匹配片段

        Returns:
            (相似度百分比 0-100, 匹配片段列表)
        """
        clean_a = self._normalize_text(text_a)
        clean_b = self._normalize_text(text_b)

        if not clean_a or not clean_b:
            return 0.0, []

        ngrams_a = self._build_ngrams(clean_a, n)
        ngrams_b = self._build_ngrams(clean_b, n)

        if not ngrams_a or not ngrams_b:
            return 0.0, []

        # Jaccard 相似度
        set_a = set(ngrams_a.keys())
        set_b = set(ngrams_b.keys())
        intersection = set_a & set_b
        union = set_a | set_b

        if not union:
            return 0.0, []

        jaccard = len(intersection) / len(union) * 100

        # 提取匹配片段（找出共有的最長連續匹配）
        fragments = self._extract_matching_fragments(clean_a, clean_b)

        return jaccard, fragments

    @staticmethod
    def _normalize_text(text: str) -> str:
        """
        文本預處理: 去除多餘空白、統一小寫。

        保留基本結構以便片段提取，但移除:
        - 連續空白壓縮為單個空格
        - 前後空白
        - 統一為小寫
        """
        if not text:
            return ""
        # 截斷過長文本
        if len(text) > MAX_TEXT_LENGTH:
            text = text[:MAX_TEXT_LENGTH]
        # 壓縮空白
        text = re.sub(r'\s+', ' ', text).strip().lower()
        return text

    @staticmethod
    def _build_ngrams(text: str, n: int) -> Counter:
        """將文本切分為 N-gram 並統計頻次"""
        if len(text) < n:
            return Counter()
        return Counter(text[i:i + n] for i in range(len(text) - n + 1))

    @staticmethod
    def _extract_matching_fragments(
        text_a: str,
        text_b: str,
        min_length: int = 30,
    ) -> List[Dict[str, str]]:
        """
        使用 SequenceMatcher 提取兩段文本的共同片段。

        只保留長度 >= min_length 的片段，避免過多瑣碎匹配。
        """
        from difflib import SequenceMatcher

        matcher = SequenceMatcher(None, text_a, text_b, autojunk=False)
        fragments: List[Dict[str, str]] = []

        for block in matcher.get_matching_blocks():
            if block.size >= min_length:
                matched_text = text_a[block.a: block.a + block.size]
                fragments.append({
                    "text": matched_text[:200],  # 限制單個片段長度
                    "pos_a": block.a,
                    "pos_b": block.b,
                    "length": block.size,
                })

        # 按片段長度倒序
        fragments.sort(key=lambda f: f["length"], reverse=True)
        return fragments

    # ================================================================
    # AI 深度分析
    # ================================================================

    def _ai_analyze_pair(
        self,
        text_a: str,
        text_b: str,
        similarity_score: float,
    ) -> str:
        """
        調用 AI 模型分析兩份提交是否存在抄襲。

        Returns:
            AI 分析報告文本
        """
        if not self._ask_ai_func:
            return "AI 功能未啟用"

        # 截斷過長文本
        max_len = 3000
        excerpt_a = text_a[:max_len] + ("..." if len(text_a) > max_len else "")
        excerpt_b = text_b[:max_len] + ("..." if len(text_b) > max_len else "")

        prompt = f"""你是一位專業的學術誠信分析師。請分析以下兩份學生作業提交是否存在抄襲行為。

## 文本相似度
經自動檢測，兩份提交的文本相似度為 {similarity_score:.1f}%。

## 提交 A 的內容
{excerpt_a}

## 提交 B 的內容
{excerpt_b}

## 分析要求
請從以下幾個維度分析：
1. **內容重疊**: 是否存在大段雷同的文字或代碼？
2. **結構相似**: 整體組織結構是否高度相似？
3. **變量/命名**: 是否僅僅是變量名不同但邏輯完全一致？（代碼類作業）
4. **合理性判斷**: 考慮到作業要求，這種相似度是否合理（例如簡單題目本身答案相似是正常的）？

## 回答格式
請直接用中文給出簡明的分析結論（2-4 句話），包含:
- 你的判斷：「高度疑似抄襲」/「可能抄襲」/「相似但可能巧合」/「正常相似」
- 關鍵依據
"""

        try:
            model = None
            if self._settings and hasattr(self._settings, "llm_local_model"):
                model = self._settings.llm_local_model

            answer, _ = self._ask_ai_func(
                question=prompt,
                subject_code="general",
                use_api=False,
                conversation_history=[],
                model=model,
            )
            return answer.strip() if answer else "AI 未返回結果"
        except Exception as e:
            logger.warning("AI 抄襲分析失敗: %s", e)
            return f"AI 分析失敗: {e}"

    # ================================================================
    # 文本提取（復用 AssignmentService 的邏輯）
    # ================================================================

    def _extract_all_texts(
        self,
        submissions: List[Dict[str, Any]],
    ) -> Dict[int, Dict[str, str]]:
        """
        提取所有提交的文本內容。

        Returns:
            {submission_id: {"text": "...", "name": "學生名"}}
        """
        result: Dict[int, Dict[str, str]] = {}

        for sub in submissions:
            sub_id = sub["id"]
            files = self._file_repo.find_by_submission(sub_id)
            text = self._extract_submission_text(sub, files)

            if text.strip():
                result[sub_id] = {
                    "text": text,
                    "name": sub.get("student_name") or sub.get("username") or str(sub_id),
                }

        return result

    def _extract_submission_text(
        self,
        submission: Dict[str, Any],
        files: List[Dict[str, Any]],
    ) -> str:
        """提取單份提交的所有文本（備註 + 文件內容）"""
        parts: List[str] = []

        # 學生備註
        content = submission.get("content", "")
        if content and content.strip():
            parts.append(content.strip())

        # 文件內容
        for f in files:
            file_text = self._read_file_text(f)
            if file_text:
                parts.append(file_text)

        return "\n\n".join(parts)

    def _read_file_text(self, file_record: Dict[str, Any]) -> str:
        """
        讀取單個文件的文本內容。

        與 AssignmentService._extract_file_contents 邏輯一致，
        支持代碼文件直接讀取和文檔文件通過 FileProcessor 提取。
        """
        file_path = UPLOAD_DIR / file_record.get("stored_name", "")
        original_name = file_record.get("original_name", "")
        ext = Path(original_name).suffix.lower()

        if ext in TEXT_READABLE_EXTENSIONS:
            try:
                if not file_path.exists():
                    return ""
                for encoding in ("utf-8", "gbk", "gb2312", "big5", "utf-16"):
                    try:
                        with open(file_path, "r", encoding=encoding) as fh:
                            text = fh.read()
                        if len(text) > MAX_TEXT_LENGTH:
                            text = text[:MAX_TEXT_LENGTH]
                        return text
                    except (UnicodeDecodeError, UnicodeError):
                        continue
            except Exception as e:
                logger.warning("讀取文件 %s 失敗: %s", original_name, e)

        elif ext in DOCUMENT_EXTENSIONS:
            try:
                from llm.rag.file_processor import FileProcessor
                processor = FileProcessor()
                success, text, _ = processor.process_file(str(file_path), original_name)
                if success and text:
                    if len(text) > MAX_TEXT_LENGTH:
                        text = text[:MAX_TEXT_LENGTH]
                    return text
            except Exception as e:
                logger.warning("處理文檔 %s 失敗: %s", original_name, e)

        return ""
