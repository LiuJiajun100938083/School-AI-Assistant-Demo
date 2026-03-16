"""
LLM 調用與 JSON 解析 — 基礎設施
=================================
從 MistakeBookService 提取的通用 LLM 調用能力。
純函數，無狀態，無域依賴。

依賴：ai_gate（core 層）、llm.config（配置層）
"""

import json
import logging
import re
from typing import Dict

logger = logging.getLogger(__name__)


# ================================================================
# LLM 調用
# ================================================================

async def call_ollama_json(
    prompt: str,
    model: str = None,
    temperature: float = 0.3,
    timeout: float = 300.0,
    gate_task: str = "ai_pipeline",
    gate_priority=None,
    gate_weight=None,
    num_predict: int = 8192,
) -> str:
    """
    調用 Ollama API（JSON 模式），返回原始 content 字串。

    繞過 langchain 60s 超時限制，直接使用 /api/chat 端點。
    透過 ai_gate 進行 GPU 調度，防止並發過載。

    Args:
        prompt: 用戶 prompt
        model: 指定模型，None 則用全局配置
        temperature: 生成溫度，出題建議 0.7-0.8
        timeout: 超時秒數
        gate_task: ai_gate 任務名稱
        gate_priority: ai_gate 優先級，None 則用 INTERACTIVE
        gate_weight: ai_gate 權重，None 則用 ANALYSIS
    """
    import httpx
    from app.core.ai_gate import ai_gate, Priority, Weight

    # 從全局 LLM 配置獲取模型和 URL
    try:
        from llm.config import get_llm_config
        config = get_llm_config()
        resolved_model = config.local_model
        base_url = config.local_base_url
    except Exception:
        resolved_model = "qwen3.5:35b"
        base_url = "http://localhost:11434"

    if model:
        resolved_model = model

    payload = {
        "model": resolved_model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are an expert teacher. You MUST respond with valid JSON only. "
                    "No explanations, no reasoning, no markdown — just a single JSON object."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "stream": False,
        "think": False,
        "format": "json",
        "options": {
            "temperature": temperature,
            "num_predict": num_predict,
        },
    }

    http_timeout = httpx.Timeout(timeout, connect=10.0)
    priority = gate_priority or Priority.INTERACTIVE
    weight = gate_weight or Weight.ANALYSIS

    async with ai_gate(gate_task, priority, weight) as client:
        response = await client.post("/api/chat", json=payload, timeout=http_timeout)
        response.raise_for_status()
        data = response.json()

    msg = data.get("message", {})
    content = msg.get("content", "")
    thinking = msg.get("thinking", "")

    # 修復 JSON 解析對 LaTeX 命令的損壞
    content = repair_latex_json(content)

    # 移除 thinking 標籤
    content = re.sub(r"<think>[\s\S]*?</think>", "", content, flags=re.DOTALL).strip()

    # content 為空但 thinking 字段有內容，使用 thinking
    if not content and thinking:
        logger.info("Ollama content 為空，使用 thinking 字段 (len=%d)", len(thinking))
        content = re.sub(r"<think>[\s\S]*?</think>", "", thinking, flags=re.DOTALL).strip()
        if not content:
            content = thinking.strip()

    # 最終清理殘留的 think 標籤
    content = re.sub(r"</?think>", "", content).strip()

    logger.info(
        "Ollama 調用成功: task=%s, model=%s, content_len=%d, thinking_len=%d",
        gate_task, resolved_model, len(content), len(thinking),
    )
    return content


# ================================================================
# LaTeX 修復
# ================================================================

def repair_latex_json(text: str) -> str:
    """
    修復外層 JSON 解析對 LaTeX 命令的損壞。

    問題：Ollama API 返回的 JSON 中，LaTeX 反斜線序列被 response.json() 解析為控制字符：
      \\times → \\t(TAB) + "imes"
      \\text  → \\t(TAB) + "ext"
      \\frac  → \\f(FF)  + "rac"
      \\bar   → \\b(BS)  + "ar"
      \\right → \\r(CR)  + "ight"
    """
    repairs = [
        ('\t', 't'),    # \times, \text, \theta, \tan, \tau, \triangle, \top
        ('\x08', 'b'),  # \bar, \binom, \begin, \beta, \boldsymbol, \bmod
        ('\f', 'f'),    # \frac, \forall, \flat
        ('\r', 'r'),    # \right, \rangle, \rho, \rightarrow, \rm
        ('\n', 'n'),    # \newcommand, \ne, \neq, \neg, \nu, \nabla
    ]
    for ctrl, letter in repairs:
        text = re.sub(
            re.escape(ctrl) + r'([a-zA-Z]{2,})',
            '\\\\' + letter + r'\1',
            text,
        )
    return text


# ================================================================
# JSON 解析（多級容錯）
# ================================================================

def parse_questions_json(raw: str) -> Dict:
    """
    解析 LLM 返回的 JSON（多級容錯，處理 LaTeX 反斜槓衝突）。

    解析策略：
    1. 移除 thinking 標籤 + markdown 代碼塊
    2. 提取最外層 {} 對象
    3. 修復 LaTeX 轉義後 json.loads
    4. 全部反斜槓雙重轉義（更激進）
    5. 正則找最大 JSON 塊
    """
    if not raw:
        return {}

    text = raw.strip()

    # 移除 thinking 標籤
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()

    # 提取 JSON（移除 markdown 代碼塊包裹）
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        parts = text.split("```")
        if len(parts) >= 3:
            text = parts[1].strip()

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        text = text[start:end + 1]

    def _fix_latex_escapes(s: str) -> str:
        """將 LaTeX 反斜槓命令雙重轉義，避免與 JSON 標準轉義衝突。"""
        def _replace(m: re.Match) -> str:
            seq = m.group(1)
            if len(seq) > 1:
                return '\\\\' + seq  # LaTeX 命令：雙重轉義
            return m.group(0)  # 單字符：保留原樣

        return re.sub(r'(?<!\\)\\([a-zA-Z]+)', _replace, s)

    # 第一次：修復 LaTeX 轉義後解析
    fixed = _fix_latex_escapes(text)
    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass

    # 第二次：全部反斜槓雙重轉義
    try:
        return json.loads(text.replace('\\', '\\\\'))
    except json.JSONDecodeError:
        pass

    # 第三次：正則找最大 JSON 對象
    json_blocks = re.findall(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', text, re.DOTALL)
    for block in sorted(json_blocks, key=len, reverse=True):
        for attempt in [_fix_latex_escapes(block), block.replace('\\', '\\\\')]:
            try:
                parsed = json.loads(attempt)
                if isinstance(parsed, dict) and len(parsed) >= 2:
                    logger.info("正則提取 JSON 成功: %d 個字段", len(parsed))
                    return parsed
            except json.JSONDecodeError:
                continue

    logger.warning("JSON 解析全部失敗: %s", text[:200])
    return {}
