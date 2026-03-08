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

import logging
import re
from collections import defaultdict
from datetime import datetime
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

# ---- 從拆分模組導入 ----
from app.domains.assignment.plagiarism_constants import (
    DEFAULT_NGRAM_SIZE,
    DEFAULT_THRESHOLD,
    DETECTION_PRESETS,
    ENGLISH_ALGO_VERSION,
    EVIDENCE_HIT_THRESHOLD,
    MAX_AI_ANALYSIS_PAIRS,
    MAX_FRAGMENTS_PER_PAIR,
    MAX_TEXT_LENGTH,
    MEDIUM_CODE_FLAG_THRESHOLD,
    MEDIUM_CODE_THRESHOLD,
    SHORT_CODE_FLAG_THRESHOLD,
    SHORT_CODE_THRESHOLD,
    SUBJECT_PRESETS,
    TINY_CODE_FLAG_THRESHOLD,
    TINY_CODE_THRESHOLD,
    UPLOAD_DIR,
    WEIGHT_COMMENT,
    WEIGHT_EVIDENCE,
    WEIGHT_IDENTIFIER,
    WEIGHT_INDENT,
    WEIGHT_STRUCTURE,
    WEIGHT_VERBATIM,
    MIN_EVIDENCE_DIMENSIONS,
    _ENGLISH_EMBEDDING_MODEL_NAME,
)
from app.domains.assignment.plagiarism_text_utils import (
    extract_matching_fragments,
    normalize_text,
)
from app.domains.assignment.plagiarism_code_analyzer import (
    compute_code_similarity,
    compute_text_similarity,
    looks_like_code,
)
from app.domains.assignment.plagiarism_chinese_essay import (
    compute_chinese_essay_similarity,
)
from app.domains.assignment.plagiarism_english_essay import (
    compute_english_essay_similarity,
    detect_text_language,
    determine_english_final_status,
)
from app.domains.assignment.plagiarism_llm import (
    ai_analyze_pair,
)
from app.domains.assignment.plagiarism_graph import (
    direct_edges,
    identify_source,
)

logger = logging.getLogger(__name__)

# ---- Analyzer Dispatch Map ----
_ANALYZER_DISPATCH: Dict[str, Callable] = {
    "chinese_essay": compute_chinese_essay_similarity,
    "english_essay": compute_english_essay_similarity,
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
        subject: str = "",
        detect_mode: str = "mixed",
    ) -> Dict[str, Any]:
        """
        建立檢測報告記錄（狀態=pending）。

        Args:
            subject: 科目 code（如 "ict"），僅作記錄
            detect_mode: 作業類型 "code" | "text" | "mixed"

        調用者應在背景線程中呼叫 run_check(report_id) 來執行實際檢測。
        """
        assignment = self._assignment_repo.find_by_id(assignment_id)
        if not assignment:
            raise AssignmentNotFoundError(assignment_id)

        if detect_mode not in DETECTION_PRESETS:
            detect_mode = "mixed"

        report_id = self._report_repo.insert_get_id({
            "assignment_id": assignment_id,
            "status": "pending",
            "threshold": threshold,
            "subject": subject,
            "detect_mode": detect_mode,
            "created_by": teacher_id,
            "created_at": datetime.now(),
        })

        return {
            "report_id": report_id,
            "assignment_id": assignment_id,
            "status": "pending",
            "threshold": threshold,
            "subject": subject,
            "detect_mode": detect_mode,
        }

    def run_check(
        self,
        report_id: int,
        progress_callback: Optional[Callable] = None,
    ) -> None:
        """
        執行抄袭檢測的完整流程（應在背景線程中調用）。

        Args:
            report_id: 報告 ID
            progress_callback: 進度回調函數 fn(phase, done, total, detail)
                phase: "extract" | "compare" | "ai" | "save"
                done: 已完成數量
                total: 總數量
                detail: 額外說明文字
        """

        def _progress(phase: str, done: int, total: int, detail: str = ""):
            if progress_callback:
                try:
                    progress_callback(phase, done, total, detail)
                except Exception:
                    pass  # 回調失敗不應中斷檢測

        report = self._report_repo.find_by_id(report_id)
        if not report:
            logger.error("抄袭檢測報告 #%d 不存在", report_id)
            return

        self._report_repo.update_status(report_id, "running")

        try:
            assignment_id = report["assignment_id"]
            threshold = float(report.get("threshold") or DEFAULT_THRESHOLD)
            detect_mode = report.get("detect_mode") or "mixed"
            preset = DETECTION_PRESETS.get(detect_mode, DETECTION_PRESETS["mixed"])
            # mixed → weights=None，讓 _compute_similarity 逐對自動偵測
            subject_weights = preset["weights"]

            # 1) 提取所有提交的文本
            _progress("extract", 0, 1, "正在讀取學生提交內容...")
            submissions = self._submission_repo.find_by_assignment(assignment_id)
            if len(submissions) < 2:
                self._report_repo.update_status(
                    report_id, "completed", total_pairs=0, flagged_pairs=0,
                )
                _progress("extract", 1, 1, "提交不足 2 份，無需比對")
                return

            sub_texts = self._extract_all_texts(submissions)
            if len(sub_texts) < 2:
                self._report_repo.update_status(
                    report_id, "completed", total_pairs=0, flagged_pairs=0,
                )
                _progress("extract", 1, 1, "有效提交不足 2 份")
                return

            _progress("extract", 1, 1, f"已讀取 {len(sub_texts)} 份提交")

            # Collect batch texts for all modes (used by English essay rare-phrase
            # suppression AND code-mode cohort suppression).
            # Code-mode filtering to code-like samples happens inside code_analyzer.
            batch_texts: Optional[List[str]] = None
            if len(sub_texts) >= 3:
                batch_texts = [
                    st["text"] for st in sub_texts.values() if st["text"].strip()
                ]

            # English essay: language mismatch warning
            language_warning: Optional[str] = None
            if detect_mode == "english_essay":
                # Sample-based language mismatch warning (first 2 submissions)
                sample_ids = list(sub_texts.keys())[:2]
                sample_langs = []
                for sid in sample_ids:
                    sample_text = sub_texts[sid]["text"]
                    if sample_text.strip():
                        sample_langs.append(detect_text_language(sample_text))
                if sample_langs:
                    if all(lang == "zh" for lang in sample_langs):
                        language_warning = (
                            "文本語言與檢測模式不一致（基於抽樣檢測）："
                            "提交內容疑似中文，但使用了 English Essay 模式，結果可能失真"
                        )
                    elif any(lang == "zh" for lang in sample_langs) and any(
                        lang == "en" for lang in sample_langs
                    ):
                        language_warning = (
                            "部分提交語言混合，檢測結果僅供參考"
                        )
                if language_warning:
                    logger.warning(
                        "英文作文模式語言警告 (report #%d): %s",
                        report_id, language_warning,
                    )

            # 2) 兩兩對比
            from itertools import combinations
            sub_ids = list(sub_texts.keys())
            all_pairs: List[Dict[str, Any]] = []
            flagged_indices: List[int] = []
            total_combinations = len(sub_ids) * (len(sub_ids) - 1) // 2
            compared = 0

            for id_a, id_b in combinations(sub_ids, 2):
                text_a = sub_texts[id_a]["text"]
                text_b = sub_texts[id_b]["text"]
                compared += 1

                if not text_a.strip() or not text_b.strip():
                    continue

                score, fragments = self._compute_similarity(
                    text_a, text_b, weights=subject_weights,
                    detect_mode=detect_mode, batch_texts=batch_texts,
                )

                # 長度自適應閾值（僅代碼/混合模式，文本模式跳過）
                effective_threshold = threshold
                if detect_mode not in ("text", "chinese_essay", "english_essay"):
                    shorter_len = min(len(text_a.strip()), len(text_b.strip()))
                    if shorter_len < TINY_CODE_THRESHOLD:
                        effective_threshold = max(threshold, TINY_CODE_FLAG_THRESHOLD)
                    elif shorter_len < SHORT_CODE_THRESHOLD:
                        effective_threshold = max(threshold, SHORT_CODE_FLAG_THRESHOLD)
                    elif shorter_len < MEDIUM_CODE_THRESHOLD:
                        effective_threshold = max(threshold, MEDIUM_CODE_FLAG_THRESHOLD)

                is_flagged = int(score >= effective_threshold)

                # Inject batch-level language warning into fragment detail
                if language_warning and fragments:
                    for frag in fragments:
                        if isinstance(frag, dict) and frag.get("type") == "dimension_breakdown":
                            existing_warnings = frag.get("_warnings") or []
                            if language_warning not in existing_warnings:
                                existing_warnings.append(language_warning)
                            frag["_warnings"] = existing_warnings
                            break

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

                # 每 5 對更新一次進度（避免過於頻繁）
                if compared % 5 == 0 or compared == total_combinations:
                    _progress(
                        "compare", compared, total_combinations,
                        f"已比對 {compared}/{total_combinations} 對"
                        f"（發現 {len(flagged_indices)} 對可疑）",
                    )

            flagged_count = len(flagged_indices)

            # 3) AI 深度分析
            # For English essay: multi-condition LLM entry (not just threshold)
            ai_candidate_indices = list(flagged_indices)
            if detect_mode == "english_essay":
                for pair_idx, pair in enumerate(all_pairs):
                    if pair_idx in flagged_indices:
                        continue
                    # Check multi-condition LLM entry
                    frags = pair.get("matched_fragments", [])
                    if not frags:
                        continue
                    det = frags[0] if isinstance(frags[0], dict) and frags[0].get("type") == "dimension_breakdown" else None
                    if not det:
                        continue
                    enter_llm = (
                        pair.get("similarity_score", 0) >= 40
                        or det.get("comment_score", 0) >= 70
                        or det.get("_opening_sim", 0) >= 75
                        or det.get("_ending_sim", 0) >= 75
                        or det.get("_rare_phrase_score", 0) >= 60
                    )
                    if enter_llm:
                        ai_candidate_indices.append(pair_idx)

            if self._ask_ai_func and ai_candidate_indices:
                ai_candidate_indices.sort(
                    key=lambda i: all_pairs[i]["similarity_score"], reverse=True
                )
                ai_targets = ai_candidate_indices[:MAX_AI_ANALYSIS_PAIRS]
                ai_total = len(ai_targets)
                ai_count = 0
                ai_cache: Dict[tuple, str] = {}  # 內容去重緩存
                for idx in ai_targets:
                    pair = all_pairs[idx]
                    id_a = pair["submission_a_id"]
                    id_b = pair["submission_b_id"]
                    ai_count += 1
                    _progress(
                        "ai", ai_count, ai_total,
                        f"AI 分析第 {ai_count}/{ai_total} 對"
                        f"（{pair['student_a_name']} vs {pair['student_b_name']}）",
                    )
                    try:
                        text_a = sub_texts[id_a]["text"]
                        text_b = sub_texts[id_b]["text"]
                        # 內容去重：相同文本對直接復用結果
                        # Cache key includes detect_mode + algo version for correctness
                        cache_key_parts = sorted([hash(text_a), hash(text_b)])
                        if detect_mode == "english_essay":
                            cache_key = (
                                *cache_key_parts, detect_mode,
                                ENGLISH_ALGO_VERSION, _ENGLISH_EMBEDDING_MODEL_NAME,
                            )
                        else:
                            cache_key = tuple(cache_key_parts)
                        if cache_key in ai_cache:
                            pair["ai_analysis"] = ai_cache[cache_key]
                            continue
                        ai_result = ai_analyze_pair(
                            text_a, text_b,
                            pair["similarity_score"],
                            ask_ai_func=self._ask_ai_func,
                            settings=self._settings,
                            detect_mode=detect_mode,
                            fragments=pair.get("matched_fragments"),
                        )
                        ai_cache[cache_key] = ai_result
                        pair["ai_analysis"] = ai_result
                    except Exception as e:
                        logger.warning("AI 分析配對失敗: %s", e)
                        pair["ai_analysis"] = f"AI 分析失敗: {e}"

                if len(ai_candidate_indices) > MAX_AI_ANALYSIS_PAIRS:
                    logger.info(
                        "可疑配對 %d 對，AI 僅分析前 %d 對",
                        len(ai_candidate_indices), MAX_AI_ANALYSIS_PAIRS,
                    )

            # 3.5) English essay: determine final_status for each pair
            if detect_mode == "english_essay":
                for pair in all_pairs:
                    pair["final_status"] = determine_english_final_status(
                        pair, threshold,
                    )

            # 4) 寫入資料庫
            _progress("save", 0, 1, "正在儲存結果...")
            self._pair_repo.batch_insert(all_pairs)
            self._report_repo.update_status(
                report_id, "completed",
                total_pairs=len(all_pairs),
                flagged_pairs=flagged_count,
            )
            _progress("save", 1, 1, "完成")
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

    def ai_analyze_single_pair(self, pair_id: int) -> str:
        """
        按需對單個配對進行 AI 分析（教師手動觸發）。

        Returns:
            AI 分析結果文本
        """
        pair = self._pair_repo.find_pair_detail(pair_id)
        if not pair:
            return "配對不存在"

        if not self._ask_ai_func:
            return "AI 功能未啟用"

        # 取得兩份提交的原始文本
        texts = {}
        for side, sub_id_key in [("a", "submission_a_id"), ("b", "submission_b_id")]:
            sub = self._submission_repo.find_by_id(pair[sub_id_key])
            if sub:
                files = self._file_repo.find_by_submission(sub["id"])
                texts[side] = self._extract_submission_text(sub, files)
            else:
                texts[side] = ""

        if not texts["a"].strip() or not texts["b"].strip():
            return "提交內容為空，無法分析"

        # 嘗試從報告取得作業類型
        report = self._report_repo.find_by_id(pair.get("report_id")) if pair.get("report_id") else None
        pair_mode = (report.get("detect_mode") if report else None) or "mixed"

        result = ai_analyze_pair(
            texts["a"], texts["b"],
            float(pair.get("similarity_score", 0)),
            ask_ai_func=self._ask_ai_func,
            settings=self._settings,
            detect_mode=pair_mode,
        )

        # 將結果寫回資料庫
        import json
        self._pair_repo.update(
            {"ai_analysis": result},
            where="id = %s",
            params=(pair_id,),
        )

        return result

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

        # ---- 0) 取得提交元數據（提交時間、代碼長度）----
        all_sub_ids: Set[int] = set()
        for p in flagged_pairs:
            all_sub_ids.add(p["submission_a_id"])
            all_sub_ids.add(p["submission_b_id"])

        sub_meta: Dict[int, Dict[str, Any]] = {}  # {sub_id: {submitted_at, text_len}}
        for sid in all_sub_ids:
            sub = self._submission_repo.find_by_id(sid)
            if sub:
                files = self._file_repo.find_by_submission(sid)
                text = self._extract_submission_text(sub, files)
                sub_meta[sid] = {
                    "submitted_at": sub.get("submitted_at"),
                    "text_len": len(text.strip()) if text else 0,
                }
            else:
                sub_meta[sid] = {"submitted_at": None, "text_len": 0}

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

            # ---- 3) 計算度數 + 提取維度證據 ----
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

            # ---- 4) 智慧源頭識別: 多信號綜合評分 ----
            source_id = identify_source(
                component, degree, weighted_degree, sub_meta, edges,
            )

            # 為每條邊標記方向 (from → to)
            directed_edges = direct_edges(
                edges, source_id, degree, sub_meta,
            )

            members = []
            for sid in sorted(component, key=lambda n: degree[n], reverse=True):
                is_source = (sid == source_id and degree[sid] >= 2)
                meta = sub_meta.get(sid, {})
                member_info: Dict[str, Any] = {
                    "name": sub_names.get(sid, str(sid)),
                    "sub_id": sid,
                    "degree": degree[sid],
                    "avg_score": round(
                        weighted_degree[sid] / degree[sid], 1
                    ) if degree[sid] > 0 else 0,
                    "role": "source" if is_source else "member",
                    "text_len": meta.get("text_len", 0),
                }
                # 提交時間（ISO 字串給前端）
                ts = meta.get("submitted_at")
                if ts:
                    member_info["submitted_at"] = ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
                members.append(member_info)

            clusters.append({
                "id": len(clusters) + 1,
                "size": len(component),
                "members": members,
                "edges": directed_edges,
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
    # 多維度相似度算法 — 編排器
    # ================================================================

    def _compute_similarity(
        self,
        text_a: str,
        text_b: str,
        n: int = DEFAULT_NGRAM_SIZE,
        weights: Optional[Dict[str, float]] = None,
        detect_mode: Optional[str] = None,
        **kwargs,
    ) -> Tuple[float, List[Dict[str, Any]]]:
        """
        多維度相似度算法 — 雙分數體系。

        輸出兩個分數:
        1. 邏輯相似度: Token 結構、數據流是否一致（簡單作業天然高）
        2. 風格一致性: 命名、縮排、拼錯、死代碼等「非邏輯」習慣

        只有兩個分數同時高才判定為抄襲（解決簡單作業誤報問題）。

        Returns:
            (綜合相似度百分比 0-100, 匹配詳情列表)
        """
        clean_a = normalize_text(text_a)
        clean_b = normalize_text(text_b)

        if not clean_a or not clean_b:
            return 0.0, []

        # 根據 detect_mode 選擇計算方法（dispatch map）
        analyzer_fn = _ANALYZER_DISPATCH.get(detect_mode)
        if analyzer_fn:
            is_code = False
            if detect_mode == "english_essay":
                scores = analyzer_fn(
                    clean_a, clean_b, text_a, text_b, n,
                    batch_texts=kwargs.get("batch_texts"),
                )
            else:
                scores = analyzer_fn(
                    clean_a, clean_b, text_a, text_b, n,
                    batch_texts=kwargs.get("batch_texts"),
                )
        else:
            is_code = looks_like_code(text_a) or looks_like_code(text_b)
            if is_code:
                scores = compute_code_similarity(
                    text_a, text_b, clean_a, clean_b, n,
                    batch_texts=kwargs.get("batch_texts"),
                )
            else:
                scores = compute_text_similarity(clean_a, clean_b, n)

        # 多重證據加成: 統計有多少個維度超過閾值
        dimension_scores = [
            scores["structure_score"],
            scores["identifier_score"],
            scores["verbatim_score"],
            scores.get("indent_score", 0),
            scores["comment_score"],
            scores.get("winnow_score", 0),
            scores.get("data_flow_score", 0),
            scores.get("typo_score", 0),
            scores.get("dead_code_score", 0),
        ]
        total_dims = len(dimension_scores)

        if detect_mode == "chinese_essay":
            # 中文作文使用 sigmoid soft evidence（已在 analyzer 中計算）
            evidence_score = scores.get("_soft_evidence_score", 0.0)
            evidence_hits = scores.get("_soft_evidence_hits", 0)
            total_dims = scores.get("_soft_evidence_total_dims", 7)
            if scores.get("_soft_evidence_signal"):
                scores["signals"].append(scores["_soft_evidence_signal"])
        else:
            # 其他模式保留硬閾值邏輯
            evidence_hits = sum(1 for s in dimension_scores if s >= EVIDENCE_HIT_THRESHOLD)
            if detect_mode == "english_essay":
                if scores.get("_opening_sim", 0) >= EVIDENCE_HIT_THRESHOLD:
                    evidence_hits += 1
                    total_dims += 1
                if scores.get("_ending_sim", 0) >= EVIDENCE_HIT_THRESHOLD:
                    evidence_hits += 1
                    total_dims += 1
            if evidence_hits >= MIN_EVIDENCE_DIMENSIONS:
                evidence_score = min(evidence_hits / total_dims * 100, 100)
                scores["signals"].append(
                    f"多重證據: {evidence_hits}/{total_dims} 個維度同時命中（>{EVIDENCE_HIT_THRESHOLD:.0f}分）"
                )
            else:
                evidence_score = 0.0
                if any(s >= EVIDENCE_HIT_THRESHOLD for s in dimension_scores):
                    scores["signals"].append(
                        f"僅 {evidence_hits} 個維度命中，證據不足（需≥{MIN_EVIDENCE_DIMENSIONS}個）"
                    )

        # ---- 雙分數計算 ----
        if is_code:
            # 邏輯相似度 = 結構 + 數據流（簡單作業天然高，需結合風格看）
            logic_score = (
                scores["structure_score"] * 0.6
                + scores.get("data_flow_score", 0) * 0.2
                + scores["verbatim_score"] * 0.2
            )
            # 風格一致性 = 命名 + 縮排 + 拼錯/死代碼 + 注釋
            style_score = (
                scores["identifier_score"] * 0.35
                + scores.get("indent_score", 0) * 0.25
                + scores["comment_score"] * 0.20
                + max(scores.get("typo_score", 0), scores.get("dead_code_score", 0)) * 0.20
            )
        elif detect_mode == "english_essay":
            # English essay dual scores
            logic_score = (
                scores["comment_score"] * 0.40       # sentence alignment (most critical)
                + scores["identifier_score"] * 0.35  # semantic paraphrase
                + scores["structure_score"] * 0.25   # discourse structure
            )
            style_score = (
                scores["verbatim_score"] * 0.45      # lexical overlap
                + scores.get("indent_score", 0) * 0.35  # stylometry
                + scores["comment_score"] * 0.20     # sentence alignment
            )
        else:
            # 文本/中文作文模式的雙分數
            logic_score = (
                scores["structure_score"] * 0.3
                + scores["comment_score"] * 0.4
                + scores["identifier_score"] * 0.3
            )
            style_score = (
                scores["verbatim_score"] * 0.5
                + scores.get("indent_score", 0) * 0.3
                + scores["comment_score"] * 0.2
            )

        scores["logic_score"] = min(round(logic_score, 1), 100)
        scores["style_score"] = min(round(style_score, 1), 100)

        if is_code:
            scores["signals"].append(
                f"雙分數: 邏輯={logic_score:.0f} 風格={style_score:.0f}"
            )

        # ---- 加權合成 ----
        if weights:
            w = weights
            auto_detected = False
        else:
            auto_detected = True
            if is_code:
                w = DETECTION_PRESETS["code"]["weights"]
            else:
                w = DETECTION_PRESETS["text"]["weights"]

        detected_type = "code" if is_code else "text"
        if auto_detected:
            scores["signals"].append(
                f"自動偵測內容類型: {detected_type}，使用{'程式' if is_code else '文字'}權重"
            )

        final_score = (
            scores["structure_score"] * w.get("structure", WEIGHT_STRUCTURE)
            + scores["identifier_score"] * w.get("identifier", WEIGHT_IDENTIFIER)
            + scores["verbatim_score"] * w.get("verbatim", WEIGHT_VERBATIM)
            + scores.get("indent_score", 0) * w.get("indent", WEIGHT_INDENT)
            + scores["comment_score"] * w.get("comment", WEIGHT_COMMENT)
            + evidence_score * w.get("evidence", WEIGHT_EVIDENCE)
        )

        # ---- 雙分數修正: 邏輯高+風格低 → 壓低總分（簡單作業巧合）----
        if is_code:
            logic = scores.get("logic_score", 0)
            style = scores.get("style_score", 0)
            if logic > 70 and style < 40:
                # 邏輯相似但風格不同 → 很可能是簡單作業的巧合
                penalty = (70 - style) / 100  # 風格越低，懲罰越大
                final_score *= (1 - penalty * 0.4)
                scores["signals"].append(
                    f"邏輯高({logic:.0f})但風格低({style:.0f})→ 可能巧合，總分降權"
                )

            # 強證據加成: 拼錯/死代碼是「實錘」級別
            forensic = max(scores.get("typo_score", 0), scores.get("dead_code_score", 0))
            if forensic >= 50:
                bonus = forensic * 0.15
                final_score = min(final_score + bonus, 100)
                scores["signals"].append(f"強物證加成 +{bonus:.0f}")

        # 提取匹配片段
        fragments = extract_matching_fragments(clean_a, clean_b)

        # 將各維度分數附加到片段資訊中（供前端顯示）
        detail: Dict[str, Any] = {
            "text": f"[維度分析] 結構={scores['structure_score']:.0f} "
                    f"標識符={scores['identifier_score']:.0f} "
                    f"逐字={scores['verbatim_score']:.0f} "
                    f"縮排={scores.get('indent_score', 0):.0f} "
                    f"注釋={scores['comment_score']:.0f} "
                    f"Winnow={scores.get('winnow_score', 0):.0f} "
                    f"數據流={scores.get('data_flow_score', 0):.0f} "
                    f"拼錯={scores.get('typo_score', 0):.0f} "
                    f"死代碼={scores.get('dead_code_score', 0):.0f} "
                    f"證據={evidence_score:.0f}({evidence_hits}/{total_dims}維)"
                    f" 邏輯={scores.get('logic_score', 0):.0f}"
                    f" 風格={scores.get('style_score', 0):.0f}",
            "type": "dimension_breakdown",
            "structure_score": round(scores["structure_score"], 1),
            "identifier_score": round(scores["identifier_score"], 1),
            "verbatim_score": round(scores["verbatim_score"], 1),
            "indent_score": round(scores.get("indent_score", 0), 1),
            "comment_score": round(scores["comment_score"], 1),
            "evidence_score": round(evidence_score, 1),
            "evidence_hits": evidence_hits,
            "total_dims": total_dims,
            "logic_score": scores.get("logic_score", 0),
            "style_score": scores.get("style_score", 0),
            "winnow_score": round(scores.get("winnow_score", 0), 1),
            "data_flow_score": round(scores.get("data_flow_score", 0), 1),
            "typo_score": round(scores.get("typo_score", 0), 1),
            "dead_code_score": round(scores.get("dead_code_score", 0), 1),
            "ai_suspicion": round(scores.get("ai_suspicion", 0), 1),
            "_ai_label": scores.get("_ai_label"),
            "_ai_score_a": scores.get("_ai_score_a"),
            "_ai_score_b": scores.get("_ai_score_b"),
            # Cohort suppression — code mode（僅供展示）
            "_cohort_skeleton_suppression": scores.get("_cohort_skeleton_suppression"),
            "_cohort_identifier_suppression": scores.get("_cohort_identifier_suppression"),
            "_cohort_suppressed_patterns": scores.get("_cohort_suppressed_patterns"),
            "_cohort_size": scores.get("_cohort_size"),
            # Cohort suppression — chinese_essay mode（僅供展示）
            "_cohort_rare_phrase_avg_weight": scores.get("_cohort_rare_phrase_avg_weight"),
            "_cohort_rare_phrase_suppressed_count": scores.get("_cohort_rare_phrase_suppressed_count"),
            "_cohort_rare_phrase_total_shared": scores.get("_cohort_rare_phrase_total_shared"),
            "_cohort_opening_suppression": scores.get("_cohort_opening_suppression"),
            "_cohort_ending_suppression": scores.get("_cohort_ending_suppression"),
            # Soft evidence（chinese_essay）
            "_soft_evidence_score": scores.get("_soft_evidence_score"),
            "_soft_evidence_hits": scores.get("_soft_evidence_hits"),
            "_soft_evidence_total_dims": scores.get("_soft_evidence_total_dims"),
            "_soft_evidence_detail": scores.get("_soft_evidence_detail"),
            "_rare_phrase_score_raw": scores.get("_rare_phrase_score_raw"),
            # Functional structure（chinese_essay）
            "_func_structure_score": scores.get("_func_structure_score"),
            "_essay_type_a": scores.get("_essay_type_a"),
            "_essay_type_b": scores.get("_essay_type_b"),
            "_essay_type_confidence_a": scores.get("_essay_type_confidence_a"),
            "_essay_type_confidence_b": scores.get("_essay_type_confidence_b"),
            "_func_seq_a": scores.get("_func_seq_a"),
            "_func_seq_b": scores.get("_func_seq_b"),
            "_evidence_blocks": scores.get("_evidence_blocks"),
            # P1 中間字段
            "_control_flow_score": scores.get("_control_flow_score"),
            "_call_sig_score": scores.get("_call_sig_score"),
            "_literal_sig_score": scores.get("_literal_sig_score"),
            "is_code": is_code,
            "code_length": min(len(clean_a), len(clean_b)),
            "signals": scores.get("signals", []),
            # 中文/英文作文中間產物（供 LLM 使用）
            "_aligned_pairs": scores.get("_aligned_pairs"),
            "_opening_sim": scores.get("_opening_sim"),
            "_ending_sim": scores.get("_ending_sim"),
            "_span_coverage": scores.get("_span_coverage"),
            "_sentence_chain_score": scores.get("_sentence_chain_score"),
            "_chain_count": scores.get("_chain_count"),
            "_max_chain_len": scores.get("_max_chain_len"),
            "_rare_phrases": scores.get("_rare_phrases"),
            # English essay intermediates
            "_rare_phrase_score": scores.get("_rare_phrase_score"),
            "_risk_type": scores.get("_risk_type"),
            "_warnings": scores.get("_warnings"),
        }
        fragments.insert(0, detail)

        return round(final_score, 2), fragments

    # ================================================================
    # 文件提取（需要 repo 存取）
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

    # 提交元數據正則：匹配「（由 XXX 代為提交）」，不參與抄襲比對
    _META_RE = re.compile(r'^[（(]由.{1,20}代為提交[)）]$', re.MULTILINE)

    def _extract_submission_text(
        self,
        submission: Dict[str, Any],
        files: List[Dict[str, Any]],
    ) -> str:
        """提取單份提交的所有文本（備註 + 文件內容）"""
        parts: List[str] = []

        # 學生備註（過濾掉教師代提交元數據）
        content = submission.get("content", "")
        if content and content.strip():
            filtered = self._META_RE.sub('', content).strip()
            if filtered:
                parts.append(filtered)

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
