"""
LLM 調用與 JSON 解析 — 基礎設施
=================================
統一 LLM 調用能力，支持本地 Ollama 和雲端 DeepSeek。
純函數，無狀態，無域依賴。

Provider 架構：
- call_llm_json()：統一入口，根據 provider 分發
- _call_ollama()：本地 Ollama，走 ai_gate GPU 調度
- _call_deepseek()：雲端 DeepSeek，走輕量並發控制

依賴：ai_gate（core 層）、llm.config（配置層）
"""

import asyncio
import json
import logging
import re
from typing import Dict

logger = logging.getLogger(__name__)

# 雲端 API 輕量並發控制（不走 ai_gate，獨立限流）
_cloud_semaphore = asyncio.Semaphore(3)


# ================================================================
# 共用常量
# ================================================================

_SYSTEM_PROMPT = (
    "You are an expert teacher. You MUST respond with valid JSON only. "
    "No explanations, no reasoning, no markdown — just a single JSON object. "
    "When writing solution steps (correct_answer), output CLEAN standard solutions "
    "like a textbook. NEVER include self-talk, backtracking, or exploratory reasoning "
    "like '不，應該是…' or '讓我們換個角度' in any JSON field value. "
    "NEVER include problem verification, condition checking, problem redesign, "
    "or any meta-commentary like '檢查題目條件', '重新設計題目', '修正條件' in any field. "
    "Output ONLY the final, clean question and solution — no drafts, no revisions."
)


# ================================================================
# 統一入口
# ================================================================

async def call_llm_json(
    prompt: str,
    provider: str = "local",
    model: str = None,
    temperature: float = 0.3,
    timeout: float = 300.0,
    gate_task: str = "ai_pipeline",
    gate_priority=None,
    gate_weight=None,
    num_predict: int = 8192,
) -> tuple:
    """
    統一 LLM 調用入口，根據 provider 分發到不同後端。

    Returns:
        tuple[str, dict]: (content, usage)
        - content: LLM 回應內容
        - usage: token 用量字典（DeepSeek 提供；Ollama 為空字典）
          {"prompt_tokens": int, "completion_tokens": int, "total_tokens": int}

    Args:
        prompt: 用戶 prompt
        provider: "local"（Ollama）或 "deepseek"（雲端 API）
        model: 指定模型，None 則用各 provider 的默認配置
        temperature: 生成溫度
        timeout: 超時秒數
        gate_task: ai_gate 任務名稱（僅 local 使用）
        gate_priority: ai_gate 優先級（僅 local 使用）
        gate_weight: ai_gate 權重（僅 local 使用）
        num_predict: 最大生成 token 數
    """
    usage = {}

    if provider == "deepseek":
        content, usage = await _call_deepseek(
            prompt, model=model, temperature=temperature,
            timeout=timeout, num_predict=num_predict,
        )
    else:
        content = await _call_ollama(
            prompt, model=model, temperature=temperature,
            timeout=timeout, num_predict=num_predict,
            gate_task=gate_task, gate_priority=gate_priority,
            gate_weight=gate_weight,
        )

    # 共用後處理
    content = _postprocess_content(content)
    return content, usage


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
    """向後兼容入口，轉發到 call_llm_json(provider='local')，只返回 content。"""
    content, _usage = await call_llm_json(
        prompt, provider="local", model=model,
        temperature=temperature, timeout=timeout,
        gate_task=gate_task, gate_priority=gate_priority,
        gate_weight=gate_weight, num_predict=num_predict,
    )
    return content


# ================================================================
# Provider: 本地 Ollama
# ================================================================

async def _call_ollama(
    prompt: str,
    model: str = None,
    temperature: float = 0.3,
    timeout: float = 300.0,
    num_predict: int = 8192,
    gate_task: str = "ai_pipeline",
    gate_priority=None,
    gate_weight=None,
) -> str:
    """調用 Ollama API（JSON 模式），透過 ai_gate 進行 GPU 調度。"""
    import httpx
    from app.core.ai_gate import ai_gate, Priority, Weight

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
            {"role": "system", "content": _SYSTEM_PROMPT},
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

    # Ollama 特有：content 為空但 thinking 字段有內容
    if not content and thinking:
        logger.info("Ollama content 為空，使用 thinking 字段 (len=%d)", len(thinking))
        content = re.sub(r"<think>[\s\S]*?</think>", "", thinking, flags=re.DOTALL).strip()
        if not content:
            content = thinking.strip()

    logger.info(
        "LLM 調用成功: provider=local, task=%s, model=%s, content_len=%d",
        gate_task, resolved_model, len(content),
    )
    return content


# ================================================================
# Provider: DeepSeek 雲端 API
# ================================================================

async def _call_deepseek(
    prompt: str,
    model: str = None,
    temperature: float = 0.3,
    timeout: float = 120.0,
    num_predict: int = 8192,
) -> tuple:
    """
    調用 DeepSeek API（OpenAI-compatible），返回 (content, usage)。

    Returns:
        tuple[str, dict]: (content 字串, usage 字典)

    使用 deepseek-reasoner 模型啟用 thinking/reasoning 模式：
    - 回應包含 reasoning_content（思考鏈）和 content（最終答案）
    - 只取 content 作為結果，reasoning_content 被丟棄
    - thinking 模式下 temperature/top_p 無效（API 會忽略）

    不走 ai_gate（雲端不佔本地 GPU），使用獨立 Semaphore 限流。
    """
    import httpx

    from llm.config import get_llm_config
    config = get_llm_config()

    resolved_model = model or config.api_model
    base_url = config.api_base_url
    api_key = config.api_key

    if not api_key:
        raise ValueError("DeepSeek API key 未配置（請在後台管理 → 系統設定中配置）")

    payload = {
        "model": resolved_model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": num_predict,
        "response_format": {"type": "json_object"},
    }

    # deepseek-reasoner 原生支持 thinking；
    # deepseek-chat 則需要顯式啟用 thinking 參數
    if resolved_model != "deepseek-reasoner":
        payload["thinking"] = {"type": "enabled"}
        # 非 reasoner 模型可設置 temperature
        payload["temperature"] = temperature

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    http_timeout = httpx.Timeout(timeout, connect=10.0)

    async with _cloud_semaphore:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{base_url}/chat/completions",
                json=payload,
                headers=headers,
                timeout=http_timeout,
            )
            response.raise_for_status()
            data = response.json()

    message = data["choices"][0]["message"]
    content = message.get("content", "")
    reasoning = message.get("reasoning_content", "")
    usage = data.get("usage", {})

    logger.info(
        "LLM 調用成功: provider=deepseek, model=%s, "
        "reasoning_len=%d, content_len=%d, tokens=%s",
        resolved_model, len(reasoning) if reasoning else 0, len(content),
        usage.get("total_tokens", "N/A"),
    )

    # 只返回 content（最終答案），丟棄 reasoning_content（思考鏈）
    # 如果 content 為空但 reasoning 有內容，嘗試從 reasoning 提取 JSON
    if not content and reasoning:
        logger.warning(
            "DeepSeek content 為空，嘗試從 reasoning_content 提取 (len=%d)",
            len(reasoning),
        )
        content = reasoning

    return content, usage


# ================================================================
# 共用後處理
# ================================================================

def _postprocess_content(content: str) -> str:
    """LaTeX 修復 + thinking 標籤清理。"""
    # 修復 JSON 解析對 LaTeX 命令的損壞
    content = repair_latex_json(content)

    # 移除 thinking 標籤
    content = re.sub(r"<think>[\s\S]*?</think>", "", content, flags=re.DOTALL).strip()

    # 最終清理殘留的 think 標籤
    content = re.sub(r"</?think>", "", content).strip()

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
