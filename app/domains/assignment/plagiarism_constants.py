#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Plagiarism Detection Constants
==============================
All constants, presets, word lists, and token patterns used by the
plagiarism detection subsystem.

This module has NO project-internal dependencies.
"""

from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

# ================================================================
# 基礎參數
# ================================================================

# 上傳目錄（與 AssignmentService 保持一致）
UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent.parent / "uploads" / "assignments"

# N-gram 參數
DEFAULT_NGRAM_SIZE = 5
DEFAULT_THRESHOLD = 60.0
MAX_TEXT_LENGTH = 15000
MAX_FRAGMENTS_PER_PAIR = 10
MAX_AI_ANALYSIS_PAIRS = 50  # AI 分析上限

# ================================================================
# 代碼感知檢測參數
# ================================================================

TINY_CODE_THRESHOLD = 200        # 字元數 < 此值視為「極短代碼」（如 20 行 SwiftUI）
SHORT_CODE_THRESHOLD = 500       # 字元數 < 此值視為「短代碼」
MEDIUM_CODE_THRESHOLD = 2000     # 字元數 < 此值視為「中等長度」
TINY_CODE_FLAG_THRESHOLD = 92.0  # 極短代碼需非常高閾值（幾乎逐字複製才標記）
SHORT_CODE_FLAG_THRESHOLD = 85.0  # 短代碼需更高閾值才標記可疑
MEDIUM_CODE_FLAG_THRESHOLD = 70.0  # 中等長度代碼閾值

# ================================================================
# Winnowing 算法參數 (MOSS 核心)
# ================================================================

WINNOW_K = 5       # K-gram 長度（Token 級別，不是字元級別）
WINNOW_W = 4       # 窗口大小

# ================================================================
# 多維度評分權重（合計 1.0）
# ================================================================

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

# ================================================================
# 作業類型 (detect_mode) 檢測策略
# ================================================================

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
    "chinese_essay": {
        "label": "中文作文",
        "weights": {
            "structure": 0.10,      # 段落結構相似度
            "identifier": 0.15,     # 語義嵌入相似度
            "verbatim": 0.30,       # 逐字重疊率（最重要）
            "indent": 0.10,         # 風格指紋相似度
            "comment": 0.25,        # 句子級相似度
            "evidence": 0.10,       # 多維證據加成
        },
        "default_threshold": 50.0,
        "description": "中文作文作業，檢測直接抄襲、套用改寫和仿寫模仿",
    },
    "english_essay": {
        "label": "English Essay",
        "weights": {
            "structure": 0.12,      # discourse structure
            "identifier": 0.22,    # semantic paraphrase
            "verbatim": 0.18,      # lexical overlap
            "indent": 0.10,        # stylometry
            "comment": 0.28,       # sentence alignment (MOST CRITICAL)
            "evidence": 0.10,      # multi-evidence bonus
        },
        "default_threshold": 50.0,
        "description": "English essay: direct copy, paraphrase, and structural imitation detection",
    },
}

# 保持向後兼容
SUBJECT_PRESETS = DETECTION_PRESETS

# ================================================================
# English Essay 算法版本（用於 cache key）
# ================================================================

ENGLISH_ALGO_VERSION = "eng_v1.0"

# ================================================================
# English Embedding Model Name
# ================================================================

_ENGLISH_EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"

# ================================================================
# English Stopwords
# ================================================================

ENGLISH_STOPWORDS: Set[str] = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "shall", "should", "may", "might", "must", "can", "could",
    "not", "no", "nor", "so", "if", "then", "than", "that", "this",
    "these", "those", "it", "its", "i", "me", "my", "we", "us", "our",
    "you", "your", "he", "him", "his", "she", "her", "they", "them",
    "their", "what", "which", "who", "whom", "how", "when", "where",
    "why", "all", "each", "every", "both", "few", "more", "most",
    "other", "some", "such", "only", "own", "same", "very", "just",
    "about", "above", "after", "again", "also", "any", "because",
    "before", "between", "down", "during", "here", "into",
    "over", "there", "through", "under", "until", "up", "while",
    "out", "off", "too", "much", "many", "now", "still", "even",
    "well", "back", "like", "get", "got", "make", "made", "go", "went",
    "come", "came", "take", "took", "give", "gave", "say", "said",
    "tell", "told", "think", "thought", "know", "knew", "see", "saw",
    "want", "need", "use", "used", "find", "found", "put", "keep",
}

# ================================================================
# English Transition Markers
# ================================================================

ENGLISH_TRANSITION_MARKERS: Dict[str, List[str]] = {
    "addition": [
        "furthermore", "moreover", "in addition", "additionally",
        "also", "besides", "what is more", "not only",
    ],
    "contrast": [
        "however", "nevertheless", "on the other hand", "although",
        "whereas", "despite", "in contrast", "conversely", "yet",
        "on the contrary", "nonetheless", "while", "but",
    ],
    "cause_effect": [
        "therefore", "consequently", "as a result", "thus",
        "hence", "because", "since", "due to", "owing to",
        "so that", "accordingly",
    ],
    "sequence": [
        "first", "firstly", "second", "secondly", "third", "thirdly",
        "finally", "next", "then", "meanwhile", "subsequently",
        "in the first place", "to begin with", "last but not least",
    ],
    "example": [
        "for example", "for instance", "such as", "namely",
        "specifically", "in particular", "to illustrate",
    ],
    "conclusion": [
        "in conclusion", "to sum up", "in summary", "overall",
        "all in all", "to conclude", "in short", "in brief",
    ],
    "emphasis": [
        "indeed", "in fact", "certainly", "clearly", "obviously",
        "undoubtedly", "above all", "most importantly",
    ],
}

# 預計算：所有 transition marker 的扁平列表（按長度降序，方便匹配）
_ALL_TRANSITION_MARKERS: List[Tuple[str, str]] = []
for _cat, _phrases in ENGLISH_TRANSITION_MARKERS.items():
    for _p in _phrases:
        _ALL_TRANSITION_MARKERS.append((_p.lower(), _cat))
_ALL_TRANSITION_MARKERS.sort(key=lambda x: len(x[0]), reverse=True)

# ================================================================
# English 常見縮寫（用於句子切分保護）
# ================================================================

_ENGLISH_ABBREVIATIONS = {
    "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "vs",
    "etc", "e.g", "i.e", "a.m", "p.m", "u.s", "u.k",
}

# ================================================================
# English 不規則詞形映射
# ================================================================

_ENGLISH_IRREGULAR_MAP: Dict[str, str] = {
    "was": "be", "were": "be", "is": "be", "are": "be", "am": "be",
    "has": "have", "had": "have",
    "did": "do", "done": "do",
    "went": "go", "gone": "go",
    "children": "child", "men": "man", "women": "woman",
    "mice": "mouse", "feet": "foot", "teeth": "tooth",
    "ran": "run", "sat": "sit", "wrote": "write",
    "spoke": "speak", "broke": "break", "chose": "choose",
    "began": "begin", "sang": "sing", "swam": "swim",
    "knew": "know", "grew": "grow", "threw": "throw",
    "caught": "catch", "taught": "teach", "brought": "bring",
    "thought": "think", "bought": "buy", "fought": "fight",
    "found": "find", "held": "hold", "kept": "keep",
    "left": "leave", "lost": "lose", "made": "make",
    "meant": "mean", "met": "meet", "paid": "pay",
    "said": "say", "sent": "send", "spent": "spend",
    "stood": "stand", "told": "tell", "understood": "understand",
}

# ================================================================
# Token 類型（用於代碼 Token 序列化）
# ================================================================

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

# ================================================================
# 進階代碼特徵（AI 生成嫌疑）
# ================================================================

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

# ================================================================
# 代碼文件擴展名
# ================================================================

# ================================================================
# 強證據稀有度 & Cohort Suppression 常量
# ================================================================
COMMON_DEBUG_STRINGS = {"test", "debug", "hello", "here", "check", "temp", "TODO"}
FORENSIC_RARITY_AGGRESSIVE_DECAY = 2.0    # 普通噪聲的 df_ratio 乘數
FORENSIC_RARITY_CONSERVATIVE_DECAY = 1.5  # 高價值證據的 df_ratio 乘數
FORENSIC_MIN_WEIGHT_NOISE = 0.2           # 普通噪聲最低權重
FORENSIC_MIN_WEIGHT_FORENSIC = 0.5        # 高價值證據最低權重
COHORT_MIN_BATCH_SIZE = 5                 # cohort suppression 最小有效樣本數
MAX_EVIDENCE_BLOCKS = 10                  # 片段證據最大條數
EVIDENCE_SNIPPET_MAX_CHARS = 200          # snippet 截斷長度

# ================================================================
# 字面量簽名常量 (P1-C)
# ================================================================
COMMON_NUMERIC_LITERALS = {0, 1, 2, 3, 5, 10, 20, 50, 100, 1000, -1}
COMMON_STRING_LITERALS = {"", " ", "\n", "yes", "no", "true", "false", "N/A"}

CODE_EXTENSIONS = {
    ".swift", ".py", ".js", ".ts", ".jsx", ".tsx",
    ".java", ".c", ".cpp", ".h", ".rb", ".go", ".rs",
}

# ================================================================
# 中文作文模板短語（P1-C：不依賴 batch 的靜態降權詞表）
# ================================================================

CHINESE_TEMPLATE_PHRASES: Set[str] = {
    # --- 開頭套語 ---
    "在生活中", "在我的生活中", "在我们的生活中",
    "记得有一次", "那是一个", "有一天",
    "在我的记忆中", "在我的印象中",
    "时光如白驹过隙", "岁月如梭", "光阴似箭",
    "随着社会的发展", "在当今社会", "众所周知",
    "人生就像", "俗话说得好", "正如那句名言所说",
    # --- 結尾套語 ---
    "这件事让我明白了", "这件事让我懂得了",
    "通过这件事", "经过这件事情",
    "从此以后", "从那以后我明白了",
    "我永远不会忘记", "这段经历让我",
    "这让我深刻地体会到", "这是我人生中",
    "回想起那段时光", "回忆起这段往事",
    # --- 過渡套語 ---
    "在这个过程中", "不知不觉中",
    "总而言之", "综上所述",
    "我认为", "我觉得",
    # --- 議論文套語 ---
    "一方面", "另一方面",
    "首先", "其次", "最后",
    "由此可见", "不可否认",
    "正因为如此", "与此同时",
    # --- 敘事文情感套語 ---
    "那一刻我明白了", "心中充满了感激",
    "眼泪不禁流了下来", "心里暖暖的",
    "这一刻我终于明白", "我的心中充满了",
}

TEMPLATE_PHRASE_DEFAULT_WEIGHT = 0.3   # 模板短語默認權重（低）

# ================================================================
# 中文作文深層風格特徵常量（P1-D）
# ================================================================

# 關聯詞頻率（10 維）— 按總字數歸一化
CHINESE_CONNECTIVE_WORDS: Dict[str, int] = {
    "因为": 0, "所以": 1, "但是": 2, "虽然": 3, "而且": 4,
    "然后": 5, "于是": 6, "不过": 7, "因此": 8, "可是": 9,
}

# 情感動詞頻率（8 維）— 按總字數歸一化
CHINESE_EMOTIONAL_VERBS: Dict[str, int] = {
    "感动": 0, "高兴": 1, "难过": 2, "害怕": 3,
    "感激": 4, "后悔": 5, "期待": 6, "失望": 7,
}
