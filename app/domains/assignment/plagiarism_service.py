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
MAX_AI_ANALYSIS_PAIRS = 50  # AI 分析上限

# 代碼感知檢測參數
TINY_CODE_THRESHOLD = 200        # 字元數 < 此值視為「極短代碼」（如 20 行 SwiftUI）
SHORT_CODE_THRESHOLD = 500       # 字元數 < 此值視為「短代碼」
MEDIUM_CODE_THRESHOLD = 2000     # 字元數 < 此值視為「中等長度」
TINY_CODE_FLAG_THRESHOLD = 92.0  # 極短代碼需非常高閾值（幾乎逐字複製才標記）
SHORT_CODE_FLAG_THRESHOLD = 85.0  # 短代碼需更高閾值才標記可疑
MEDIUM_CODE_FLAG_THRESHOLD = 70.0  # 中等長度代碼閾值

# Winnowing 算法參數 (MOSS 核心)
WINNOW_K = 5       # K-gram 長度（Token 級別，不是字元級別）
WINNOW_W = 4       # 窗口大小

# 多維度評分權重（合計 1.0）
# 設計原則: 單一維度高分不足以標記，需要多維度同時命中
# ---- 雙分數體系 ----
# 邏輯相似度: 結構+Token是否一致（簡單作業天然高，需結合風格分一起看）
# 風格一致性: 命名+縮排+注釋等「非邏輯」私人習慣
WEIGHT_STRUCTURE = 0.15    # 結構相似度（骨架比對 — 短代碼天然高，權重低）
WEIGHT_IDENTIFIER = 0.25   # 標識符指紋（自定義變量名相同 = 強信號）
WEIGHT_VERBATIM = 0.25     # 逐字複製（最長公共子串比率）
WEIGHT_INDENT = 0.15       # 縮排指紋（tab/空格習慣、縮排深度模式）
WEIGHT_COMMENT = 0.10      # 注釋/字串相似度
WEIGHT_EVIDENCE = 0.10     # 多重證據加成（多個維度同時命中才加分）

# 多重證據閾值: 單一維度必須超過此值才算「命中」
EVIDENCE_HIT_THRESHOLD = 70.0
# 需要命中的最少維度數才給予證據加成
MIN_EVIDENCE_DIMENSIONS = 2

# ---- 作業類型 (detect_mode) 檢測策略 ----
# 目前為 ICT 科目設計的三種作業類型，其他科目後續擴充
DETECTION_PRESETS: Dict[str, Dict[str, Any]] = {
    "code": {
        "label": "代碼",
        "weights": {
            "structure": 0.15, "identifier": 0.25, "verbatim": 0.25,
            "indent": 0.15, "comment": 0.10, "evidence": 0.10,
        },
        "default_threshold": 60.0,
        "description": "程式碼作業，重視變量名、縮排風格、逐字複製",
    },
    "text": {
        "label": "文字",
        "weights": {
            "structure": 0.10, "identifier": 0.05, "verbatim": 0.40,
            "indent": 0.05, "comment": 0.25, "evidence": 0.15,
        },
        "default_threshold": 50.0,
        "description": "文字報告作業，重視逐字複製和段落相似",
    },
    "mixed": {
        "label": "混合（自動識別）",
        "weights": None,  # None 表示逐對自動偵測
        "default_threshold": 60.0,
        "description": "自動識別每份作業是代碼還是文字，動態選擇最佳權重",
    },
}

# 保持向後兼容
SUBJECT_PRESETS = DETECTION_PRESETS

# ---- Token 類型（用於代碼 Token 序列化）----
# 將代碼轉為與變量名無關的原子操作序列
TOKEN_PATTERNS: List[Tuple[str, str]] = [
    # 關鍵字 → 保留原名
    (r'\b(if|else|elif|for|while|do|switch|case|default|break|continue|return)\b', 'KW'),
    (r'\b(def|function|func|class|struct|enum|protocol|interface)\b', 'DECL'),
    (r'\b(import|from|include|using|require)\b', 'IMPORT'),
    (r'\b(try|catch|except|finally|throw|throws|raise)\b', 'ERR'),
    (r'\b(var|let|const|int|float|double|string|bool|char|void)\b', 'TYPE'),
    (r'\b(print|println|printf|console|cout|cin|scanf|input|output)\b', 'IO'),
    (r'\b(true|false|True|False|nil|null|None|undefined)\b', 'LIT'),
    (r'\b(self|this|super)\b', 'SELF'),
    (r'\b(and|or|not|in|is|instanceof|typeof)\b', 'LOGOP'),
    (r'\b(new|del|delete|sizeof)\b', 'MEMOP'),
    # 數字常量
    (r'\b\d+\.?\d*\b', 'NUM'),
    # 字串
    (r'""".*?"""|\'\'\'.*?\'\'\'', 'STR'),
    (r'"[^"]*"', 'STR'),
    (r"'[^']*'", 'STR'),
    # 運算符
    (r'\+\+|--', 'INCDEC'),
    (r'[+\-*/%]=', 'OPASSIGN'),
    (r'==|!=|<=|>=|<|>', 'CMP'),
    (r'&&|\|\||!', 'LOGOP'),
    (r'[+\-*/%]', 'ARITH'),
    (r'=', 'ASSIGN'),
    # 括號和分隔符
    (r'\{', 'LBRACE'),
    (r'\}', 'RBRACE'),
    (r'\(', 'LPAREN'),
    (r'\)', 'RPAREN'),
    (r'\[', 'LBRACK'),
    (r'\]', 'RBRACK'),
    (r';', 'SEMI'),
    (r',', 'COMMA'),
    (r'\.', 'DOT'),
    (r':', 'COLON'),
    # 標識符（變量名、函數名 → 統一為 VAR）
    (r'\b[a-zA-Z_]\w*\b', 'VAR'),
]

# 中學生不太可能自己寫出的高階特徵（AI 生成代碼嫌疑）
ADVANCED_PATTERNS = [
    (r'\blambda\s', "Lambda 表達式"),
    (r'\bmap\s*\(.*lambda', "map+lambda 組合"),
    (r'\bfilter\s*\(.*lambda', "filter+lambda 組合"),
    (r'\breduce\s*\(', "reduce 函數"),
    (r'\[.*\bfor\b.*\bin\b.*\]', "列表推導式"),
    (r'\{.*\bfor\b.*\bin\b.*\}', "集合/字典推導式"),
    (r'\b\w+\s*if\s+.*\s+else\s+', "三元表達式"),
    (r'__\w+__', "Dunder 方法"),
    (r'\*args|\*\*kwargs', "*args/**kwargs"),
    (r'@\w+', "裝飾器"),
    (r'\byield\b', "生成器 yield"),
    (r'\basync\s+(def|function)\b', "async 函式"),
    (r'\bawait\b', "await 關鍵字"),
    (r'<<|>>|&|\||\^|~', "位運算"),
    (r'\bwalrus\b|:=', "海象運算符 :="),
    (r'\bwith\s+\w+.*\bas\b', "上下文管理器"),
]

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

            # 2) 兩兩對比
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

                score, fragments = self._compute_similarity(text_a, text_b, weights=subject_weights)

                # 長度自適應閾值
                effective_threshold = threshold
                shorter_len = min(len(text_a.strip()), len(text_b.strip()))
                if shorter_len < TINY_CODE_THRESHOLD:
                    effective_threshold = max(threshold, TINY_CODE_FLAG_THRESHOLD)
                elif shorter_len < SHORT_CODE_THRESHOLD:
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

                # 每 5 對更新一次進度（避免過於頻繁）
                if compared % 5 == 0 or compared == total_combinations:
                    _progress(
                        "compare", compared, total_combinations,
                        f"已比對 {compared}/{total_combinations} 對"
                        f"（發現 {len(flagged_indices)} 對可疑）",
                    )

            flagged_count = len(flagged_indices)

            # 3) AI 深度分析
            if self._ask_ai_func and flagged_indices:
                flagged_indices.sort(
                    key=lambda i: all_pairs[i]["similarity_score"], reverse=True
                )
                ai_targets = flagged_indices[:MAX_AI_ANALYSIS_PAIRS]
                ai_total = len(ai_targets)
                ai_count = 0
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
                        ai_result = self._ai_analyze_pair(
                            sub_texts[id_a]["text"],
                            sub_texts[id_b]["text"],
                            pair["similarity_score"],
                            detect_mode=detect_mode,
                        )
                        pair["ai_analysis"] = ai_result
                    except Exception as e:
                        logger.warning("AI 分析配對失敗: %s", e)
                        pair["ai_analysis"] = f"AI 分析失敗: {e}"

                if len(flagged_indices) > MAX_AI_ANALYSIS_PAIRS:
                    logger.info(
                        "可疑配對 %d 對，AI 僅分析前 %d 對",
                        len(flagged_indices), MAX_AI_ANALYSIS_PAIRS,
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

        result = self._ai_analyze_pair(
            texts["a"], texts["b"],
            float(pair.get("similarity_score", 0)),
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
        weights: Optional[Dict[str, float]] = None,
    ) -> Tuple[float, List[Dict[str, Any]]]:
        """
        多維度代碼感知相似度算法 — 雙分數體系。

        輸出兩個分數:
        1. 邏輯相似度: Token 結構、數據流是否一致（簡單作業天然高）
        2. 風格一致性: 命名、縮排、拼錯、死代碼等「非邏輯」習慣

        只有兩個分數同時高才判定為抄襲（解決簡單作業誤報問題）。

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

        # 多重證據加成: 統計有多少個維度超過閾值
        dimension_scores = [
            scores["structure_score"],
            scores["identifier_score"],
            scores["verbatim_score"],
            scores.get("indent_score", 0),
            scores["comment_score"],
        ]
        evidence_hits = sum(1 for s in dimension_scores if s >= EVIDENCE_HIT_THRESHOLD)
        if evidence_hits >= MIN_EVIDENCE_DIMENSIONS:
            evidence_score = min(evidence_hits / 5.0 * 100, 100)
            scores["signals"].append(
                f"多重證據: {evidence_hits}/5 個維度同時命中（>{EVIDENCE_HIT_THRESHOLD:.0f}分）"
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
        else:
            logic_score = scores["structure_score"]
            style_score = scores["verbatim_score"]

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
        fragments = self._extract_matching_fragments(clean_a, clean_b)

        # 將各維度分數附加到片段資訊中（供前端顯示）
        detail: Dict[str, Any] = {
            "text": f"[維度分析] 結構={scores['structure_score']:.0f} "
                    f"標識符={scores['identifier_score']:.0f} "
                    f"逐字={scores['verbatim_score']:.0f} "
                    f"縮排={scores.get('indent_score', 0):.0f} "
                    f"注釋={scores['comment_score']:.0f} "
                    f"證據={evidence_score:.0f}({evidence_hits}/5維)"
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
            "logic_score": scores.get("logic_score", 0),
            "style_score": scores.get("style_score", 0),
            "winnow_score": round(scores.get("winnow_score", 0), 1),
            "data_flow_score": round(scores.get("data_flow_score", 0), 1),
            "typo_score": round(scores.get("typo_score", 0), 1),
            "dead_code_score": round(scores.get("dead_code_score", 0), 1),
            "ai_suspicion": round(scores.get("ai_suspicion", 0), 1),
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
        代碼感知相似度: 多維度分析 + Winnowing 指紋 + 非邏輯特徵。

        === 邏輯相似度（結構是否一致）===
        1. Token 序列化 + Winnowing 指紋（MOSS 核心，抗插入垃圾代碼）
        2. 骨架化 N-gram（去掉標識符後的結構比對）
        3. 數據流分析（變量生命週期，抗調換行順序）

        === 風格一致性（「非邏輯」私人習慣）===
        4. 標識符指紋（自定義變量名相同 = 強信號）
        5. 縮排/空格節奏（每個人的習慣不同）
        6. 拼寫錯誤模式（共享拼錯 = 實錘）
        7. 死代碼/調試痕跡（相同的 print("test") = 實錘）
        8. 注釋/字串相似度

        只有邏輯+風格同時高才判定為抄襲。

        同時檢測 AI 生成代碼嫌疑（高階語法、過於規範的注釋/命名）。
        """
        signals: List[str] = []

        # ================================================================
        # 邏輯相似度
        # ================================================================

        # ---- 1) Winnowing 指紋（MOSS 核心）----
        tokens_a = self._tokenize_code(raw_a)
        tokens_b = self._tokenize_code(raw_b)
        winnow_score = self._winnowing_similarity(tokens_a, tokens_b)
        token_seq_score = self._token_sequence_similarity(tokens_a, tokens_b)

        if winnow_score > 80:
            signals.append(f"Winnowing 指紋高度匹配: {winnow_score:.0f}%（抗混淆結構相同）")
        elif winnow_score > 60:
            signals.append(f"Winnowing 指紋中度匹配: {winnow_score:.0f}%")

        # ---- 2) 骨架化 N-gram（原有方法）----
        skeleton_a = self._skeletonize(raw_a)
        skeleton_b = self._skeletonize(raw_b)
        skeleton_score = self._ngram_jaccard(skeleton_a, skeleton_b, n)

        # 結構分 = Winnowing 和骨架的加權（Winnowing 更抗混淆，權重更高）
        structure_score = winnow_score * 0.5 + skeleton_score * 0.3 + token_seq_score * 0.2

        # ---- 3) 數據流分析 ----
        data_flow_score = self._detect_data_flow_similarity(raw_a, raw_b)
        if data_flow_score > 80:
            signals.append(f"數據流模式高度相似: {data_flow_score:.0f}%（變量生命週期一致）")

        # ================================================================
        # 風格一致性
        # ================================================================

        # ---- 4) 標識符指紋（教師重點: "不改名"和"variable名一樣"）----
        ids_a = self._extract_identifiers(raw_a)
        ids_b = self._extract_identifiers(raw_b)
        common_kw = self._common_keywords()

        unique_ids_a = ids_a - common_kw
        unique_ids_b = ids_b - common_kw
        base_id_score = self._set_overlap(ids_a, ids_b)

        if unique_ids_a and unique_ids_b:
            shared_unique = unique_ids_a & unique_ids_b
            all_unique = unique_ids_a | unique_ids_b
            unique_overlap = len(shared_unique) / max(len(all_unique), 1) * 100

            containment_a_in_b = len(unique_ids_a & unique_ids_b) / max(len(unique_ids_a), 1) * 100
            containment_b_in_a = len(unique_ids_a & unique_ids_b) / max(len(unique_ids_b), 1) * 100
            containment = max(containment_a_in_b, containment_b_in_a)

            if containment > 90 and len(shared_unique) >= 2:
                signals.append(
                    f"不改名直接複製: {len(shared_unique)} 個自定義名完全相同 "
                    f"({', '.join(sorted(shared_unique)[:5])})"
                )
                identifier_score = max(unique_overlap, containment)
            elif unique_overlap > 70:
                signals.append(
                    f"自定義變量名高度重疊: "
                    f"{', '.join(sorted(shared_unique)[:5])}"
                )
                identifier_score = max(base_id_score, unique_overlap)
            else:
                identifier_score = base_id_score
        else:
            identifier_score = base_id_score
            if not unique_ids_a and not unique_ids_b:
                identifier_score *= 0.3
                signals.append("無自定義變量名（標識符維度參考性低）")

        # ---- 5) 逐字複製: 最長公共子串比率 ----
        verbatim_score = self._verbatim_ratio(clean_a, clean_b)

        # ---- 6) 縮排指紋（教師重點: "tab的習慣"）----
        indent_score = self._indent_fingerprint_similarity(raw_a, raw_b)
        if indent_score > 85:
            signals.append("縮排習慣高度相似（tab/空格、深度模式一致）")
        elif indent_score > 70:
            signals.append("縮排習慣中度相似")

        # ---- 7) 拼寫錯誤模式（強證據）----
        typo_score, typo_signals = self._detect_shared_typos(raw_a, raw_b)
        if typo_score > 0:
            signals.extend([f"共享拼錯: {s}" for s in typo_signals[:3]])

        # ---- 8) 死代碼/調試痕跡（強證據）----
        dead_code_score, dead_signals = self._detect_dead_code(raw_a, raw_b)
        if dead_code_score > 0:
            signals.extend(dead_signals[:3])

        # ---- 9) 注釋/字串 ----
        comments_a = self._extract_comments_and_strings(raw_a)
        comments_b = self._extract_comments_and_strings(raw_b)
        if comments_a and comments_b:
            comment_score = self._ngram_jaccard(
                " ".join(comments_a), " ".join(comments_b), n
            )
            if set(comments_a) & set(comments_b):
                shared = set(comments_a) & set(comments_b)
                unique_shared = {c for c in shared if len(c.strip()) > 10}
                if unique_shared:
                    signals.append(f"共享 {len(unique_shared)} 段獨特注釋/字串")
                    comment_score = max(comment_score, 85.0)
        else:
            comment_score = structure_score * 0.3

        # ---- 10) AI 生成代碼嫌疑（兩份都檢測）----
        ai_a_score, ai_a_sig = self._detect_ai_generated(raw_a)
        ai_b_score, ai_b_sig = self._detect_ai_generated(raw_b)
        ai_score = max(ai_a_score, ai_b_score)
        if ai_score >= 40:
            signals.append(f"AI 生成嫌疑: {', '.join((ai_a_sig or ai_b_sig)[:3])}")

        # ---- 長度自適應: 短代碼壓低結構分（因為短代碼天然相似）----
        code_len = min(len(clean_a), len(clean_b))
        if code_len < TINY_CODE_THRESHOLD:
            structure_score *= 0.3
            signals.append("極短代碼（結構分大幅降權，重點看命名和縮排）")
        elif code_len < SHORT_CODE_THRESHOLD:
            structure_score *= 0.5
            signals.append("短代碼（結構分已降權）")
        elif code_len < MEDIUM_CODE_THRESHOLD:
            structure_score *= 0.8

        # ---- 強證據加成: 拼錯/死代碼直接提升可信度 ----
        # 將強證據分數融入 comment_score（佔用「非邏輯證據」通道）
        if typo_score > 0 or dead_code_score > 0:
            forensic_bonus = max(typo_score, dead_code_score)
            comment_score = max(comment_score, forensic_bonus)

        return {
            "structure_score": min(structure_score, 100),
            "identifier_score": min(identifier_score, 100),
            "verbatim_score": min(verbatim_score, 100),
            "indent_score": min(indent_score, 100),
            "comment_score": min(comment_score, 100),
            "data_flow_score": min(data_flow_score, 100),
            "winnow_score": min(winnow_score, 100),
            "typo_score": min(typo_score, 100),
            "dead_code_score": min(dead_code_score, 100),
            "ai_suspicion": min(ai_score, 100),
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
            "identifier_score": structure_score * 0.8,  # 文本無標識符概念
            "verbatim_score": min(verbatim_score, 100),
            "indent_score": 0.0,  # 文本不適用縮排分析
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
            # SwiftUI / iOS 框架（UI 組件和修飾符 — 學生必須使用，不算抄襲）
            'View', 'body', 'some', 'var', 'VStack', 'HStack', 'ZStack',
            'Text', 'Image', 'Button', 'Spacer', 'List', 'NavigationView',
            'NavigationLink', 'ScrollView', 'ForEach', 'Section', 'Form',
            'TextField', 'Toggle', 'Picker', 'Slider', 'Stepper', 'Alert',
            'Sheet', 'TabView', 'GeometryReader', 'LazyVStack', 'LazyHStack',
            'foregroundColor', 'backgroundColor', 'font', 'padding', 'frame',
            'bold', 'italic', 'cornerRadius', 'shadow', 'opacity', 'offset',
            'overlay', 'background', 'clipShape', 'clipped', 'edgesIgnoringSafeArea',
            'systemName', 'largeTitle', 'title', 'headline', 'subheadline',
            'caption', 'footnote', 'resizable', 'scaledToFit', 'scaledToFill',
            'action', 'label', 'content', 'alignment', 'spacing',
            'onAppear', 'onTapGesture', 'onChange', 'task', 'refreshable',
            'State', 'Binding', 'ObservedObject', 'EnvironmentObject',
            'Published', 'StateObject', 'Environment', 'AppStorage',
            'ContentView', 'PreviewProvider', 'previews', 'App', 'WindowGroup',
            'Color', 'Font', 'CGFloat', 'Bool', 'Double', 'Int',
            'teal', 'blue', 'red', 'green', 'white', 'black', 'gray',
            'primary', 'secondary', 'accentColor',
            'Circle', 'Rectangle', 'RoundedRectangle', 'Capsule', 'Ellipse',
            'fill', 'stroke', 'lineWidth', 'rotation', 'trim',
            # 通用短詞
            'get', 'set', 'add', 'put', 'map', 'key', 'val', 'err',
            'ok', 'fn', 'args', 'argv', 'argc', 'tmp', 'temp', 'res',
            'req', 'arr', 'obj', 'num', 'sum', 'max', 'min', 'data',
        }

    @staticmethod
    def _indent_fingerprint_similarity(code_a: str, code_b: str) -> float:
        """
        縮排指紋相似度 — 基於資深教師經驗。

        每個學生有自己的縮排習慣:
        - Tab vs 空格（有人用 tab，有人用 2 空格，有人用 4 空格）
        - 縮排深度模式（嵌套幾層、每層幾格）
        - 空行位置和數量
        - 行尾有無多餘空格
        - 大括號放置風格（同行 vs 換行）

        抄襲者直接複製時，這些習慣會被保留下來。
        """
        lines_a = code_a.split('\n')
        lines_b = code_b.split('\n')

        fp_a = PlagiarismService._extract_indent_fingerprint(lines_a)
        fp_b = PlagiarismService._extract_indent_fingerprint(lines_b)

        if not fp_a or not fp_b:
            return 0.0

        score = 0.0
        checks = 0

        # 1) Tab vs 空格習慣是否相同
        checks += 1
        if fp_a["indent_char"] == fp_b["indent_char"]:
            score += 1.0

        # 2) 縮排單位大小（2格 vs 4格 vs tab）
        checks += 1
        if fp_a["indent_unit"] == fp_b["indent_unit"]:
            score += 1.0
        elif fp_a["indent_unit"] and fp_b["indent_unit"]:
            # 接近的也給部分分
            ratio = min(fp_a["indent_unit"], fp_b["indent_unit"]) / max(fp_a["indent_unit"], fp_b["indent_unit"])
            score += ratio * 0.5

        # 3) 縮排深度序列模式（逐行的縮排深度變化）
        checks += 1
        depth_sim = PlagiarismService._sequence_similarity(
            fp_a["depth_sequence"], fp_b["depth_sequence"]
        )
        score += depth_sim

        # 4) 空行位置模式
        checks += 1
        blank_sim = PlagiarismService._sequence_similarity(
            fp_a["blank_pattern"], fp_b["blank_pattern"]
        )
        score += blank_sim

        # 5) 行尾空格習慣
        checks += 1
        if fp_a["trailing_spaces"] == fp_b["trailing_spaces"]:
            score += 1.0
        elif abs(fp_a["trailing_spaces"] - fp_b["trailing_spaces"]) <= 0.1:
            score += 0.5

        # 6) 大括號風格 (same-line vs next-line)
        checks += 1
        if fp_a["brace_style"] == fp_b["brace_style"]:
            score += 1.0

        return (score / max(checks, 1)) * 100

    @staticmethod
    def _extract_indent_fingerprint(lines: List[str]) -> Dict[str, Any]:
        """提取一段代碼的縮排指紋特徵"""
        if not lines:
            return {}

        tab_count = 0
        space_count = 0
        indent_sizes: List[int] = []
        depth_sequence: List[int] = []
        blank_pattern: List[int] = []  # 1=空行, 0=非空行
        trailing_count = 0
        total_lines = 0
        brace_same_line = 0
        brace_next_line = 0

        for i, line in enumerate(lines):
            blank_pattern.append(1 if line.strip() == '' else 0)

            if line.strip() == '':
                continue

            total_lines += 1

            # 統計縮排字元
            stripped = line.lstrip()
            indent = line[:len(line) - len(stripped)]
            if '\t' in indent:
                tab_count += 1
            if '  ' in indent:
                space_count += 1

            # 縮排深度
            if indent:
                indent_sizes.append(len(indent.replace('\t', '    ')))
            depth_sequence.append(len(indent.replace('\t', '    ')))

            # 行尾空格
            if line.rstrip() != line and line.strip():
                trailing_count += 1

            # 大括號風格
            if stripped.endswith('{'):
                brace_same_line += 1
            if stripped == '{':
                brace_next_line += 1

        # 推算縮排單位
        indent_unit = 0
        if indent_sizes:
            # 找最小非零縮排作為單位
            nonzero = [s for s in indent_sizes if s > 0]
            if nonzero:
                indent_unit = min(nonzero)

        # 大括號風格
        total_braces = brace_same_line + brace_next_line
        if total_braces > 0:
            brace_style = "same_line" if brace_same_line > brace_next_line else "next_line"
        else:
            brace_style = "none"

        return {
            "indent_char": "tab" if tab_count > space_count else ("space" if space_count > 0 else "none"),
            "indent_unit": indent_unit,
            "depth_sequence": depth_sequence,
            "blank_pattern": blank_pattern,
            "trailing_spaces": trailing_count / max(total_lines, 1),
            "brace_style": brace_style,
        }

    @staticmethod
    def _sequence_similarity(seq_a: List[int], seq_b: List[int]) -> float:
        """比較兩個整數序列的相似度（用於縮排深度和空行模式）"""
        if not seq_a or not seq_b:
            return 0.0

        # 使用 LCS 比率
        from difflib import SequenceMatcher
        matcher = SequenceMatcher(None, seq_a, seq_b, autojunk=False)
        return matcher.ratio()

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
    # Winnowing 指紋算法 (MOSS 核心)
    # ================================================================

    @staticmethod
    def _tokenize_code(code: str) -> List[str]:
        """
        將代碼轉為 Token 序列（與變量名無關的原子操作序列）。

        例如:
            for (int i=0; i<10; i++) { sum += i; }
            → ['KW', 'LPAREN', 'TYPE', 'VAR', 'ASSIGN', 'NUM', 'SEMI',
               'VAR', 'CMP', 'NUM', 'SEMI', 'VAR', 'INCDEC', 'RPAREN',
               'LBRACE', 'VAR', 'OPASSIGN', 'VAR', 'SEMI', 'RBRACE']

        優勢: 無論學生把 i 改成 j，還是把 10 改成 n，Token 序列結構不變。
        """
        # 先移除注釋（避免注釋內容干擾 token 化）
        text = re.sub(r'#[^\n]*', '', code)
        text = re.sub(r'//[^\n]*', '', text)
        text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
        text = re.sub(r'""".*?"""|\'\'\'.*?\'\'\'', '""', text, flags=re.DOTALL)

        tokens: List[str] = []
        pos = 0
        while pos < len(text):
            # 跳過空白
            m = re.match(r'\s+', text[pos:])
            if m:
                pos += m.end()
                continue

            matched = False
            for pattern, token_type in TOKEN_PATTERNS:
                m = re.match(pattern, text[pos:])
                if m:
                    if token_type == 'KW':
                        tokens.append(m.group(0).upper())
                    elif token_type == 'DECL':
                        tokens.append('DECL_' + m.group(0).upper())
                    else:
                        tokens.append(token_type)
                    pos += m.end()
                    matched = True
                    break
            if not matched:
                pos += 1

        return tokens

    @staticmethod
    def _winnowing_fingerprints(tokens: List[str], k: int = WINNOW_K, w: int = WINNOW_W) -> Set[int]:
        """
        Winnowing 算法: 從 Token 序列生成穩健的指紋集合。

        1. 用滑動窗口提取 K-Grams（連續 K 個 Token 的哈希值）
        2. 在每個窗口 W 裡選最小哈希值作為指紋
        3. 如果學生在中間插入垃圾代碼，只破壞局部指紋，大部分仍能匹配

        Returns:
            指紋集合（哈希值的 set）
        """
        if len(tokens) < k:
            return set()

        # 生成所有 K-gram 的哈希值
        hashes = []
        for i in range(len(tokens) - k + 1):
            kgram = tuple(tokens[i:i + k])
            hashes.append(hash(kgram))

        if len(hashes) < w:
            return set(hashes)

        # Winnowing: 在每個窗口中選最小哈希值
        fingerprints: Set[int] = set()
        prev_min_idx = -1
        for i in range(len(hashes) - w + 1):
            window = hashes[i:i + w]
            min_val = min(window)
            min_idx = i + window.index(min_val)
            if min_idx != prev_min_idx:
                fingerprints.add(min_val)
                prev_min_idx = min_idx

        return fingerprints

    @staticmethod
    def _winnowing_similarity(tokens_a: List[str], tokens_b: List[str]) -> float:
        """計算兩組 Token 序列的 Winnowing 指紋相似度（百分比）"""
        fp_a = PlagiarismService._winnowing_fingerprints(tokens_a)
        fp_b = PlagiarismService._winnowing_fingerprints(tokens_b)

        if not fp_a or not fp_b:
            return 0.0

        intersection = fp_a & fp_b
        union = fp_a | fp_b
        return len(intersection) / len(union) * 100

    @staticmethod
    def _token_sequence_similarity(tokens_a: List[str], tokens_b: List[str]) -> float:
        """Token 序列的 LCS 相似度（捕捉局部順序相同的操作流）"""
        if not tokens_a or not tokens_b:
            return 0.0

        # 為了效率，截斷過長的序列
        max_tokens = 500
        ta = tokens_a[:max_tokens]
        tb = tokens_b[:max_tokens]

        from difflib import SequenceMatcher
        matcher = SequenceMatcher(None, ta, tb, autojunk=False)
        return matcher.ratio() * 100

    # ================================================================
    # 「非邏輯」特徵檢測 — 中學生洗代碼時最容易遺漏的痕跡
    # ================================================================

    @staticmethod
    def _detect_shared_typos(code_a: str, code_b: str) -> Tuple[float, List[str]]:
        """
        拼寫錯誤模式匹配 — 強證據。

        如果兩個學生在變量名或注釋裡都拼錯了同一個單詞
        （如把 total 寫成 totle），這是非常強的抄襲證據。

        Returns:
            (相似度 0-100, 共享拼錯列表)
        """
        # 常見正確拼寫 → 用於對比
        common_correct_words = {
            'result', 'total', 'count', 'number', 'calculate', 'average',
            'maximum', 'minimum', 'length', 'height', 'width', 'index',
            'value', 'input', 'output', 'student', 'teacher', 'answer',
            'question', 'response', 'message', 'button', 'color', 'image',
            'temperature', 'position', 'address', 'receive', 'separate',
            'necessary', 'occurrence', 'beginning', 'boundary', 'calendar',
            'environment', 'definitely', 'immediately', 'unfortunately',
        }

        def extract_nonstandard_words(code: str) -> Set[str]:
            """提取不在標準詞庫中的自定義詞（可能包含拼錯的詞）"""
            # 提取注釋和變量名中的英文詞
            all_words = set(re.findall(r'\b[a-zA-Z]{4,}\b', code.lower()))
            # 過濾掉語言關鍵字
            keywords = PlagiarismService._common_keywords()
            return {w for w in all_words if w not in {k.lower() for k in keywords}}

        words_a = extract_nonstandard_words(code_a)
        words_b = extract_nonstandard_words(code_b)

        if not words_a or not words_b:
            return 0.0, []

        # 找共同的「非標準詞」
        shared_unusual = words_a & words_b
        signals = []

        # 檢查是否為拼錯的詞
        from difflib import get_close_matches
        shared_typos = []
        for word in shared_unusual:
            # 如果與某個正確詞很像但不完全相同 → 可能是拼錯
            close = get_close_matches(word, common_correct_words, n=1, cutoff=0.75)
            if close and close[0] != word:
                shared_typos.append(f"{word}（可能是 {close[0]}）")

        if shared_typos:
            signals = shared_typos
            # 每個共享拼錯值 30 分，最多 100
            score = min(len(shared_typos) * 30, 100)
        else:
            # 即使沒有拼錯，共享大量「非常規」自定義詞也是信號
            if len(shared_unusual) >= 5:
                score = min(len(shared_unusual) * 8, 60)
                signals = [f"共享 {len(shared_unusual)} 個非常規自定義詞"]
            else:
                score = 0.0

        return score, signals

    @staticmethod
    def _detect_dead_code(code_a: str, code_b: str) -> Tuple[float, List[str]]:
        """
        死代碼/無用變量檢測 — 強證據。

        定義了但沒使用的變量名，或者為了改代碼故意加的 print("test")，
        如果位置和內容一致，基本實錘。

        Returns:
            (相似度 0-100, 信號列表)
        """
        signals: List[str] = []

        def find_dead_patterns(code: str) -> List[str]:
            """找出可能的死代碼/調試痕跡"""
            patterns = []
            # 調試用的 print 語句
            for m in re.finditer(
                r'(?:print|console\.log|println|printf|NSLog)\s*\(\s*["\']([^"\']*)["\']',
                code,
            ):
                content = m.group(1).strip()
                if content and any(kw in content.lower() for kw in
                                   ['test', 'debug', 'here', 'check', 'todo', 'temp',
                                    'xxx', 'aaa', 'bbb', '111', '222', 'hello']):
                    patterns.append(f"debug_print:{content}")

            # 被注釋掉的代碼行（不是正常注釋）
            for m in re.finditer(r'(?://|#)\s*((?:if|for|while|def|var|let|const|return)\b.+)', code):
                patterns.append(f"commented_code:{m.group(1).strip()[:50]}")

            # 定義後從未使用的簡單變量（啟發式）
            assignments = re.findall(r'\b([a-zA-Z_]\w*)\s*=\s*(?!.*=)', code)
            for var_name in assignments:
                if len(var_name) <= 1 or var_name.startswith('_'):
                    continue
                # 統計出現次數（排除定義那行）
                count = len(re.findall(r'\b' + re.escape(var_name) + r'\b', code))
                if count == 1:
                    patterns.append(f"unused_var:{var_name}")

            return patterns

        dead_a = find_dead_patterns(code_a)
        dead_b = find_dead_patterns(code_b)

        if not dead_a or not dead_b:
            return 0.0, []

        shared_dead = set(dead_a) & set(dead_b)

        if shared_dead:
            for item in list(shared_dead)[:5]:
                kind, content = item.split(":", 1)
                if kind == "debug_print":
                    signals.append(f"相同調試輸出: \"{content}\"")
                elif kind == "commented_code":
                    signals.append(f"相同的被注釋代碼: {content}")
                elif kind == "unused_var":
                    signals.append(f"相同的未使用變量: {content}")
            score = min(len(shared_dead) * 25, 100)
        else:
            score = 0.0

        return score, signals

    @staticmethod
    def _detect_ai_generated(code: str) -> Tuple[float, List[str]]:
        """
        AI 生成代碼特徵檢測。

        中學生用 ChatGPT 寫作業的特徵:
        1. 注釋極其規範（平時不寫注釋的學生突然寫出完美英文文檔注釋）
        2. 「降維打擊」— 用了超出教學進度的高階語法
        3. 變量命名過於專業規範（camelCase 完美、命名語義精確）

        Returns:
            (AI 嫌疑度 0-100, 信號列表)
        """
        signals: List[str] = []
        score = 0.0
        lines = code.split('\n')
        non_empty = [l for l in lines if l.strip()]
        if not non_empty:
            return 0.0, []

        # 1) 注釋比例 — 中學生通常不寫注釋，大量規範注釋 = 可疑
        comment_lines = sum(1 for l in non_empty if re.match(r'\s*(#|//|/\*|\*)', l))
        comment_ratio = comment_lines / len(non_empty) if non_empty else 0
        if comment_ratio > 0.3:
            score += 20
            signals.append(f"注釋比例異常高: {comment_ratio:.0%}")

        # 英文文檔注釋（docstring 風格）
        docstring_count = len(re.findall(r'"""[\s\S]*?"""|\'\'\'[\s\S]*?\'\'\'', code))
        jsdoc_count = len(re.findall(r'/\*\*[\s\S]*?\*/', code))
        if docstring_count + jsdoc_count >= 2:
            score += 15
            signals.append(f"多個規範文檔注釋 ({docstring_count + jsdoc_count} 個)")

        # 2) 高階語法檢測 — 超出中學課程的功能
        advanced_hits = []
        for pattern, desc in ADVANCED_PATTERNS:
            if re.search(pattern, code):
                advanced_hits.append(desc)
        if advanced_hits:
            score += min(len(advanced_hits) * 10, 35)
            signals.append(f"高階語法: {', '.join(advanced_hits[:4])}")

        # 3) 變量命名過於規範（完美 camelCase 或 snake_case）
        identifiers = set(re.findall(r'\b([a-zA-Z_]\w{3,})\b', code))
        keywords = PlagiarismService._common_keywords()
        custom_ids = {i for i in identifiers if i not in keywords and i not in {k.lower() for k in keywords}}

        if len(custom_ids) >= 4:
            # 統計符合嚴格命名規範的比例
            camel = sum(1 for i in custom_ids if re.match(r'^[a-z]+([A-Z][a-z]+)+$', i))
            snake = sum(1 for i in custom_ids if re.match(r'^[a-z]+(_[a-z]+)+$', i))
            best_convention = max(camel, snake)
            convention_ratio = best_convention / len(custom_ids)
            if convention_ratio > 0.8 and best_convention >= 4:
                score += 15
                style = "camelCase" if camel > snake else "snake_case"
                signals.append(f"命名過於規範: {best_convention}/{len(custom_ids)} 個自定義名符合 {style}")

        # 4) 錯誤處理過於完善（中學生很少寫 try-except）
        error_handling = len(re.findall(r'\b(try|catch|except|finally)\b', code))
        if error_handling >= 3:
            score += 10
            signals.append(f"過多錯誤處理 ({error_handling} 處)")

        return min(score, 100), signals

    @staticmethod
    def _detect_data_flow_similarity(code_a: str, code_b: str) -> float:
        """
        數據流特徵 — 變量生命週期分析。

        中學生喜歡調換代碼行的順序。此方法檢測變量的依賴關係:
        - 變量在第幾行賦值，在第幾行被使用
        - 輸入幾個變量，輸出幾個變量，中間幾次賦值

        即使插入無關代碼或調換順序，這些依賴關係模式是不變的。

        Returns:
            數據流相似度 0-100
        """

        def extract_data_flow(code: str) -> List[Tuple[str, str]]:
            """提取變量的 定義→使用 關係序列"""
            lines = code.split('\n')
            var_defined: Dict[str, int] = {}  # var → 首次定義行號
            flow_events: List[Tuple[str, str]] = []  # (事件類型, 歸一化標識)

            for i, line in enumerate(lines):
                stripped = line.strip()
                if not stripped or stripped.startswith('#') or stripped.startswith('//'):
                    continue

                # 賦值（定義）
                assign_match = re.findall(r'\b([a-zA-Z_]\w*)\s*=(?!=)', stripped)
                for var in assign_match:
                    if var not in var_defined:
                        var_defined[var] = i
                        flow_events.append(('DEF', var))
                    else:
                        flow_events.append(('REDEF', var))

                # 使用（讀取）
                all_ids = set(re.findall(r'\b([a-zA-Z_]\w*)\b', stripped))
                assigned_here = set(assign_match)
                used_ids = all_ids - assigned_here
                for var in used_ids:
                    if var in var_defined:
                        flow_events.append(('USE', var))

                # IO 操作
                if re.search(r'\b(print|input|scanf|cin|cout|console|readline)\b', stripped):
                    flow_events.append(('IO', 'IO'))

                # 控制流
                if re.search(r'\b(if|for|while|switch)\b', stripped):
                    flow_events.append(('CTRL', 'CTRL'))

                # return
                if re.search(r'\breturn\b', stripped):
                    flow_events.append(('RET', 'RET'))

            return flow_events

        flow_a = extract_data_flow(code_a)
        flow_b = extract_data_flow(code_b)

        if not flow_a or not flow_b:
            return 0.0

        # 歸一化: 將具體變量名替換為出場順序編號
        def normalize_flow(events: List[Tuple[str, str]]) -> List[str]:
            var_map: Dict[str, str] = {}
            counter = 0
            result = []
            for event_type, name in events:
                if event_type in ('IO', 'CTRL', 'RET'):
                    result.append(event_type)
                else:
                    if name not in var_map:
                        var_map[name] = f"V{counter}"
                        counter += 1
                    result.append(f"{event_type}_{var_map[name]}")
            return result

        norm_a = normalize_flow(flow_a)
        norm_b = normalize_flow(flow_b)

        from difflib import SequenceMatcher
        matcher = SequenceMatcher(None, norm_a, norm_b, autojunk=False)
        return matcher.ratio() * 100

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
        detect_mode: str = "mixed",
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

        mode_label = DETECTION_PRESETS.get(detect_mode, {}).get("label", "混合")
        mode_hint = {
            "code": "這是中學電腦課的代碼作業。注意: 簡單題目（如冒泡排序）結構天然相似，不能僅靠結構判斷。",
            "text": "這是文字類作業，重點關注段落是否整段複製、改寫是否只是同義詞替換。",
            "mixed": "這份作業可能包含代碼和文字，請根據實際內容特徵自行判斷最適合的分析策略。",
        }.get(detect_mode, "")

        prompt = f"""你是一位專業的學術誠信分析師，專門分析中學生作業。請分析以下兩份學生提交是否存在抄襲。

## 作業類型: {mode_label}
{mode_hint}

## 自動檢測結果
綜合相似度: {similarity_score:.1f}%（基於 Winnowing 指紋 + 多維度加權得分）

## 提交 A 的內容
{excerpt_a}

## 提交 B 的內容
{excerpt_b}

## 分析要求（按證據強度排序）
請重點關注以下「非邏輯」特徵（中學生洗代碼時最容易遺漏的痕跡）:

1. **共享拼寫錯誤** [實錘級]: 兩人是否在變量名或注釋裡拼錯了同一個單詞？（如 totle 代替 total）
2. **死代碼/調試痕跡** [實錘級]: 相同位置是否有未刪除的 print("test")、被注釋的代碼、未使用的變量？
3. **變量命名** [強信號]: 自定義命名是否完全相同？（獨立開發幾乎不可能取相同的自定義名稱）
4. **空格/縮排節奏** [中等信號]: 運算符兩邊是否加空格、花括號換行風格、函數間空行數是否一致？
5. **注釋/字串** [中等信號]: 是否保留了相同注釋文字？
6. **AI 生成嫌疑**: 是否存在超出教學進度的語法（lambda、推導式、裝飾器等）？注釋是否過於規範？
7. **結構相似**: 整體邏輯一致？（注意: 中學簡單題目本身結構相似是正常的，不能單獨作為證據）

## 回答格式
請直接用中文給出簡明的分析結論（2-4 句話），包含:
- 你的判斷：「高度疑似抄襲」/「可能抄襲」/「相似但可能巧合」/「正常相似」
- 關鍵依據（具體指出哪些變量名/拼錯/死代碼/注釋雷同）
- 如果發現 AI 生成嫌疑，額外提醒
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
