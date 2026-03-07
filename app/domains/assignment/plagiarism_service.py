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

# 代碼感知檢測參數
SHORT_CODE_THRESHOLD = 500       # 字元數 < 此值視為「短代碼」
MEDIUM_CODE_THRESHOLD = 2000     # 字元數 < 此值視為「中等長度」
SHORT_CODE_FLAG_THRESHOLD = 80.0  # 短代碼需更高閾值才標記可疑
MEDIUM_CODE_FLAG_THRESHOLD = 70.0  # 中等長度代碼閾值

# 多維度評分權重（合計 1.0）
WEIGHT_STRUCTURE = 0.25    # 結構相似度（標準化後的骨架比對）
WEIGHT_IDENTIFIER = 0.30   # 標識符指紋（變量名/函數名完全相同 = 強信號）
WEIGHT_VERBATIM = 0.30     # 逐字複製（最長公共子串比率）
WEIGHT_COMMENT = 0.15      # 注釋/字串相似度（相同的注釋或獨特字串）

# 代碼文件擴展名（用於判斷是否啟用代碼感知分析）
CODE_EXTENSIONS = {
    ".swift", ".py", ".js", ".ts", ".jsx", ".tsx",
    ".java", ".c", ".cpp", ".h", ".rb", ".go", ".rs",
}


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

                # 長度自適應閾值: 短代碼需要更高的分數才標記可疑
                effective_threshold = threshold
                shorter_len = min(len(text_a.strip()), len(text_b.strip()))
                if shorter_len < SHORT_CODE_THRESHOLD:
                    effective_threshold = max(threshold, SHORT_CODE_FLAG_THRESHOLD)
                elif shorter_len < MEDIUM_CODE_THRESHOLD:
                    effective_threshold = max(threshold, MEDIUM_CODE_FLAG_THRESHOLD)

                is_flagged = score >= effective_threshold

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
    # 多維度代碼感知相似度算法
    # ================================================================

    def _compute_similarity(
        self,
        text_a: str,
        text_b: str,
        n: int = DEFAULT_NGRAM_SIZE,
    ) -> Tuple[float, List[Dict[str, Any]]]:
        """
        多維度代碼感知相似度算法。

        解決的核心問題:
        - 短代碼（如簡單 for 迴圈）結構天然相似，不能僅靠 N-gram
        - 學生直接複製卻不改變量名/注釋 = 強抄襲信號
        - 需要區分「正常結構相似」與「複製粘貼證據」

        評分維度:
        1. structure_score — 骨架化後的 N-gram 比對（去掉標識符）
        2. identifier_score — 變量名/函數名指紋匹配
        3. verbatim_score — 最長公共子串比率（逐字複製偵測）
        4. comment_score — 注釋和字串字面量的相似度

        最終分數 = 加權合成，並根據代碼長度自適應調整。

        Returns:
            (綜合相似度百分比 0-100, 匹配詳情列表)
        """
        clean_a = self._normalize_text(text_a)
        clean_b = self._normalize_text(text_b)

        if not clean_a or not clean_b:
            return 0.0, []

        is_code = self._looks_like_code(text_a) or self._looks_like_code(text_b)

        if is_code:
            scores = self._compute_code_similarity(text_a, text_b, clean_a, clean_b, n)
        else:
            scores = self._compute_text_similarity(clean_a, clean_b, n)

        # 加權合成
        final_score = (
            scores["structure_score"] * WEIGHT_STRUCTURE
            + scores["identifier_score"] * WEIGHT_IDENTIFIER
            + scores["verbatim_score"] * WEIGHT_VERBATIM
            + scores["comment_score"] * WEIGHT_COMMENT
        )

        # 提取匹配片段
        fragments = self._extract_matching_fragments(clean_a, clean_b)

        # 將各維度分數附加到片段資訊中（供前端顯示）
        detail: Dict[str, Any] = {
            "text": f"[維度分析] 結構={scores['structure_score']:.0f} "
                    f"標識符={scores['identifier_score']:.0f} "
                    f"逐字={scores['verbatim_score']:.0f} "
                    f"注釋={scores['comment_score']:.0f}",
            "type": "dimension_breakdown",
            "structure_score": round(scores["structure_score"], 1),
            "identifier_score": round(scores["identifier_score"], 1),
            "verbatim_score": round(scores["verbatim_score"], 1),
            "comment_score": round(scores["comment_score"], 1),
            "is_code": is_code,
            "code_length": min(len(clean_a), len(clean_b)),
            "signals": scores.get("signals", []),
        }
        fragments.insert(0, detail)

        return round(final_score, 2), fragments

    def _compute_code_similarity(
        self,
        raw_a: str,
        raw_b: str,
        clean_a: str,
        clean_b: str,
        n: int,
    ) -> Dict[str, Any]:
        """
        代碼感知相似度: 分離結構、標識符、注釋三個維度。
        """
        signals: List[str] = []

        # ---- 1) 結構相似度: 將代碼骨架化（替換標識符為佔位符）再比對 ----
        skeleton_a = self._skeletonize(raw_a)
        skeleton_b = self._skeletonize(raw_b)
        structure_score = self._ngram_jaccard(skeleton_a, skeleton_b, n)

        # ---- 2) 標識符指紋: 提取變量名/函數名，比對集合重疊率 ----
        ids_a = self._extract_identifiers(raw_a)
        ids_b = self._extract_identifiers(raw_b)
        identifier_score = self._set_overlap(ids_a, ids_b)

        # 偵測: 如果連獨特的標識符都完全相同 = 極強信號
        unique_ids_a = ids_a - self._common_keywords()
        unique_ids_b = ids_b - self._common_keywords()
        if unique_ids_a and unique_ids_b:
            unique_overlap = len(unique_ids_a & unique_ids_b) / max(len(unique_ids_a | unique_ids_b), 1) * 100
            if unique_overlap > 80:
                signals.append("自定義變量名高度重疊")
                identifier_score = max(identifier_score, unique_overlap)

        # ---- 3) 逐字複製: 最長公共子串比率 ----
        verbatim_score = self._verbatim_ratio(clean_a, clean_b)

        # ---- 4) 注釋/字串: 提取注釋和字串字面量單獨比對 ----
        comments_a = self._extract_comments_and_strings(raw_a)
        comments_b = self._extract_comments_and_strings(raw_b)
        if comments_a and comments_b:
            comment_score = self._ngram_jaccard(
                " ".join(comments_a), " ".join(comments_b), n
            )
            # 相同的獨特注釋 = 強信號
            if set(comments_a) & set(comments_b):
                shared = set(comments_a) & set(comments_b)
                # 過濾掉太短的通用注釋
                unique_shared = {c for c in shared if len(c.strip()) > 10}
                if unique_shared:
                    signals.append(f"共享 {len(unique_shared)} 段獨特注釋/字串")
                    comment_score = max(comment_score, 85.0)
        else:
            comment_score = structure_score * 0.5  # 無注釋時用結構分折半

        # ---- 長度自適應: 短代碼壓低結構分（因為短代碼天然相似）----
        code_len = min(len(clean_a), len(clean_b))
        if code_len < SHORT_CODE_THRESHOLD:
            structure_score *= 0.6  # 短代碼結構相似不稀奇，大幅降權
            signals.append("短代碼（結構分已降權）")
        elif code_len < MEDIUM_CODE_THRESHOLD:
            structure_score *= 0.8
            signals.append("中等長度代碼（結構分已微調）")

        return {
            "structure_score": min(structure_score, 100),
            "identifier_score": min(identifier_score, 100),
            "verbatim_score": min(verbatim_score, 100),
            "comment_score": min(comment_score, 100),
            "signals": signals,
        }

    def _compute_text_similarity(
        self,
        clean_a: str,
        clean_b: str,
        n: int,
    ) -> Dict[str, Any]:
        """
        非代碼文本（文檔/報告）的相似度: 結構和逐字為主。
        """
        structure_score = self._ngram_jaccard(clean_a, clean_b, n)
        verbatim_score = self._verbatim_ratio(clean_a, clean_b)

        return {
            "structure_score": min(structure_score, 100),
            "identifier_score": structure_score * 0.8,  # 文本無標識符概念，用結構分替代
            "verbatim_score": min(verbatim_score, 100),
            "comment_score": structure_score * 0.5,
            "signals": [],
        }

    # ================================================================
    # 代碼分析工具方法
    # ================================================================

    @staticmethod
    def _looks_like_code(text: str) -> bool:
        """
        啟發式判斷文本是否為程式碼。
        檢查常見的代碼特徵: 大括號、分號結尾、def/function/class 關鍵字等。
        """
        code_patterns = [
            r'\bdef\s+\w+\s*\(',          # Python 函數
            r'\bfunction\s+\w+\s*\(',      # JS 函數
            r'\bclass\s+\w+',              # 類定義
            r'\b(if|for|while)\s*\(',      # 控制結構
            r'[{};]\s*$',                  # 大括號/分號結尾
            r'#include\s*<',               # C/C++ 頭文件
            r'\bimport\s+\w+',             # import 語句
            r'\breturn\s+',                # return 語句
            r'(let|var|const)\s+\w+\s*=',  # JS 變量聲明
            r'\bpublic\s+(static\s+)?',    # Java 修飾符
        ]
        matches = sum(1 for p in code_patterns if re.search(p, text, re.MULTILINE))
        return matches >= 2

    @staticmethod
    def _skeletonize(code: str) -> str:
        """
        將代碼骨架化: 保留結構關鍵字和符號，替換自定義標識符為佔位符。

        例如:
            def calculate_sum(numbers):  →  def _V(_V):
                total = 0                →      _V = 0
                for n in numbers:        →      for _V in _V:
                    total += n           →          _V += _V
        """
        text = code.lower()
        # 移除注釋
        text = re.sub(r'#[^\n]*', '', text)           # Python 單行注釋
        text = re.sub(r'//[^\n]*', '', text)           # C/JS 單行注釋
        text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)  # 多行注釋
        # 移除字串字面量
        text = re.sub(r'"[^"]*"', '"_S"', text)
        text = re.sub(r"'[^']*'", "'_S'", text)

        # 保留的關鍵字（不替換）
        keywords = {
            'def', 'class', 'if', 'else', 'elif', 'for', 'while', 'return',
            'import', 'from', 'try', 'except', 'finally', 'with', 'as',
            'and', 'or', 'not', 'in', 'is', 'true', 'false', 'none',
            'function', 'var', 'let', 'const', 'new', 'this', 'self',
            'public', 'private', 'static', 'void', 'int', 'float', 'string',
            'bool', 'double', 'char', 'null', 'break', 'continue',
            'switch', 'case', 'default', 'do', 'throw', 'catch',
            'struct', 'enum', 'interface', 'extends', 'implements',
            'print', 'println', 'printf', 'cout', 'cin', 'scanf',
            'range', 'len', 'append', 'map', 'filter',
        }

        # 替換標識符
        def replace_identifier(match):
            word = match.group(0)
            return word if word in keywords else "_V"

        text = re.sub(r'\b[a-z_]\w*\b', replace_identifier, text)
        # 壓縮連續佔位符和空白
        text = re.sub(r'(_V\s*)+', '_V ', text)
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    @staticmethod
    def _extract_identifiers(code: str) -> Set[str]:
        """
        提取代碼中的自定義標識符（變量名、函數名、類名）。
        """
        # 提取所有 word-like token
        tokens = set(re.findall(r'\b[a-zA-Z_]\w*\b', code))
        # 過濾掉太短的（< 2 字元）和純數字組合
        return {t for t in tokens if len(t) >= 2}

    @staticmethod
    def _common_keywords() -> Set[str]:
        """
        返回各語言的通用關鍵字集合（不應視為抄襲信號）。
        """
        return {
            # Python
            'def', 'class', 'import', 'from', 'return', 'if', 'else', 'elif',
            'for', 'while', 'in', 'is', 'not', 'and', 'or', 'try', 'except',
            'finally', 'with', 'as', 'pass', 'break', 'continue', 'yield',
            'lambda', 'global', 'nonlocal', 'assert', 'del', 'raise',
            'True', 'False', 'None', 'self', 'print', 'range', 'len',
            'int', 'str', 'float', 'list', 'dict', 'set', 'tuple',
            'input', 'open', 'file', 'type', 'super', 'object',
            # JavaScript / TypeScript
            'function', 'var', 'let', 'const', 'new', 'this', 'typeof',
            'instanceof', 'undefined', 'null', 'true', 'false',
            'async', 'await', 'export', 'default', 'require', 'module',
            'console', 'log', 'error', 'warn', 'document', 'window',
            # Java / C / C++
            'public', 'private', 'protected', 'static', 'void', 'main',
            'String', 'System', 'out', 'println', 'printf', 'scanf',
            'include', 'stdio', 'stdlib', 'iostream', 'using', 'namespace',
            'std', 'cout', 'cin', 'endl', 'vector', 'string',
            # Swift
            'func', 'struct', 'enum', 'protocol', 'extension', 'guard',
            'override', 'mutating', 'throws', 'throw',
            # 通用短詞
            'get', 'set', 'add', 'put', 'map', 'key', 'val', 'err',
            'ok', 'fn', 'args', 'argv', 'argc', 'tmp', 'temp', 'res',
            'req', 'arr', 'obj', 'num', 'sum', 'max', 'min', 'data',
        }

    @staticmethod
    def _extract_comments_and_strings(code: str) -> List[str]:
        """
        提取代碼中的注釋和字串字面量。
        這些是學生最容易忘記修改的部分。
        """
        results: List[str] = []

        # Python/Shell 單行注釋
        results.extend(re.findall(r'#\s*(.+)$', code, re.MULTILINE))
        # C/JS 單行注釋
        results.extend(re.findall(r'//\s*(.+)$', code, re.MULTILINE))
        # 多行注釋
        results.extend(re.findall(r'/\*(.+?)\*/', code, re.DOTALL))
        # Python docstring
        results.extend(re.findall(r'"""(.+?)"""', code, re.DOTALL))
        results.extend(re.findall(r"'''(.+?)'''", code, re.DOTALL))
        # 字串字面量（> 5 字元才有意義）
        strings = re.findall(r'"([^"]{5,})"', code)
        strings.extend(re.findall(r"'([^']{5,})'", code))
        results.extend(strings)

        # 過濾太短的
        return [r.strip() for r in results if len(r.strip()) > 3]

    # ================================================================
    # 相似度計算工具方法
    # ================================================================

    def _ngram_jaccard(self, text_a: str, text_b: str, n: int = DEFAULT_NGRAM_SIZE) -> float:
        """計算兩段文本的 N-gram Jaccard 相似度（百分比）。"""
        clean_a = self._normalize_text(text_a)
        clean_b = self._normalize_text(text_b)

        if not clean_a or not clean_b:
            return 0.0

        ngrams_a = self._build_ngrams(clean_a, n)
        ngrams_b = self._build_ngrams(clean_b, n)

        if not ngrams_a or not ngrams_b:
            return 0.0

        set_a = set(ngrams_a.keys())
        set_b = set(ngrams_b.keys())
        intersection = set_a & set_b
        union = set_a | set_b

        if not union:
            return 0.0

        return len(intersection) / len(union) * 100

    @staticmethod
    def _set_overlap(set_a: Set[str], set_b: Set[str]) -> float:
        """計算兩個集合的重疊率（百分比）。"""
        if not set_a or not set_b:
            return 0.0
        intersection = set_a & set_b
        union = set_a | set_b
        return len(intersection) / len(union) * 100

    @staticmethod
    def _verbatim_ratio(text_a: str, text_b: str) -> float:
        """
        計算逐字複製比率: 所有公共子串長度之和 / 較短文本長度。
        偵測直接複製粘貼的行為。
        """
        from difflib import SequenceMatcher

        if not text_a or not text_b:
            return 0.0

        shorter_len = min(len(text_a), len(text_b))
        if shorter_len == 0:
            return 0.0

        matcher = SequenceMatcher(None, text_a, text_b, autojunk=False)
        # 計算所有匹配塊的總長度
        total_match = sum(block.size for block in matcher.get_matching_blocks())
        return min(total_match / shorter_len * 100, 100)

    @staticmethod
    def _normalize_text(text: str) -> str:
        """
        文本預處理: 去除多餘空白、統一小寫。
        """
        if not text:
            return ""
        if len(text) > MAX_TEXT_LENGTH:
            text = text[:MAX_TEXT_LENGTH]
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
    ) -> List[Dict[str, Any]]:
        """
        使用 SequenceMatcher 提取兩段文本的共同片段。
        只保留長度 >= min_length 的片段，避免過多瑣碎匹配。
        """
        from difflib import SequenceMatcher

        matcher = SequenceMatcher(None, text_a, text_b, autojunk=False)
        fragments: List[Dict[str, Any]] = []

        for block in matcher.get_matching_blocks():
            if block.size >= min_length:
                matched_text = text_a[block.a: block.a + block.size]
                fragments.append({
                    "text": matched_text[:200],
                    "type": "verbatim_match",
                    "pos_a": block.a,
                    "pos_b": block.b,
                    "length": block.size,
                })

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

## 自動檢測結果
綜合相似度: {similarity_score:.1f}%（基於結構、標識符、逐字複製、注釋四個維度的加權得分）

## 提交 A 的內容
{excerpt_a}

## 提交 B 的內容
{excerpt_b}

## 分析要求
請重點關注以下抄襲信號（按重要性排列）:
1. **變量名/函數名**: 自定義命名是否完全相同？（最強信號——獨立開發幾乎不可能取相同的自定義名稱）
2. **注釋/字串**: 是否保留了相同的注釋文字甚至拼寫錯誤？
3. **逐字複製**: 是否存在大段完全相同的代碼或文字？
4. **結構相似**: 整體邏輯和組織結構是否一致？（注意: 簡單題目本身結構相似是正常的）

## 回答格式
請直接用中文給出簡明的分析結論（2-4 句話），包含:
- 你的判斷：「高度疑似抄襲」/「可能抄襲」/「相似但可能巧合」/「正常相似」
- 關鍵依據（具體指出哪些變量名/注釋/代碼段雷同）
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
