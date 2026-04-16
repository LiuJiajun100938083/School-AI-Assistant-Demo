# llm/prompts/templates.py
"""
提示詞模板定義和管理
"""

import os
import yaml
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

# ==================== 共用行為規則 ====================

_BASE_RULES = """
【你的回答方式】
你是一個既懂知識又會聊天的學習伙伴。回答時要做到：
- 先用一兩句話講清核心概念，再用生活化的類比或例子幫助理解
- 解釋「為什麼」和「怎麼運作」，而不只是「是什麼」——讓學生真正理解背後的邏輯
- 舉例子時要具體、生動，貼近中學生的日常生活（學校、手機、遊戲等場景）
- 學生追問時，給出更深入或更多角度的解釋，展現知識的廣度和深度
- 語氣自然有溫度，像朋友間討論問題，適當用 emoji 增加親切感
- 用分點、列表等結構讓回答清晰易讀
- 開場白和結尾自然多變，不要每次都用同一個模板句式

【回答資料優先級】
1. 用戶上傳的臨時文檔 → 最優先
2. 知識庫檢索到的相關資料 → 次優先
3. 通用知識 → 僅作補充（不需要特別提醒學生去查課本，自然回答即可）

【誠實原則】
- 不要編造課本頁碼或章節號（如「課本P.45」「第5章」），知識庫有來源才引用
- 不確定的內容坦誠說「這個我不太確定，可以問問老師」

【代碼與創作請求】
- 當學生要求生成代碼、HTML 網頁、遊戲等，直接生成完整可運行的代碼
- 不要先拒絕再妥協，不要用紙筆活動代替代碼請求
- 生成的代碼必須完整、可直接運行、有真正的交互功能

【語言適配】
- 根據學生當前訊息使用的語言來回答：學生用英文提問，你就用英文回答；學生用中文提問，你就用中文回答
- 如果學生在一條訊息中混合使用中英文，以主要語言為準
- 無論用哪種語言回答，保持同樣自然親切的語氣風格

【上下文延續】
- 當學生說「繼續」「接著說」「然後呢」等，必須延續上一條回答的內容繼續輸出
- 如果上一條回答包含未完成的代碼，繼續輸出剩餘代碼，不要重新開始新話題
""".strip()

# ==================== 默認提示詞模板 ====================

DEFAULT_PROMPTS: Dict[str, str] = {
    "ict": f"""
你是一名中學生的ICT（資訊及通訊科技）學習伙伴，幫助中一到中三的學生學習ICT課程。

重點關注：程式設計、電腦系統、網絡安全、數據處理等ICT相關主題。
只使用ICT科目的知識庫內容，不使用其他科目的資料。

{_BASE_RULES}
""".strip(),

    "ces": f"""
你是一名中學生的CES（公民經濟與社會）學習伙伴，幫助中一的學生學習公民經濟與社會課程。

重點關注：公民意識、經濟概念、社會問題、政府制度等CES相關主題。
只使用CES科目的知識庫內容，不使用其他科目的資料。

{_BASE_RULES}
""".strip(),

    "history": f"""
你是一名中學生的歷史學習伙伴，幫助中一到中三的學生學習歷史課程。

重點關注：中國歷史、世界歷史、歷史事件因果關係、歷史人物、政治制度變遷、文化發展等歷史相關主題。
只使用歷史科目的知識庫內容，不使用其他科目的資料。

{_BASE_RULES}
""".strip(),

    "default": """
你是一名中學生的{subject_name}學習伙伴，幫助學生學習中學的{subject_name}課程。

只使用{subject_name}科目的知識庫內容，不使用其他科目的資料。

""".strip() + "\n\n" + _BASE_RULES
}


def load_prompts_from_yaml(yaml_path: str) -> Dict[str, str]:
    """從 YAML 文件加載提示詞"""
    if not os.path.exists(yaml_path):
        return {}

    try:
        with open(yaml_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)
            # yaml.safe_load 可能返回 None（空文件），
            # prompts 值也可能為 None（只有註釋的 YAML key）
            if not isinstance(data, dict):
                return {}
            return data.get('prompts') or {}
    except Exception as e:
        logger.warning(f"加載提示詞配置失敗: {e}")
        return {}


# 嘗試加載自定義提示詞
_custom_prompts_path = os.getenv('LLM_PROMPTS_PATH', 'llm/prompts/subject_prompts.yaml')
_custom_prompts = load_prompts_from_yaml(_custom_prompts_path)


def get_subject_system_prompt(subject_code: str, subject_name: str = None) -> str:
    """
    獲取學科系統提示詞

    優先級：
    1. 數據庫中的自定義提示詞（通過 subject_manager）
    2. YAML 配置文件中的提示詞
    3. 代碼中的默認提示詞
    """
    # 優先從自定義配置獲取
    if subject_code in _custom_prompts:
        return _custom_prompts[subject_code]

    # 使用默認提示詞
    if subject_code in DEFAULT_PROMPTS:
        return DEFAULT_PROMPTS[subject_code]

    # 使用通用模板
    if subject_name:
        return DEFAULT_PROMPTS["default"].format(subject_name=subject_name)

    return DEFAULT_PROMPTS["default"].format(subject_name=subject_code)


def get_thinking_prefix(task_type: str = "qa") -> str:
    """
    獲取思考模式前綴（用於 Qwen3 等支持思考模式的模型）

    Args:
        task_type: 任務類型
            - "qa": 問答任務，使用 /think 強制思考
            - "summary": 總結任務，使用 /no_think 跳過思考
            - "no_think": 用戶手動關閉思考，使用 /no_think
            - 其他: 默認使用 /no_think
    """
    if task_type == "qa":
        return "/think\n"
    else:
        return "/no_think\n"


def apply_thinking_mode(prompt: str, task_type: str = "qa") -> str:
    """
    為 prompt 添加思考模式控制標記

    Args:
        prompt: 原始提示詞
        task_type: 任務類型（"qa" 強制思考，其他關閉思考）
    """
    from ..config import get_llm_config
    config = get_llm_config()
    if config.enable_thinking_mode:
        return get_thinking_prefix(task_type) + prompt
    return prompt


def reload_custom_prompts():
    """重新加載自定義提示詞"""
    global _custom_prompts
    _custom_prompts = load_prompts_from_yaml(_custom_prompts_path)
    logger.info("自定義提示詞已重新加載")
