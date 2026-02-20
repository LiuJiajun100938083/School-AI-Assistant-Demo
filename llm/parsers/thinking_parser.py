# llm/parsers/thinking_parser.py
"""
LLM 響應解析器
支持解析思考模式的輸出，分離思考過程和最終答案

包含：
- parse_llm_response(): 批量解析完整響應
- StreamingThinkingParser: 有狀態的增量流式解析器
- StreamEvent: 流式事件數據類
"""

import re
import logging
from dataclasses import dataclass
from typing import Tuple, List

logger = logging.getLogger(__name__)

# 特殊標記列表
SPECIAL_MARKERS = [
    "<｜end▁of▁sentence｜>",
    "<｜Assistant｜>",
    "<｜User｜>",
    "<|im_start|>",
    "<|im_end|>",
    "<|endoftext|>",
]

# 思考指示詞
THINKING_INDICATORS = [
    "首先，我需要",
    "讓我思考",
    "讓我分析",
    "我需要先",
    "我來分析",
    "我需要從",
    "讓我先",
    "好的，讓我",
    "嗯，讓我",
    "首先，讓我",
    "首先，我來",
    "首先，我會",
    "首先，我会",
]

# 回答指示詞
ANSWER_INDICATORS = [
    "\n\n綜上所述",
    "\n\n综上所述",
    "\n\n所以，",
    "\n\n因此，",
    "\n\n總結：",
    "\n\n总结：",
    "\n\n根據以上分析",
    "\n\n根据以上分析",
    "\n\n答案是",
    "\n\n答案：",
    "\n\n回答：",
    "\n\n---\n",
    "\n\n**答案**",
    "\n\n**回答**",
    "\n\n## 回答",
    "\n\n## 答案",
]


def clean_special_markers(text: str) -> str:
    """清理特殊標記"""
    for marker in SPECIAL_MARKERS:
        text = text.replace(marker, "")
    return text.strip()


def parse_llm_response(response_text: str) -> Tuple[str, str]:
    """
    解析 LLM 的響應格式，分離思考過程和回答內容

    支持多種思考模式格式：
    1. <think>...</think> (完整標籤對)
    2. 只有 </think> 結束標籤 (Qwen3 特有格式)
    3. <thinking>...</thinking> (替代格式)
    4. 無標籤但有明顯思考過程的文本

    Args:
        response_text: LLM 原始響應

    Returns:
        (answer, thinking) 元組
    """
    if not response_text:
        return "", ""

    thinking_content = ""
    answer_content = response_text

    # 1. 檢查 Qwen3 格式：只有 </think> 結束標籤
    if "</think>" in response_text.lower() and "<think>" not in response_text.lower():
        think_end_pattern = re.compile(r'</think>', re.IGNORECASE)
        think_end_match = think_end_pattern.search(response_text)
        if think_end_match:
            end_pos = think_end_match.start()
            thinking_content = response_text[:end_pos].strip()
            answer_content = response_text[think_end_match.end():].strip()
            logger.debug(f"✅ 解析到 Qwen3 格式（只有 </think>），思考內容長度: {len(thinking_content)}")

    # 2. 檢查完整的 <think>...</think> 格式
    elif "<think>" in response_text.lower() and "</think>" in response_text.lower():
        think_pattern = re.compile(r'<think>(.*?)</think>', re.DOTALL | re.IGNORECASE)
        think_match = think_pattern.search(response_text)
        if think_match:
            thinking_content = think_match.group(1).strip()
            answer_content = think_pattern.sub('', response_text).strip()
            logger.debug(f"✅ 解析到完整 <think> 標籤對，思考內容長度: {len(thinking_content)}")

    # 3. 檢查 <thinking>...</thinking> 格式
    else:
        thinking_pattern = re.compile(r'<thinking>(.*?)</thinking>', re.DOTALL | re.IGNORECASE)
        thinking_match = thinking_pattern.search(response_text)

        if thinking_match:
            thinking_content = thinking_match.group(1).strip()
            answer_content = thinking_pattern.sub('', response_text).strip()
            logger.debug(f"✅ 解析到 <thinking> 標籤，思考內容長度: {len(thinking_content)}")
        else:
            # 4. 通過文本模式分離
            answer_content, thinking_content = _parse_by_text_pattern(response_text)

    # 清理特殊標記
    answer_content = clean_special_markers(answer_content)
    thinking_content = clean_special_markers(thinking_content)

    return answer_content, thinking_content


def _parse_by_text_pattern(response_text: str) -> Tuple[str, str]:
    """
    通過文本模式分離思考和回答內容

    Args:
        response_text: 響應文本

    Returns:
        (answer, thinking) 元組
    """
    thinking_content = ""
    answer_content = response_text

    # 檢查是否以思考指示詞開頭
    starts_with_thinking = any(
        response_text.strip().startswith(ind) for ind in THINKING_INDICATORS
    )

    if not starts_with_thinking:
        return answer_content, thinking_content

    # 尋找回答的開始位置
    answer_start = -1
    for indicator in ANSWER_INDICATORS:
        pos = response_text.find(indicator)
        if pos != -1:
            if answer_start == -1 or pos < answer_start:
                answer_start = pos

    if answer_start != -1:
        thinking_content = response_text[:answer_start].strip()
        answer_content = response_text[answer_start:].strip()

        # 清理回答開頭的分隔符
        for indicator in ANSWER_INDICATORS:
            if answer_content.startswith(indicator.strip()):
                answer_content = answer_content[len(indicator.strip()):].strip()

        logger.debug(f"✅ 通過文本模式分離思考內容，長度: {len(thinking_content)}")
    else:
        # 使用段落分析
        paragraphs = response_text.strip().split('\n\n')
        if len(paragraphs) >= 3:
            thinking_content = '\n\n'.join(paragraphs[:-2])
            answer_content = '\n\n'.join(paragraphs[-2:])
            logger.debug("✅ 通過段落分析分離思考內容")

    return answer_content, thinking_content


# ==================== 流式解析器 ====================


@dataclass
class StreamEvent:
    """流式事件數據類

    Attributes:
        type: 事件類型 — "thinking" | "answer" | "done" | "error"
        content: 事件內容（token 文本或錯誤消息）
    """
    type: str
    content: str = ""


class StreamingThinkingParser:
    """
    有狀態的增量流式思考解析器

    用於在 token 流中實時分離 thinking 和 answer 內容。

    設計說明：
    Qwen3 格式中，模型直接輸出思考內容（無 <think> 開頭標籤），
    遇到 </think> 標籤後切換到正式回答。
    因此初始狀態為 THINKING，檢測到 </think> 後轉為 ANSWER。

    狀態機：
        THINKING → (遇到 </think>) → ANSWER

    用法：
        parser = StreamingThinkingParser()
        for token in token_stream:
            events = parser.feed(token)
            for event in events:
                yield event
        events = parser.finish()
        for event in events:
            yield event
    """

    # 需要檢測的結束標籤
    _END_TAG = "</think>"

    def __init__(self):
        self._state = "thinking"    # "thinking" | "answer"
        self._buffer = ""           # 用於跨 token 邊界檢測 </think>
        self._thinking_parts: List[str] = []
        self._answer_parts: List[str] = []

    @property
    def full_thinking(self) -> str:
        """獲取已累積的完整 thinking 內容"""
        return "".join(self._thinking_parts)

    @property
    def full_answer(self) -> str:
        """獲取已累積的完整 answer 內容"""
        return "".join(self._answer_parts)

    def feed(self, token: str) -> List[StreamEvent]:
        """
        喂入一個 token，返回零或多個流式事件

        Args:
            token: 從 LLM 收到的文本片段

        Returns:
            事件列表（可能為空，如果 token 被緩衝等待檢測標籤邊界）
        """
        if not token:
            return []

        if self._state == "answer":
            return self._handle_answer_token(token)

        return self._handle_thinking_token(token)

    def finish(self) -> List[StreamEvent]:
        """
        流結束時調用，flush 剩餘 buffer

        Returns:
            剩餘的事件列表
        """
        events = []

        if self._buffer:
            if self._state == "thinking":
                self._thinking_parts.append(self._buffer)
                events.append(StreamEvent(type="thinking", content=self._buffer))
            else:
                self._answer_parts.append(self._buffer)
                events.append(StreamEvent(type="answer", content=self._buffer))
            self._buffer = ""

        return events

    def _handle_thinking_token(self, token: str) -> List[StreamEvent]:
        """處理 thinking 狀態下的 token"""
        events = []
        self._buffer += token

        # 檢查 buffer 中是否包含完整的 </think> 標籤
        tag_lower = self._END_TAG.lower()
        buffer_lower = self._buffer.lower()
        tag_pos = buffer_lower.find(tag_lower)

        if tag_pos != -1:
            # 找到了 </think>，分割 buffer
            before_tag = self._buffer[:tag_pos]
            after_tag = self._buffer[tag_pos + len(self._END_TAG):]

            # 標籤前的內容屬於 thinking
            if before_tag:
                self._thinking_parts.append(before_tag)
                events.append(StreamEvent(type="thinking", content=before_tag))

            # 切換到 answer 狀態
            self._state = "answer"
            self._buffer = ""

            # 標籤後的內容屬於 answer
            if after_tag:
                self._answer_parts.append(after_tag)
                events.append(StreamEvent(type="answer", content=after_tag))

        elif len(self._buffer) > len(self._END_TAG):
            # Buffer 足夠長但未找到標籤
            # 安全地 flush 除了最後 len(END_TAG)-1 個字符以外的部分
            # （因為標籤可能跨越 token 邊界）
            safe_len = len(self._buffer) - (len(self._END_TAG) - 1)
            safe_content = self._buffer[:safe_len]
            self._buffer = self._buffer[safe_len:]

            self._thinking_parts.append(safe_content)
            events.append(StreamEvent(type="thinking", content=safe_content))

        return events

    def _handle_answer_token(self, token: str) -> List[StreamEvent]:
        """處理 answer 狀態下的 token（直接輸出）"""
        cleaned = token
        for marker in SPECIAL_MARKERS:
            cleaned = cleaned.replace(marker, "")

        if cleaned:
            self._answer_parts.append(cleaned)
            return [StreamEvent(type="answer", content=cleaned)]

        return []
