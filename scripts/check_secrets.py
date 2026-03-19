#!/usr/bin/env python3
"""
Git Pre-commit Hook — 密鑰洩漏掃描
====================================
掃描 staged 文件，檢測可能的 API Key / Secret 洩漏。

安裝方式（在項目根目錄執行）:
    ln -sf ../../scripts/check_secrets.py .git/hooks/pre-commit
    chmod +x scripts/check_secrets.py
"""

import re
import subprocess
import sys
import math

# ── 配置 ──

# 永遠跳過的文件模式（這些文件本身就是密鑰/配置，不該被 staged）
SKIP_PATTERNS = {
    ".env", ".env.", ".encryption_key", ".key",
    "jwt_secret.key", "private_key.pem",
    # 本腳本自身
    "check_secrets.py",
    # 編譯產物
    ".pyc", "__pycache__",
    # 二進制 / 圖片
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".ttf",
    ".pdf", ".xlsx", ".docx", ".pptx", ".zip", ".gz", ".tar",
}

# 已知的 API Key 前綴模式（不分大小寫）
KEY_PREFIX_PATTERNS = [
    re.compile(r'sk-[a-zA-Z0-9]{20,}'),                          # OpenAI, DeepSeek
    re.compile(r'sk-ant-[a-zA-Z0-9\-]{20,}'),                    # Anthropic
    re.compile(r'key-[a-zA-Z0-9]{20,}'),                         # 通用
    re.compile(r'ghp_[a-zA-Z0-9]{36,}'),                         # GitHub PAT
    re.compile(r'gho_[a-zA-Z0-9]{36,}'),                         # GitHub OAuth
    re.compile(r'glpat-[a-zA-Z0-9\-]{20,}'),                     # GitLab PAT
    re.compile(r'AKIA[A-Z0-9]{16}'),                              # AWS Access Key
    re.compile(r'xox[bpsa]-[a-zA-Z0-9\-]{10,}'),                 # Slack tokens
]

# 賦值語句中的可疑模式（排除 masked 值如 "XXX****XXXX"）
ASSIGNMENT_PATTERNS = [
    # api_key = "actual_value" 或 api_key: "actual_value"
    # 值必須是 ASCII 字母/數字/符號（排除含空格或 CJK 的描述文字）
    re.compile(
        r'''(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token|bearer)\s*[=:]\s*["']([a-zA-Z0-9\-_./+=%]{8,})["']''',
        re.IGNORECASE,
    ),
    # Authorization: Bearer <token>（非變數引用）
    re.compile(
        r'''Bearer\s+(?![\$\{f"])([a-zA-Z0-9\-_.]{20,})''',
    ),
]

# Shannon 熵閾值：超過此值的長字符串可能是密鑰
ENTROPY_THRESHOLD = 4.5
ENTROPY_MIN_LENGTH = 20


def should_skip(filepath: str) -> bool:
    """判斷文件是否應跳過"""
    for pattern in SKIP_PATTERNS:
        if pattern in filepath:
            return True
    return False


def shannon_entropy(s: str) -> float:
    """計算字符串的 Shannon 熵"""
    if not s:
        return 0.0
    freq = {}
    for c in s:
        freq[c] = freq.get(c, 0) + 1
    length = len(s)
    return -sum((count / length) * math.log2(count / length) for count in freq.values())


def check_high_entropy_strings(line: str) -> list:
    """檢測行中的高熵字符串（可能是密鑰）"""
    findings = []
    # 提取引號內的字符串
    for match in re.finditer(r'["\']([\w\-+/=.]{20,})["\']', line):
        candidate = match.group(1)
        # 跳過常見的非密鑰模式
        if candidate.startswith(("http", "https", "/api/", "/static/")):
            continue
        if "*" in candidate:  # masked 值
            continue
        if shannon_entropy(candidate) > ENTROPY_THRESHOLD:
            findings.append(f"高熵字符串: {candidate[:20]}...")
    return findings


def scan_file_content(filepath: str, content: str) -> list:
    """掃描文件內容，返回所有發現的問題"""
    issues = []

    for line_num, line in enumerate(content.splitlines(), 1):
        stripped = line.strip()
        # 跳過註釋行
        if stripped.startswith(("#", "//", "/*", "*", "<!--")):
            continue

        # 1. 已知 Key 前綴
        for pattern in KEY_PREFIX_PATTERNS:
            match = pattern.search(line)
            if match:
                issues.append(
                    f"  {filepath}:{line_num}  可能的 API Key: {match.group()[:16]}..."
                )

        # 2. 賦值語句中的可疑值
        for pattern in ASSIGNMENT_PATTERNS:
            match = pattern.search(line)
            if match:
                val = match.group(1) if match.lastindex else match.group()
                # 排除變數引用、佔位符
                if not any(x in val for x in ("${", "os.getenv", "environ", "config.", "****")):
                    issues.append(
                        f"  {filepath}:{line_num}  可疑賦值: {val[:20]}..."
                    )

        # 3. 高熵字符串
        for finding in check_high_entropy_strings(line):
            issues.append(f"  {filepath}:{line_num}  {finding}")

    return issues


def main():
    """主入口：掃描 git staged 文件"""
    # 獲取 staged 文件列表
    try:
        result = subprocess.run(
            ["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"],
            capture_output=True, text=True, check=True,
        )
    except subprocess.CalledProcessError:
        # 非 git 環境或其他錯誤，放行
        sys.exit(0)

    files = [f.strip() for f in result.stdout.splitlines() if f.strip()]
    if not files:
        sys.exit(0)

    all_issues = []

    for filepath in files:
        if should_skip(filepath):
            continue

        # 讀取 staged 版本的內容（不是工作目錄的版本）
        try:
            content_result = subprocess.run(
                ["git", "show", f":{filepath}"],
                capture_output=True, text=True, check=True,
            )
            content = content_result.stdout
        except subprocess.CalledProcessError:
            continue

        issues = scan_file_content(filepath, content)
        all_issues.extend(issues)

    if all_issues:
        print("\n" + "=" * 60)
        print("🔐 密鑰洩漏掃描 — 發現可疑內容！")
        print("=" * 60)
        for issue in all_issues:
            print(issue)
        print()
        print("如果確認這些不是真正的密鑰，可以用以下方式跳過：")
        print("  git commit --no-verify")
        print("=" * 60 + "\n")
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
