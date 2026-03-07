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
from collections import Counter, defaultdict
from datetime import datetime
from itertools import combinations
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

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
MAX_AI_ANALYSIS_PAIRS = 20  # AI 分析上限，避免大班級耗時過長


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

            # 2) 兩兩對比 — 先全部算 N-gram（快速），再對 top 可疑配對做 AI 分析
            sub_ids = list(sub_texts.keys())
            all_pairs: List[Dict[str, Any]] = []
            flagged_indices: List[int] = []

            for id_a, id_b in combinations(sub_ids, 2):
                text_a = sub_texts[id_a]["text"]
                text_b = sub_texts[id_b]["text"]

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
                if is_flagged:
                    flagged_indices.append(len(all_pairs))
                all_pairs.append(pair_data)

            flagged_count = len(flagged_indices)

            # 3) AI 深度分析 — 僅對 top N 可疑配對（按相似度倒序）
            if self._ask_ai_func and flagged_indices:
                # 按相似度倒序排列可疑配對索引
                flagged_indices.sort(
                    key=lambda i: all_pairs[i]["similarity_score"], reverse=True
                )
                ai_count = 0
                for idx in flagged_indices[:MAX_AI_ANALYSIS_PAIRS]:
                    pair = all_pairs[idx]
                    id_a = pair["submission_a_id"]
                    id_b = pair["submission_b_id"]
                    try:
                        ai_result = self._ai_analyze_pair(
                            sub_texts[id_a]["text"],
                            sub_texts[id_b]["text"],
                            pair["similarity_score"],
                        )
                        pair["ai_analysis"] = ai_result
                        ai_count += 1
                    except Exception as e:
                        logger.warning("AI 分析配對失敗: %s", e)
                        pair["ai_analysis"] = f"AI 分析失敗: {e}"

                if len(flagged_indices) > MAX_AI_ANALYSIS_PAIRS:
                    logger.info(
                        "可疑配對 %d 對，AI 僅分析前 %d 對",
                        len(flagged_indices), MAX_AI_ANALYSIS_PAIRS,
                    )

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

    def get_clusters(self, report_id: int) -> Dict[str, Any]:
        """
        對檢測報告做圖聚類分析，識別抄襲群組和「源頭」學生。

        算法（純 Python，無需 networkx）:
        1. 將可疑配對構建為無向圖（鄰接表）
        2. BFS 找出所有連通分量（= 抄襲群組）
        3. 計算每個節點的度數 + 加權度數
        4. 高度數節點 = 疑似「源頭」（一人抄給多人）

        Returns:
            {
                "clusters": [
                    {
                        "id": 1,
                        "members": [{"name": "...", "sub_id": ..., "degree": ..., "role": "source|member"}],
                        "edges": [{"a": ..., "b": ..., "score": ...}],
                        "max_score": 95.2,
                        "source_student": "張三"
                    },
                    ...
                ],
                "hub_students": [
                    {"name": "...", "sub_id": ..., "degree": 5, "avg_score": 82.3}
                ]
            }
        """
        flagged_pairs = self._pair_repo.find_by_report(report_id, flagged_only=True)
        if not flagged_pairs:
            return {"clusters": [], "hub_students": []}

        # ---- 1) 構建鄰接表 ----
        adjacency: Dict[int, List[Tuple[int, float]]] = defaultdict(list)
        sub_names: Dict[int, str] = {}

        for p in flagged_pairs:
            a_id = p["submission_a_id"]
            b_id = p["submission_b_id"]
            score = float(p.get("similarity_score", 0))
            adjacency[a_id].append((b_id, score))
            adjacency[b_id].append((a_id, score))
            sub_names[a_id] = p.get("student_a_name", str(a_id))
            sub_names[b_id] = p.get("student_b_name", str(b_id))

        # ---- 2) BFS 找連通分量 ----
        visited: Set[int] = set()
        clusters: List[Dict[str, Any]] = []

        for start_node in adjacency:
            if start_node in visited:
                continue
            # BFS
            component: List[int] = []
            queue = [start_node]
            while queue:
                node = queue.pop(0)
                if node in visited:
                    continue
                visited.add(node)
                component.append(node)
                for neighbor, _ in adjacency[node]:
                    if neighbor not in visited:
                        queue.append(neighbor)

            if len(component) < 2:
                continue

            # ---- 3) 計算度數 ----
            degree: Dict[int, int] = defaultdict(int)
            weighted_degree: Dict[int, float] = defaultdict(float)
            edges: List[Dict[str, Any]] = []

            component_set = set(component)
            max_score = 0.0

            for p in flagged_pairs:
                a_id = p["submission_a_id"]
                b_id = p["submission_b_id"]
                if a_id in component_set and b_id in component_set:
                    score = float(p.get("similarity_score", 0))
                    degree[a_id] += 1
                    degree[b_id] += 1
                    weighted_degree[a_id] += score
                    weighted_degree[b_id] += score
                    edges.append({
                        "a_id": a_id, "b_id": b_id,
                        "a_name": sub_names.get(a_id, ""),
                        "b_name": sub_names.get(b_id, ""),
                        "score": score,
                    })
                    max_score = max(max_score, score)

            # ---- 4) 識別源頭: 度數最高的學生 ----
            source_id = max(component, key=lambda n: (degree[n], weighted_degree[n]))

            members = []
            for sid in sorted(component, key=lambda n: degree[n], reverse=True):
                is_source = (sid == source_id and degree[sid] >= 2)
                members.append({
                    "name": sub_names.get(sid, str(sid)),
                    "sub_id": sid,
                    "degree": degree[sid],
                    "avg_score": round(
                        weighted_degree[sid] / degree[sid], 1
                    ) if degree[sid] > 0 else 0,
                    "role": "source" if is_source else "member",
                })

            clusters.append({
                "id": len(clusters) + 1,
                "size": len(component),
                "members": members,
                "edges": edges,
                "max_score": round(max_score, 1),
                "source_student": sub_names.get(source_id, "")
                    if degree[source_id] >= 2 else None,
            })

        # 按群組大小倒序
        clusters.sort(key=lambda c: c["size"], reverse=True)

        # ---- Hub 學生（全局度數 >= 3 的節點）----
        global_degree: Dict[int, int] = defaultdict(int)
        global_score_sum: Dict[int, float] = defaultdict(float)
        for p in flagged_pairs:
            a_id = p["submission_a_id"]
            b_id = p["submission_b_id"]
            score = float(p.get("similarity_score", 0))
            global_degree[a_id] += 1
            global_degree[b_id] += 1
            global_score_sum[a_id] += score
            global_score_sum[b_id] += score

        hub_students = []
        for sid, deg in sorted(global_degree.items(), key=lambda x: x[1], reverse=True):
            if deg >= 3:
                hub_students.append({
                    "name": sub_names.get(sid, str(sid)),
                    "sub_id": sid,
                    "degree": deg,
                    "avg_score": round(global_score_sum[sid] / deg, 1),
                })

        return {"clusters": clusters, "hub_students": hub_students}

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
