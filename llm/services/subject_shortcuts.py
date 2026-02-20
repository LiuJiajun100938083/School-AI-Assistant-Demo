# llm/services/subject_shortcuts.py
"""
學科便捷函數
提供各學科的快捷問答接口
"""

from typing import List, Dict, Tuple, Optional, Callable

from .qa_service import ask_ai_subject
from .streaming import ask_ai_subject_stream

# ==================== 學科別名映射 ====================

SUBJECT_ALIASES = {
    # ICT 別名
    "ict": "ict", "it": "ict", "computer": "ict", "資訊科技": "ict",
    # CES 別名
    "ces": "ces", "公民": "ces", "citizenship": "ces",
    # 歷史別名
    "history": "history", "hist": "history", "歷史": "history",
    # 中文別名
    "chinese": "chinese", "中文": "chinese", "語文": "chinese", "国文": "chinese",
    # 英文別名
    "english": "english", "eng": "english", "英文": "english", "英語": "english",
    # 數學別名
    "math": "math", "maths": "math", "mathematics": "math", "數學": "math",
    # 物理別名
    "physics": "physics", "phy": "physics", "物理": "physics",
    # 化學別名
    "chemistry": "chemistry", "chem": "chemistry", "化學": "chemistry",
    # 生物別名
    "biology": "biology", "bio": "biology", "生物": "biology",
    # 科學別名
    "science": "science", "sci": "science", "科學": "science", "綜合科學": "science",
    # 經濟別名
    "economics": "economics", "econ": "economics", "經濟": "economics",
    # 地理別名
    "geography": "geography", "geo": "geography", "地理": "geography",
    # 視覺藝術別名
    "visual_arts": "visual_arts", "art": "visual_arts", "arts": "visual_arts",
    "視覺藝術": "visual_arts", "美術": "visual_arts"
}


def normalize_subject_code(subject_input: str) -> str:
    """標準化學科代碼，支持別名"""
    subject_lower = subject_input.lower().strip()
    return SUBJECT_ALIASES.get(subject_lower, subject_input)


# ==================== 學科便捷函數 ====================

def ask_ai_ict(
    question: str,
    use_api: bool = False,
    conversation_history: List[Dict] = None,
    model: str = None
) -> Tuple[str, str]:
    """ICT 科目問答"""
    return ask_ai_subject(question, "ict", use_api, conversation_history, model)


def ask_ai_ces(
    question: str,
    use_api: bool = False,
    conversation_history: List[Dict] = None,
    model: str = None
) -> Tuple[str, str]:
    """CES 科目問答"""
    return ask_ai_subject(question, "ces", use_api, conversation_history, model)


def ask_ai_history(
    question: str,
    use_api: bool = False,
    conversation_history: List[Dict] = None,
    model: str = None
) -> Tuple[str, str]:
    """歷史科目問答"""
    return ask_ai_subject(question, "history", use_api, conversation_history, model)


def ask_ai_chinese(
    question: str,
    use_api: bool = False,
    conversation_history: List[Dict] = None,
    model: str = None
) -> Tuple[str, str]:
    """中文科目問答"""
    return ask_ai_subject(question, "chinese", use_api, conversation_history, model)


def ask_ai_english(
    question: str,
    use_api: bool = False,
    conversation_history: List[Dict] = None,
    model: str = None
) -> Tuple[str, str]:
    """英文科目問答"""
    return ask_ai_subject(question, "english", use_api, conversation_history, model)


def ask_ai_math(
    question: str,
    use_api: bool = False,
    conversation_history: List[Dict] = None,
    model: str = None
) -> Tuple[str, str]:
    """數學科目問答"""
    return ask_ai_subject(question, "math", use_api, conversation_history, model)


def ask_ai_physics(
    question: str,
    use_api: bool = False,
    conversation_history: List[Dict] = None,
    model: str = None
) -> Tuple[str, str]:
    """物理科目問答"""
    return ask_ai_subject(question, "physics", use_api, conversation_history, model)


def ask_ai_chemistry(
    question: str,
    use_api: bool = False,
    conversation_history: List[Dict] = None,
    model: str = None
) -> Tuple[str, str]:
    """化學科目問答"""
    return ask_ai_subject(question, "chemistry", use_api, conversation_history, model)


def ask_ai_biology(
    question: str,
    use_api: bool = False,
    conversation_history: List[Dict] = None,
    model: str = None
) -> Tuple[str, str]:
    """生物科目問答"""
    return ask_ai_subject(question, "biology", use_api, conversation_history, model)


def ask_ai_science(
    question: str,
    use_api: bool = False,
    conversation_history: List[Dict] = None,
    model: str = None
) -> Tuple[str, str]:
    """綜合科學科目問答"""
    return ask_ai_subject(question, "science", use_api, conversation_history, model)


def ask_ai_economics(
    question: str,
    use_api: bool = False,
    conversation_history: List[Dict] = None,
    model: str = None
) -> Tuple[str, str]:
    """經濟科目問答"""
    return ask_ai_subject(question, "economics", use_api, conversation_history, model)


def ask_ai_geography(
    question: str,
    use_api: bool = False,
    conversation_history: List[Dict] = None,
    model: str = None
) -> Tuple[str, str]:
    """地理科目問答"""
    return ask_ai_subject(question, "geography", use_api, conversation_history, model)


def ask_ai_visual_arts(
    question: str,
    use_api: bool = False,
    conversation_history: List[Dict] = None,
    model: str = None
) -> Tuple[str, str]:
    """視覺藝術科目問答"""
    return ask_ai_subject(question, "visual_arts", use_api, conversation_history, model)


# ==================== 流式學科便捷函數 ====================

def ask_ai_ict_stream(
    question: str,
    conversation_history: List[Dict] = None,
    on_reasoning_chunk: Optional[Callable[[str], None]] = None,
    on_content_chunk: Optional[Callable[[str], None]] = None,
    on_complete: Optional[Callable[[str, str], None]] = None,
    on_error: Optional[Callable[[str], None]] = None
) -> None:
    """ICT 科目流式問答"""
    ask_ai_subject_stream(
        question, "ict", conversation_history, None,
        on_reasoning_chunk, on_content_chunk, on_complete, on_error
    )


def ask_ai_ces_stream(
    question: str,
    conversation_history: List[Dict] = None,
    on_reasoning_chunk: Optional[Callable[[str], None]] = None,
    on_content_chunk: Optional[Callable[[str], None]] = None,
    on_complete: Optional[Callable[[str, str], None]] = None,
    on_error: Optional[Callable[[str], None]] = None
) -> None:
    """CES 科目流式問答"""
    ask_ai_subject_stream(
        question, "ces", conversation_history, None,
        on_reasoning_chunk, on_content_chunk, on_complete, on_error
    )


def ask_ai_history_stream(
    question: str,
    conversation_history: List[Dict] = None,
    on_reasoning_chunk: Optional[Callable[[str], None]] = None,
    on_content_chunk: Optional[Callable[[str], None]] = None,
    on_complete: Optional[Callable[[str, str], None]] = None,
    on_error: Optional[Callable[[str], None]] = None
) -> None:
    """歷史科目流式問答"""
    ask_ai_subject_stream(
        question, "history", conversation_history, None,
        on_reasoning_chunk, on_content_chunk, on_complete, on_error
    )


def ask_ai_chinese_stream(
    question: str,
    conversation_history: List[Dict] = None,
    model: str = None,
    on_reasoning_chunk: Optional[Callable[[str], None]] = None,
    on_content_chunk: Optional[Callable[[str], None]] = None,
    on_complete: Optional[Callable[[str, str], None]] = None,
    on_error: Optional[Callable[[str], None]] = None
) -> None:
    """中文科目流式問答"""
    ask_ai_subject_stream(
        question, "chinese", conversation_history, model,
        on_reasoning_chunk, on_content_chunk, on_complete, on_error
    )


def ask_ai_english_stream(
    question: str,
    conversation_history: List[Dict] = None,
    model: str = None,
    on_reasoning_chunk: Optional[Callable[[str], None]] = None,
    on_content_chunk: Optional[Callable[[str], None]] = None,
    on_complete: Optional[Callable[[str, str], None]] = None,
    on_error: Optional[Callable[[str], None]] = None
) -> None:
    """英文科目流式問答"""
    ask_ai_subject_stream(
        question, "english", conversation_history, model,
        on_reasoning_chunk, on_content_chunk, on_complete, on_error
    )


def ask_ai_math_stream(
    question: str,
    conversation_history: List[Dict] = None,
    model: str = None,
    on_reasoning_chunk: Optional[Callable[[str], None]] = None,
    on_content_chunk: Optional[Callable[[str], None]] = None,
    on_complete: Optional[Callable[[str, str], None]] = None,
    on_error: Optional[Callable[[str], None]] = None
) -> None:
    """數學科目流式問答"""
    ask_ai_subject_stream(
        question, "math", conversation_history, model,
        on_reasoning_chunk, on_content_chunk, on_complete, on_error
    )


# ==================== 兼容舊版本 ====================

def ask_ai(question: str, use_api: bool = False) -> Tuple[str, str]:
    """兼容舊版本的問答接口"""
    return ask_ai_ict(question, use_api)
