#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Plagiarism Detection — Code Analyzer
=====================================
All code plagiarism analysis methods: Winnowing fingerprints, skeleton
comparison, identifier analysis, indent fingerprinting, forensic
detection (shared typos, dead code, AI-generated), and data-flow
analysis.

All functions are standalone (no class, no self).

Dependencies: plagiarism_constants, plagiarism_text_utils.
"""

import re
from typing import Any, Dict, List, Optional, Set, Tuple

from app.domains.assignment.plagiarism_constants import (
    ADVANCED_PATTERNS,
    COMMON_DEBUG_STRINGS,
    FORENSIC_RARITY_AGGRESSIVE_DECAY,
    FORENSIC_RARITY_CONSERVATIVE_DECAY,
    FORENSIC_MIN_WEIGHT_NOISE,
    FORENSIC_MIN_WEIGHT_FORENSIC,
    TINY_CODE_THRESHOLD,
    SHORT_CODE_THRESHOLD,
    MEDIUM_CODE_THRESHOLD,
    TOKEN_PATTERNS,
    WINNOW_K,
    WINNOW_W,
)
from app.domains.assignment.plagiarism_text_utils import (
    ngram_jaccard,
    set_overlap,
    sequence_similarity,
    verbatim_ratio,
)


# ================================================================
# 代碼檢測
# ================================================================

def looks_like_code(text: str) -> bool:
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


# ================================================================
# Winnowing 指紋算法 (MOSS 核心)
# ================================================================

def tokenize_code(code: str) -> List[str]:
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


def winnowing_fingerprints(tokens: List[str], k: int = WINNOW_K, w: int = WINNOW_W) -> Set[int]:
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


def winnowing_similarity(tokens_a: List[str], tokens_b: List[str]) -> float:
    """計算兩組 Token 序列的 Winnowing 指紋相似度（百分比）"""
    fp_a = winnowing_fingerprints(tokens_a)
    fp_b = winnowing_fingerprints(tokens_b)

    if not fp_a or not fp_b:
        return 0.0

    intersection = fp_a & fp_b
    union = fp_a | fp_b
    return len(intersection) / len(union) * 100


def token_sequence_similarity(tokens_a: List[str], tokens_b: List[str]) -> float:
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
# 骨架化 + 標識符
# ================================================================

def skeletonize(code: str) -> str:
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


def extract_identifiers(code: str) -> Set[str]:
    """
    提取代碼中的自定義標識符（變量名、函數名、類名）。
    """
    # 提取所有 word-like token
    tokens = set(re.findall(r'\b[a-zA-Z_]\w*\b', code))
    # 過濾掉太短的（< 2 字元）和純數字組合
    return {t for t in tokens if len(t) >= 2}


def common_keywords() -> Set[str]:
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
        # SwiftUI / iOS 框架
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


# ================================================================
# 縮排指紋
# ================================================================

def extract_indent_fingerprint(lines: List[str]) -> Dict[str, Any]:
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


def indent_fingerprint_similarity(code_a: str, code_b: str) -> float:
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

    fp_a = extract_indent_fingerprint(lines_a)
    fp_b = extract_indent_fingerprint(lines_b)

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
    depth_sim = sequence_similarity(
        fp_a["depth_sequence"], fp_b["depth_sequence"]
    )
    score += depth_sim

    # 4) 空行位置模式
    checks += 1
    blank_sim = sequence_similarity(
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


# ================================================================
# 注釋/字串
# ================================================================

def extract_comments_and_strings(code: str) -> List[str]:
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
# 法證分析
# ================================================================

def detect_shared_typos(
    code_a: str,
    code_b: str,
    batch_codes: Optional[List[str]] = None,
) -> Tuple[float, List[str]]:
    """
    拼寫錯誤模式匹配 — 強證據（含稀有度加權）。

    如果兩個學生在變量名或注釋裡都拼錯了同一個單詞
    （如把 total 寫成 totle），這是非常強的抄襲證據。
    支持 batch 級稀有度加權：罕見拼錯高分，常見拼錯降權。

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
        all_words = set(re.findall(r'\b[a-zA-Z]{4,}\b', code.lower()))
        kw = common_keywords()
        return {w for w in all_words if w not in {k.lower() for k in kw}}

    words_a = extract_nonstandard_words(code_a)
    words_b = extract_nonstandard_words(code_b)

    if not words_a or not words_b:
        return 0.0, []

    # 找共同的「非標準詞」
    shared_unusual = words_a & words_b
    signals: List[str] = []

    # 檢查是否為拼錯的詞
    from difflib import get_close_matches
    shared_typos: List[str] = []
    shared_typo_words: List[str] = []  # raw words for batch lookup
    for word in shared_unusual:
        close = get_close_matches(word, common_correct_words, n=1, cutoff=0.75)
        if close and close[0] != word:
            shared_typos.append(f"{word}（可能是 {close[0]}）")
            shared_typo_words.append(word)

    if shared_typos:
        # --- 稀有度加權 ---
        if batch_codes and len(batch_codes) >= 3:
            # 預計算 batch 中每份代碼的非標準詞
            batch_word_sets = [extract_nonstandard_words(c) for c in batch_codes]
            total_docs = len(batch_word_sets)
            weighted_score = 0.0
            for i, typo_word in enumerate(shared_typo_words):
                docs_containing = sum(
                    1 for ws in batch_word_sets if typo_word in ws
                )
                df_ratio = docs_containing / total_docs

                # 分層衰減: 短詞→普通拼錯(激進衰減); 長詞→高價值拼錯(保守衰減)
                if len(typo_word) >= 8:
                    # 高價值: 多 token 組合拼錯
                    rarity_weight = max(
                        FORENSIC_MIN_WEIGHT_FORENSIC,
                        1.0 - df_ratio * FORENSIC_RARITY_CONSERVATIVE_DECAY,
                    )
                else:
                    # 普通拼錯
                    rarity_weight = max(
                        FORENSIC_MIN_WEIGHT_NOISE,
                        1.0 - df_ratio * FORENSIC_RARITY_AGGRESSIVE_DECAY,
                    )
                weighted_score += 30 * rarity_weight
            score = min(weighted_score, 100)
        else:
            # 無 batch → 原始計分
            score = min(len(shared_typos) * 30, 100)
        signals = shared_typos
    else:
        # 即使沒有拼錯，共享大量「非常規」自定義詞也是信號
        if len(shared_unusual) >= 5:
            score = min(len(shared_unusual) * 8, 60)
            signals = [f"共享 {len(shared_unusual)} 個非常規自定義詞"]
        else:
            score = 0.0

    return score, signals


def detect_dead_code(
    code_a: str,
    code_b: str,
    batch_codes: Optional[List[str]] = None,
) -> Tuple[float, List[str]]:
    """
    死代碼/無用變量檢測 — 強證據（含稀有度加權）。

    分兩層衰減:
    - A. truly common noise (COMMON_DEBUG_STRINGS 中的短串) → 激進衰減
    - B. structured forensic evidence (長注釋塊、具體多 token debug) → 保守衰減

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
            count = len(re.findall(r'\b' + re.escape(var_name) + r'\b', code))
            if count == 1:
                patterns.append(f"unused_var:{var_name}")

        return patterns

    dead_a = find_dead_patterns(code_a)
    dead_b = find_dead_patterns(code_b)

    if not dead_a or not dead_b:
        return 0.0, []

    shared_dead = set(dead_a) & set(dead_b)

    if not shared_dead:
        return 0.0, []

    def _is_common_noise(item: str) -> bool:
        """判斷是否為 truly common noise"""
        kind, content = item.split(":", 1)
        if kind == "debug_print":
            # 內容中所有有意義的詞都在 COMMON_DEBUG_STRINGS 中 → noise
            words = set(re.findall(r'[a-zA-Z]+', content.lower()))
            return bool(words) and words.issubset(COMMON_DEBUG_STRINGS)
        if kind == "unused_var":
            return True  # 未使用變量通常是 noise 級別
        # commented_code 默認為 structured forensic evidence
        return False

    for item in list(shared_dead)[:5]:
        kind, content = item.split(":", 1)
        if kind == "debug_print":
            signals.append(f"相同調試輸出: \"{content}\"")
        elif kind == "commented_code":
            signals.append(f"相同的被注釋代碼: {content}")
        elif kind == "unused_var":
            signals.append(f"相同的未使用變量: {content}")

    # --- 稀有度加權 ---
    if batch_codes and len(batch_codes) >= 3:
        batch_dead_sets = [set(find_dead_patterns(c)) for c in batch_codes]
        total_docs = len(batch_dead_sets)
        weighted_score = 0.0
        for item in shared_dead:
            docs_containing = sum(
                1 for ds in batch_dead_sets if item in ds
            )
            df_ratio = docs_containing / total_docs

            if _is_common_noise(item):
                rarity_weight = max(
                    FORENSIC_MIN_WEIGHT_NOISE,
                    1.0 - df_ratio * FORENSIC_RARITY_AGGRESSIVE_DECAY,
                )
            else:
                # structured forensic evidence → 保守衰減
                rarity_weight = max(
                    FORENSIC_MIN_WEIGHT_FORENSIC,
                    1.0 - df_ratio * FORENSIC_RARITY_CONSERVATIVE_DECAY,
                )
            weighted_score += 25 * rarity_weight
        score = min(weighted_score, 100)
    else:
        score = min(len(shared_dead) * 25, 100)

    return score, signals


def detect_ai_generated(code: str) -> Tuple[float, List[str]]:
    """
    AI 生成代碼特徵檢測。

    Returns:
        (AI 嫌疑度 0-100, 信號列表)
    """
    signals: List[str] = []
    score = 0.0
    lines = code.split('\n')
    non_empty = [l for l in lines if l.strip()]
    if not non_empty:
        return 0.0, []

    # 1) 注釋比例
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

    # 2) 高階語法檢測
    advanced_hits = []
    for pattern, desc in ADVANCED_PATTERNS:
        if re.search(pattern, code):
            advanced_hits.append(desc)
    if advanced_hits:
        score += min(len(advanced_hits) * 10, 35)
        signals.append(f"高階語法: {', '.join(advanced_hits[:4])}")

    # 3) 變量命名過於規範
    identifiers = set(re.findall(r'\b([a-zA-Z_]\w{3,})\b', code))
    kw = common_keywords()
    custom_ids = {i for i in identifiers if i not in kw and i not in {k.lower() for k in kw}}

    if len(custom_ids) >= 4:
        camel = sum(1 for i in custom_ids if re.match(r'^[a-z]+([A-Z][a-z]+)+$', i))
        snake = sum(1 for i in custom_ids if re.match(r'^[a-z]+(_[a-z]+)+$', i))
        best_convention = max(camel, snake)
        convention_ratio = best_convention / len(custom_ids)
        if convention_ratio > 0.8 and best_convention >= 4:
            score += 15
            style = "camelCase" if camel > snake else "snake_case"
            signals.append(f"命名過於規範: {best_convention}/{len(custom_ids)} 個自定義名符合 {style}")

    # 4) 錯誤處理過於完善
    error_handling = len(re.findall(r'\b(try|catch|except|finally)\b', code))
    if error_handling >= 3:
        score += 10
        signals.append(f"過多錯誤處理 ({error_handling} 處)")

    return min(score, 100), signals


def detect_data_flow_similarity(code_a: str, code_b: str) -> float:
    """
    數據流特徵 — 變量生命週期分析。

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
# P1 新檢測維度
# ================================================================

# ---- P1-A: Control-Flow Signature ----

_CF_KEYWORDS = re.compile(
    r'\b(for|while|if|elif|else|try|except|finally|return|break|'
    r'continue|yield|raise|with|switch|case|default|do|catch|throw)\b',
    re.IGNORECASE,
)


def extract_control_flow_signature(code: str) -> List[str]:
    """
    提取控制流骨架序列。

    例如:
        for-if-return  →  ["FOR", "IF", "RETURN"]
        while-if-break →  ["WHILE", "IF", "BREAK"]
        try-except-return → ["TRY", "EXCEPT", "RETURN"]

    Returns: 控制流序列列表
    """
    # 移除注釋和字串
    cleaned = re.sub(r'#[^\n]*', '', code)
    cleaned = re.sub(r'//[^\n]*', '', cleaned)
    cleaned = re.sub(r'/\*.*?\*/', '', cleaned, flags=re.DOTALL)
    cleaned = re.sub(r'"[^"]*"', '""', cleaned)
    cleaned = re.sub(r"'[^']*'", "''", cleaned)

    flow: List[str] = []
    for m in _CF_KEYWORDS.finditer(cleaned):
        flow.append(m.group(1).upper())
    return flow


def control_flow_similarity(code_a: str, code_b: str) -> float:
    """
    控制流簽名相似度（0-100）。

    抗變量名修改、抗插入垃圾代碼。
    用 SequenceMatcher 比較歸一化的控制流序列。
    """
    from difflib import SequenceMatcher

    flow_a = extract_control_flow_signature(code_a)
    flow_b = extract_control_flow_signature(code_b)

    if not flow_a and not flow_b:
        return 0.0
    if not flow_a or not flow_b:
        return 0.0

    matcher = SequenceMatcher(None, flow_a, flow_b, autojunk=False)
    return matcher.ratio() * 100


# ---- P1-B: API/Call Signature ----

_CALL_PATTERN = re.compile(r'\b([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)\s*\(')


def extract_call_signature(code: str) -> List[str]:
    """
    提取函數調用鏈。

    例如:
        sorted(...), len(...), append(...) → ["sorted", "len", "append"]
        requests.get(...).json() → ["requests.get", "json"]

    Returns: 調用序列列表
    """
    # 移除注釋和字串
    cleaned = re.sub(r'#[^\n]*', '', code)
    cleaned = re.sub(r'//[^\n]*', '', cleaned)
    cleaned = re.sub(r'/\*.*?\*/', '', cleaned, flags=re.DOTALL)
    cleaned = re.sub(r'"[^"]*"', '""', cleaned)
    cleaned = re.sub(r"'[^']*'", "''", cleaned)

    calls: List[str] = []
    # 過濾掉語言關鍵字 (if/for/while 等帶括號但不是函數調用)
    kw_set = {
        'if', 'for', 'while', 'elif', 'switch', 'catch',
        'except', 'return', 'not', 'and', 'or',
    }
    for m in _CALL_PATTERN.finditer(cleaned):
        name = m.group(1)
        if name.lower() not in kw_set:
            calls.append(name.lower())
    return calls


def call_signature_similarity(code_a: str, code_b: str) -> float:
    """函數調用鏈相似度（0-100）"""
    from difflib import SequenceMatcher

    calls_a = extract_call_signature(code_a)
    calls_b = extract_call_signature(code_b)

    if not calls_a and not calls_b:
        return 0.0
    if not calls_a or not calls_b:
        return 0.0

    matcher = SequenceMatcher(None, calls_a, calls_b, autojunk=False)
    return matcher.ratio() * 100


# ---- P1-C: Literal/Constant Signature ----


def extract_literal_signature(code: str) -> Dict[str, Set]:
    """
    提取代碼中的字面量特徵。

    - 特殊數字常量（非 COMMON_NUMERIC_LITERALS）
    - 特殊字串常量（非 COMMON_STRING_LITERALS）
    - 特定測試值 / sentinel value

    Returns: {"numbers": set, "strings": set}
    """
    from app.domains.assignment.plagiarism_constants import (
        COMMON_NUMERIC_LITERALS,
        COMMON_STRING_LITERALS,
    )

    # 移除注釋
    cleaned = re.sub(r'#[^\n]*', '', code)
    cleaned = re.sub(r'//[^\n]*', '', cleaned)
    cleaned = re.sub(r'/\*.*?\*/', '', cleaned, flags=re.DOTALL)

    # 提取數字
    numbers = set()
    for m in re.finditer(r'(?<!\w)(-?\d+\.?\d*)\b', cleaned):
        try:
            val = float(m.group(1))
            if val == int(val):
                val = int(val)
            if val not in COMMON_NUMERIC_LITERALS:
                numbers.add(val)
        except ValueError:
            pass

    # 提取字串
    strings = set()
    for m in re.finditer(r'"([^"]*)"', cleaned):
        s = m.group(1)
        if s not in COMMON_STRING_LITERALS and len(s) >= 2:
            strings.add(s)
    for m in re.finditer(r"'([^']*)'", cleaned):
        s = m.group(1)
        if s not in COMMON_STRING_LITERALS and len(s) >= 2:
            strings.add(s)

    return {"numbers": numbers, "strings": strings}


def literal_signature_similarity(
    code_a: str,
    code_b: str,
    batch_codes: Optional[List[str]] = None,
) -> Tuple[float, List[str], int]:
    """
    字面量簽名相似度（0-100）+ 共享字面量列表 + informative count。

    支持 batch 級稀有度加權。
    informative_literal_count 定義: 非 common、在 A/B 中均出現、字串長度 >= 2
    """
    sig_a = extract_literal_signature(code_a)
    sig_b = extract_literal_signature(code_b)

    shared_nums = sig_a["numbers"] & sig_b["numbers"]
    shared_strs = sig_a["strings"] & sig_b["strings"]

    informative_count = len(shared_nums) + len(shared_strs)
    shared_literals: List[str] = []

    if not shared_nums and not shared_strs:
        return 0.0, [], 0

    # 基礎分: 按共享數量
    for n in sorted(shared_nums):
        shared_literals.append(f"數字 {n}")
    for s in sorted(shared_strs)[:5]:
        shared_literals.append(f'字串 "{s}"')

    # 計算分數
    all_nums = sig_a["numbers"] | sig_b["numbers"]
    all_strs = sig_a["strings"] | sig_b["strings"]
    total = max(len(all_nums) + len(all_strs), 1)
    shared_total = len(shared_nums) + len(shared_strs)
    base_score = (shared_total / total) * 100

    # Batch 稀有度加權
    if batch_codes and len(batch_codes) >= 3:
        batch_sigs = [extract_literal_signature(c) for c in batch_codes]
        total_docs = len(batch_sigs)
        weighted = 0.0
        for num in shared_nums:
            docs_with = sum(1 for s in batch_sigs if num in s["numbers"])
            df = docs_with / total_docs
            weighted += max(0.2, 1.0 - df * 2.0)
        for st in shared_strs:
            docs_with = sum(1 for s in batch_sigs if st in s["strings"])
            df = docs_with / total_docs
            weighted += max(0.2, 1.0 - df * 2.0)
        if shared_total > 0:
            avg_weight = weighted / shared_total
            base_score *= avg_weight

    return min(base_score, 100), shared_literals, informative_count


# ================================================================
# 片段級證據輸出
# ================================================================

def extract_code_evidence_blocks(
    raw_a: str,
    raw_b: str,
    tokens_a: List[str],
    tokens_b: List[str],
    skeleton_a: str,
    skeleton_b: str,
    shared_typos: List[str],
    shared_dead: List[str],
    shared_comments: List[str],
    shared_identifiers: Set[str],
) -> List[Dict[str, Any]]:
    """
    提取代碼級別的片段證據，供老師查看。

    約束:
    - 最多 MAX_EVIDENCE_BLOCKS 個 blocks
    - 去重: 同一片段不以不同 type 重複出現; 相鄰 token span 合併
    - 排序: shared_typo > shared_dead_code > shared_rare_identifier
            > token_span_match > shared_comment
    - snippet 截斷至 EVIDENCE_SNIPPET_MAX_CHARS 字符
    - 每個 block 帶 rank 字段

    Returns list of evidence blocks.
    """
    from app.domains.assignment.plagiarism_constants import (
        MAX_EVIDENCE_BLOCKS,
        EVIDENCE_SNIPPET_MAX_CHARS,
    )
    from difflib import SequenceMatcher

    blocks: List[Dict[str, Any]] = []

    def _truncate(s: str) -> str:
        if len(s) > EVIDENCE_SNIPPET_MAX_CHARS:
            return s[:EVIDENCE_SNIPPET_MAX_CHARS] + "..."
        return s

    # 排序優先級映射
    STRENGTH_ORDER = {
        "shared_typo": 0,
        "shared_dead_code": 1,
        "shared_rare_identifier": 2,
        "token_span_match": 3,
        "shared_comment": 4,
    }

    # 1) Shared typos
    for sig in shared_typos:
        blocks.append({
            "type": "shared_typo",
            "description": f"共同拼寫錯誤: {sig}",
            "strength": "strong",
        })

    # 2) Shared dead code
    for sig in shared_dead:
        blocks.append({
            "type": "shared_dead_code",
            "description": sig,
            "strength": "strong",
        })

    # 3) Shared rare identifiers (filter out common keywords)
    kw = common_keywords()
    rare_ids = {i for i in shared_identifiers if i not in kw and len(i) >= 3}
    if rare_ids:
        blocks.append({
            "type": "shared_rare_identifier",
            "description": (
                f"共享罕見自定義名: {', '.join(sorted(rare_ids)[:8])}"
            ),
            "strength": "medium",
        })

    # 4) Token span matches — find longest common subsequences
    if tokens_a and tokens_b:
        matcher = SequenceMatcher(None, tokens_a, tokens_b, autojunk=False)
        for block in matcher.get_matching_blocks():
            if block.size >= 8:  # 至少 8 個連續 token
                span_a = " ".join(tokens_a[block.a:block.a + block.size])
                span_b = " ".join(tokens_b[block.b:block.b + block.size])

                # 估算行號
                prefix_a = " ".join(tokens_a[:block.a])
                prefix_b = " ".join(tokens_b[:block.b])
                line_a_start = raw_a[:len(prefix_a)].count("\n") + 1 if prefix_a else 1
                line_b_start = raw_b[:len(prefix_b)].count("\n") + 1 if prefix_b else 1

                blocks.append({
                    "type": "token_span_match",
                    "description": (
                        f"Token 序列連續匹配 {block.size} 個 token"
                    ),
                    "snippet_a": _truncate(span_a),
                    "snippet_b": _truncate(span_b),
                    "line_a": (line_a_start, line_a_start + block.size // 3),
                    "line_b": (line_b_start, line_b_start + block.size // 3),
                    "strength": "medium" if block.size < 15 else "strong",
                })

    # 5) Shared comments
    for cmt in shared_comments:
        if len(cmt.strip()) > 10:
            blocks.append({
                "type": "shared_comment",
                "description": f"相同注釋片段: \"{_truncate(cmt)}\"",
                "strength": "medium",
            })

    # ---- 去重: 同一 snippet 不重複 ----
    seen_descs: Set[str] = set()
    deduped: List[Dict[str, Any]] = []
    for b in blocks:
        desc_key = b["description"][:80]
        if desc_key not in seen_descs:
            seen_descs.add(desc_key)
            deduped.append(b)
    blocks = deduped

    # ---- 排序（按強度優先級） ----
    blocks.sort(key=lambda b: STRENGTH_ORDER.get(b["type"], 99))

    # ---- 截取最多 MAX_EVIDENCE_BLOCKS ----
    blocks = blocks[:MAX_EVIDENCE_BLOCKS]

    # ---- 添加 rank 字段 ----
    for i, b in enumerate(blocks, 1):
        b["rank"] = i

    return blocks


# ================================================================
# Cohort Suppression（同批次公共模式降權）
# ================================================================

def compute_cohort_suppression(
    raw_a: str,
    raw_b: str,
    batch_texts: List[str],
) -> Dict[str, Any]:
    """
    計算同批次公共模式抑制因子。

    前置過濾：先用 looks_like_code() 過濾 batch_texts，
    僅保留代碼密度足夠的樣本。過濾後樣本 < COHORT_MIN_BATCH_SIZE
    則直接返回不抑制。

    對 4 種特徵做文檔頻率統計，高頻特徵降權（P0 階段）：
    1. skeleton n-grams
    2. token n-grams
    3. import 組合
    4. 常見變量名

    Returns 固定 shape dict（即使被禁用也返回完整結構）：
        {
            "skeleton_suppression": float,    # 0-1, 骨架降權因子
            "identifier_suppression": float,  # 0-1, 標識符降權因子
            "suppressed_patterns": List[str], # 被抑制的公共模式（供 signal）
            "cohort_size": int,               # 過濾後有效代碼樣本數
        }
    """
    from app.domains.assignment.plagiarism_constants import COHORT_MIN_BATCH_SIZE

    NO_SUPPRESSION = {
        "skeleton_suppression": 1.0,
        "identifier_suppression": 1.0,
        "suppressed_patterns": [],
        "cohort_size": 0,
    }

    # 過濾: 僅保留 code-like 樣本
    code_batch = [t for t in batch_texts if looks_like_code(t)]
    if len(code_batch) < COHORT_MIN_BATCH_SIZE:
        NO_SUPPRESSION["cohort_size"] = len(code_batch)
        return NO_SUPPRESSION

    total_docs = len(code_batch)

    # ---- 1. Skeleton n-gram DF 統計 ----
    skel_a = skeletonize(raw_a)
    skel_b = skeletonize(raw_b)

    def _skeleton_ngrams(skeleton: str, ng: int = 3) -> Set[str]:
        tokens = skeleton.split()
        if len(tokens) < ng:
            return set(tokens) if tokens else set()
        return {" ".join(tokens[i:i + ng]) for i in range(len(tokens) - ng + 1)}

    pair_skel_shared = _skeleton_ngrams(skel_a) & _skeleton_ngrams(skel_b)

    if pair_skel_shared:
        batch_skel_sets = [_skeleton_ngrams(skeletonize(c)) for c in code_batch]
        public_count = 0
        suppressed_skel_patterns: List[str] = []
        for gram in pair_skel_shared:
            docs_with = sum(1 for s in batch_skel_sets if gram in s)
            df = docs_with / total_docs
            if df > 0.4:
                public_count += 1
                if len(suppressed_skel_patterns) < 5:
                    suppressed_skel_patterns.append(f"skeleton:{gram[:30]}")
        public_ratio = public_count / len(pair_skel_shared) if pair_skel_shared else 0
        if public_ratio > 0.6:
            skeleton_suppression = 0.5
        elif public_ratio > 0.4:
            skeleton_suppression = 0.7
        elif public_ratio > 0.3:
            skeleton_suppression = 0.85
        else:
            skeleton_suppression = 1.0
    else:
        skeleton_suppression = 1.0
        suppressed_skel_patterns = []

    # ---- 2. Identifier DF 統計 ----
    ids_a = extract_identifiers(raw_a)
    ids_b = extract_identifiers(raw_b)
    pair_id_shared = ids_a & ids_b

    if pair_id_shared:
        batch_id_sets = [extract_identifiers(c) for c in code_batch]
        public_id_count = 0
        suppressed_id_patterns: List[str] = []
        for ident in pair_id_shared:
            docs_with = sum(1 for s in batch_id_sets if ident in s)
            df = docs_with / total_docs
            if df > 0.4:
                public_id_count += 1
                if len(suppressed_id_patterns) < 5:
                    suppressed_id_patterns.append(f"identifier:{ident}")
        public_ratio = public_id_count / len(pair_id_shared) if pair_id_shared else 0
        if public_ratio > 0.6:
            identifier_suppression = 0.5
        elif public_ratio > 0.4:
            identifier_suppression = 0.7
        elif public_ratio > 0.3:
            identifier_suppression = 0.85
        else:
            identifier_suppression = 1.0
    else:
        identifier_suppression = 1.0
        suppressed_id_patterns = []

    suppressed_patterns = suppressed_skel_patterns + suppressed_id_patterns

    return {
        "skeleton_suppression": skeleton_suppression,
        "identifier_suppression": identifier_suppression,
        "suppressed_patterns": suppressed_patterns,
        "cohort_size": total_docs,
    }


# ================================================================
# 編排函數
# ================================================================

def compute_code_similarity(
    raw_a: str,
    raw_b: str,
    clean_a: str,
    clean_b: str,
    n: int,
    batch_texts: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    代碼感知相似度: 多維度分析 + Winnowing 指紋 + 非邏輯特徵。

    Returns unified dict per the schema spec.
    """
    signals: List[str] = []

    # ---- 1) Winnowing 指紋（MOSS 核心）----
    tokens_a = tokenize_code(raw_a)
    tokens_b = tokenize_code(raw_b)
    winnow_score = winnowing_similarity(tokens_a, tokens_b)
    token_seq_score = token_sequence_similarity(tokens_a, tokens_b)

    if winnow_score > 80:
        signals.append(f"Winnowing 指紋高度匹配: {winnow_score:.0f}%（抗混淆結構相同）")
    elif winnow_score > 60:
        signals.append(f"Winnowing 指紋中度匹配: {winnow_score:.0f}%")

    # ---- 2) 骨架化 N-gram ----
    skeleton_a = skeletonize(raw_a)
    skeleton_b = skeletonize(raw_b)
    skeleton_score = ngram_jaccard(skeleton_a, skeleton_b, n)
    # 注意: structure_score 延後到 cohort suppression 之後計算

    # ---- 3) 數據流分析 ----
    data_flow_score = detect_data_flow_similarity(raw_a, raw_b)
    if data_flow_score > 80:
        signals.append(f"數據流模式高度相似: {data_flow_score:.0f}%（變量生命週期一致）")

    # ---- 4) 標識符指紋 ----
    ids_a = extract_identifiers(raw_a)
    ids_b = extract_identifiers(raw_b)
    common_kw = common_keywords()

    unique_ids_a = ids_a - common_kw
    unique_ids_b = ids_b - common_kw
    base_id_score = set_overlap(ids_a, ids_b)

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

    # ---- Cohort Suppression（作用於 raw sub-dimensions）----
    # 命名規範: _raw → 原始分, 抑制後直接覆蓋 skeleton_score / identifier_score
    cohort_result: Optional[Dict[str, Any]] = None
    if batch_texts and len(batch_texts) >= 3:
        cohort_result = compute_cohort_suppression(raw_a, raw_b, batch_texts)
        skeleton_score *= cohort_result["skeleton_suppression"]
        identifier_score *= cohort_result["identifier_suppression"]
        if cohort_result["suppressed_patterns"]:
            signals.append(
                f"同批次公共模式降權: "
                f"{len(cohort_result['suppressed_patterns'])} 個模式被抑制"
            )

    # ---- P1-B: Call Signature → identifier_score ----
    call_sig_score = call_signature_similarity(raw_a, raw_b)
    identifier_score_raw = identifier_score  # 保存抑制後但折入前的值
    identifier_score = identifier_score_raw * 0.70 + call_sig_score * 0.30
    if call_sig_score >= 60:
        signals.append(
            f"函數調用鏈高度相似: {call_sig_score:.0f}%"
        )

    # ---- P1-A: Control-Flow Signature → structure_score ----
    cf_score = control_flow_similarity(raw_a, raw_b)
    if cf_score >= 65:
        signals.append(f"控制流骨架高度相似: {cf_score:.0f}%")

    # 計算 structure_score（含 P1-A control_flow + 抑制後的 skeleton）
    # data_flow 留在 logic_score 層，不進 structure_score
    structure_score = (
        winnow_score * 0.40
        + skeleton_score * 0.20
        + token_seq_score * 0.15
        + cf_score * 0.25
    )

    # ---- 5) 逐字複製 ----
    verbatim_sc = verbatim_ratio(clean_a, clean_b)

    # ---- 6) 縮排指紋 ----
    indent_score = indent_fingerprint_similarity(raw_a, raw_b)
    if indent_score > 85:
        signals.append("縮排習慣高度相似（tab/空格、深度模式一致）")
    elif indent_score > 70:
        signals.append("縮排習慣中度相似")

    # ---- 7) 拼寫錯誤模式 ----
    typo_score, typo_signals = detect_shared_typos(
        raw_a, raw_b, batch_codes=batch_texts,
    )
    if typo_score > 0:
        signals.extend([f"共享拼錯: {s}" for s in typo_signals[:3]])

    # ---- 8) 死代碼/調試痕跡 ----
    dead_code_score, dead_signals = detect_dead_code(
        raw_a, raw_b, batch_codes=batch_texts,
    )
    if dead_code_score > 0:
        signals.extend(dead_signals[:3])

    # ---- 9) 注釋/字串 ----
    comments_a = extract_comments_and_strings(raw_a)
    comments_b = extract_comments_and_strings(raw_b)
    if comments_a and comments_b:
        comment_score = ngram_jaccard(
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

    # ---- P1-C: Literal/Constant Signature → comment_score ----
    literal_sig_score, shared_literals, informative_literal_count = (
        literal_signature_similarity(raw_a, raw_b, batch_codes=batch_texts)
    )
    # 可靠性門檻: 有效罕見 literal 不足 3 個時降低貢獻
    lit_weight = 0.40 if informative_literal_count >= 3 else 0.15
    comment_score_raw = comment_score  # 保存折入前的值
    comment_score = comment_score_raw * (1.0 - lit_weight) + literal_sig_score * lit_weight
    if literal_sig_score >= 60:
        signals.append(
            f"共享特殊字面量: {', '.join(shared_literals[:4])}"
        )

    # ---- 10) AI 生成代碼嫌疑（獨立標籤，不參與加權總分） ----
    ai_a_score, ai_a_sig = detect_ai_generated(raw_a)
    ai_b_score, ai_b_sig = detect_ai_generated(raw_b)
    ai_score = max(ai_a_score, ai_b_score)

    # 5-state pair-level AI label
    AI_LABEL_THRESHOLD = 40
    if ai_a_score >= AI_LABEL_THRESHOLD and ai_b_score >= AI_LABEL_THRESHOLD:
        _ai_label = "both_likely_ai"
    elif ai_a_score >= AI_LABEL_THRESHOLD:
        _ai_label = "only_a_likely_ai"
    elif ai_b_score >= AI_LABEL_THRESHOLD:
        _ai_label = "only_b_likely_ai"
    elif ai_a_score >= 20 or ai_b_score >= 20:
        _ai_label = "indeterminate"
    else:
        _ai_label = "both_unlikely_ai"

    if ai_score >= 40:
        signals.append(f"AI 生成嫌疑: {', '.join((ai_a_sig or ai_b_sig)[:3])}")

    # ---- 長度自適應: 短代碼壓低結構分 ----
    code_len = min(len(clean_a), len(clean_b))
    if code_len < TINY_CODE_THRESHOLD:
        structure_score *= 0.3
        signals.append("極短代碼（結構分大幅降權，重點看命名和縮排）")
    elif code_len < SHORT_CODE_THRESHOLD:
        structure_score *= 0.5
        signals.append("短代碼（結構分已降權）")
    elif code_len < MEDIUM_CODE_THRESHOLD:
        structure_score *= 0.8

    # ---- 強證據加成 ----
    if typo_score > 0 or dead_code_score > 0:
        forensic_bonus = max(typo_score, dead_code_score)
        comment_score = max(comment_score, forensic_bonus)

    # ---- 片段級證據輸出 ----
    shared_comments_for_evidence = list(
        (set(comments_a) & set(comments_b))
        if comments_a and comments_b else set()
    )
    shared_ids_for_evidence = (
        (extract_identifiers(raw_a) & extract_identifiers(raw_b))
        - common_keywords()
    )
    evidence_blocks = extract_code_evidence_blocks(
        raw_a=raw_a,
        raw_b=raw_b,
        tokens_a=tokens_a,
        tokens_b=tokens_b,
        skeleton_a=skeleton_a,
        skeleton_b=skeleton_b,
        shared_typos=typo_signals,
        shared_dead=dead_signals,
        shared_comments=shared_comments_for_evidence,
        shared_identifiers=shared_ids_for_evidence,
    )

    return {
        "structure_score": min(structure_score, 100),
        "identifier_score": min(identifier_score, 100),
        "verbatim_score": min(verbatim_sc, 100),
        "indent_score": min(indent_score, 100),
        "comment_score": min(comment_score, 100),
        "signals": signals,
        # 代碼模式專用
        "data_flow_score": min(data_flow_score, 100),
        "winnow_score": min(winnow_score, 100),
        "typo_score": min(typo_score, 100),
        "dead_code_score": min(dead_code_score, 100),
        "ai_suspicion": min(ai_score, 100),
        "_ai_label": _ai_label,
        "_ai_score_a": round(ai_a_score, 1),
        "_ai_score_b": round(ai_b_score, 1),
        # Cohort suppression 可解釋性（僅供展示，service 不二次計算）
        "_cohort_skeleton_suppression": (
            cohort_result["skeleton_suppression"] if cohort_result else 1.0
        ),
        "_cohort_identifier_suppression": (
            cohort_result["identifier_suppression"] if cohort_result else 1.0
        ),
        "_cohort_suppressed_patterns": (
            cohort_result["suppressed_patterns"] if cohort_result else []
        ),
        "_cohort_size": (
            cohort_result["cohort_size"] if cohort_result else 0
        ),
        "_evidence_blocks": evidence_blocks,
        # P1 中間字段
        "_control_flow_score": round(min(cf_score, 100), 1),
        "_call_sig_score": round(min(call_sig_score, 100), 1),
        "_literal_sig_score": round(min(literal_sig_score, 100), 1),
        # 作文模式佔位（統一 schema）
        "_opening_sim": 0.0,
        "_ending_sim": 0.0,
        "_aligned_pairs": [],
        "_span_coverage": {},
        "_rare_phrases": [],
        "_rare_phrase_score": 0.0,
        "_risk_type": {},
        "_warnings": [],
    }


def compute_text_similarity(
    clean_a: str,
    clean_b: str,
    n: int,
) -> Dict[str, Any]:
    """
    非代碼文本（文檔/報告）的相似度: 結構和逐字為主。

    Returns unified dict per the schema spec.
    """
    structure_score = ngram_jaccard(clean_a, clean_b, n)
    verbatim_sc = verbatim_ratio(clean_a, clean_b)

    return {
        "structure_score": min(structure_score, 100),
        "identifier_score": structure_score * 0.8,  # 文本無標識符概念
        "verbatim_score": min(verbatim_sc, 100),
        "indent_score": 0.0,  # 文本不適用縮排分析
        "comment_score": structure_score * 0.5,
        "signals": [],
        # 代碼模式佔位（統一 schema）
        "data_flow_score": 0.0,
        "winnow_score": 0.0,
        "typo_score": 0.0,
        "dead_code_score": 0.0,
        "ai_suspicion": 0.0,
        # 作文模式佔位（統一 schema）
        "_opening_sim": 0.0,
        "_ending_sim": 0.0,
        "_aligned_pairs": [],
        "_span_coverage": {},
        "_rare_phrases": [],
        "_rare_phrase_score": 0.0,
        "_risk_type": {},
        "_warnings": [],
    }
