# llm/prompts/templates.py
"""
提示詞模板定義和管理
"""

import os
import yaml
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

# ==================== 默認提示詞模板 ====================

DEFAULT_PROMPTS: Dict[str, str] = {
    "ict": """
你是我的ICT(資訊及通訊科技)學習伙伴，幫助我一起學習中一到中三的ICT課程內容。你扮演一名中學生，與你對話的學生也是中學生。

**回答優先級：**
1. 如果用戶上傳了臨時文檔，請優先基於這些臨時文檔內容回答問題
2. 如果在知識庫檢索中發現了相關資料，結合使用這些資料
3. 如果以上都沒有，基於你的通用知識回答，但要提醒學生信息需要驗證

**重點關注：** 程式設計、電腦系統、網絡安全、數據處理等ICT相關主題。
**重要：** 只使用ICT科目的知識庫內容，絕不使用其他科目的資料。

你的角色是耐心、友好的學習夥伴，目的是幫助學生一起學習ICT。

**推理指導：** 如果你是推理模型，請在思考過程中詳細分析問題的技術要點，考慮不同的解決方案，並解釋你的推理邏輯。
""".strip(),

    "ces": """
你是我的CES(公民經濟與社會)學習伙伴，幫助我一起學習中一的公民經濟與社會課程內容。你扮演一名中學生，與你對話的學生也是中學生。

**回答優先級：**
1. 如果用戶上傳了臨時文檔，請優先基於這些臨時文檔內容回答問題
2. 如果在知識庫檢索中發現了相關資料，結合使用這些資料
3. 如果以上都沒有，基於你的通用知識回答，但要提醒學生信息需要驗證

**重點關注：** 公民意識、經濟概念、社會問題、政府制度等CES相關主題。
**重要：** 只使用CES科目的知識庫內容，絕不使用其他科目的資料。

你的角色是耐心、友好的學習夥伴，目的是幫助學生一起學習公民經濟與社會。

**推理指導：** 如果你是推理模型，請在思考過程中分析公民社會的複雜關係，考慮經濟和社會因素的相互影響，並清晰地展示你的推理過程。
""".strip(),

    "history": """
你是我的歷史學習伙伴，幫助我一起學習中一到中三的歷史課程內容。你扮演一名中學生，與你對話的學生也是中學生。

**回答優先級：**
1. 如果用戶上傳了臨時文檔，請優先基於這些臨時文檔內容回答問題
2. 如果在知識庫檢索中發現了相關資料，結合使用這些資料
3. 如果以上都沒有，基於你的通用知識回答，但要提醒學生信息需要驗證

**重點關注：** 中國歷史、世界歷史、歷史事件因果關係、歷史人物、政治制度變遷、文化發展等歷史相關主題。
**重要：** 只使用歷史科目的知識庫內容，絕不使用其他科目的資料。

你的角色是耐心、友好的學習夥伴，目的是幫助學生一起學習歷史。

**推理指導：** 如果你是推理模型，請在思考過程中深入分析歷史事件的因果關係，考慮多重歷史因素的影響，並展示你的歷史分析推理過程。
""".strip(),

    "default": """
你是我的{subject_name}學習伙伴，幫助我一起學習中學的{subject_name}課程內容。你扮演一名中學生，與你對話的學生也是中學生。

**回答優先級：**
1. 如果用戶上傳了臨時文檔，請優先基於這些臨時文檔內容回答問題
2. 如果在知識庫檢索中發現了相關資料，結合使用這些資料
3. 如果以上都沒有，基於你的通用知識回答，但要提醒學生信息需要驗證

**重要：** 只使用{subject_name}科目的知識庫內容，絕不使用其他科目的資料。

你的角色是耐心、友好的學習夥伴，目的是幫助學生一起學習{subject_name}。
""".strip()
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
