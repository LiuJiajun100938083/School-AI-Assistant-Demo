# llm/config.py
"""
LLM 配置管理器
集中管理所有 LLM 相關配置，避免硬編碼分散在各個文件中。
"""

import os
import json
import logging
from dataclasses import dataclass, field
from typing import Optional, List

logger = logging.getLogger(__name__)


@dataclass
class LLMConfig:
    """LLM 配置數據類"""
    # 本地模型配置 (Ollama)
    local_model: str = "qwen3.5:35b"
    local_base_url: str = "http://localhost:11434"

    # API 模型配置 (預留，暫未啟用)
    api_model: str = "deepseek-chat"
    api_base_url: str = "https://api.deepseek.com/v1"
    api_key: Optional[str] = None

    # 通用參數
    temperature: float = 0.6
    top_p: float = 0.95
    timeout: int = 120
    max_tokens: int = 81920
    num_ctx: int = 131072

    # GPU 層數控制 (None = Ollama 自動分配，適合大 VRAM 機器)
    # 設置具體數字可控制多少層放到 GPU，其餘放到 CPU/內存
    num_gpu: Optional[int] = None

    # 思考模式
    enable_thinking_mode: bool = True

    # 停止標記
    stop_tokens: List[str] = field(default_factory=lambda: [
        "<|im_start|>", "<|im_end|>", "<|endoftext|>"
    ])

    # 是否使用 API (False = 使用本地 Ollama)
    use_api: bool = False


class LLMConfigManager:
    """LLM 配置管理器單例"""
    _instance: Optional['LLMConfigManager'] = None
    _config: Optional[LLMConfig] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._config = cls._instance._load_config()
        return cls._instance

    def _load_config(self) -> LLMConfig:
        """從環境變量或配置文件加載配置"""
        config_path = os.getenv('LLM_CONFIG_PATH', 'llm_config.json')

        # 嘗試從配置文件加載
        if os.path.exists(config_path):
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    logger.info(f"從配置文件加載 LLM 配置: {config_path}")
                    return LLMConfig(**data)
            except Exception as e:
                logger.warning(f"加載配置文件失敗: {e}，使用默認配置")

        # 從環境變量讀取（優先級低於配置文件）
        config = LLMConfig(
            local_model=os.getenv('LLM_LOCAL_MODEL', 'qwen3.5:35b'),
            local_base_url=os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434'),
            api_model=os.getenv('LLM_API_MODEL', 'deepseek-chat'),
            api_base_url=os.getenv('LLM_API_BASE_URL', 'https://api.deepseek.com/v1'),
            api_key=os.getenv('LLM_API_KEY'),
            temperature=float(os.getenv('LLM_TEMPERATURE', '0.6')),
            top_p=float(os.getenv('LLM_TOP_P', '0.95')),
            timeout=int(os.getenv('LLM_TIMEOUT', '120')),
            max_tokens=int(os.getenv('LLM_MAX_TOKENS', '81920')),
            num_ctx=int(os.getenv('LLM_NUM_CTX', '131072')),
            num_gpu=int(os.getenv('LLM_NUM_GPU')) if os.getenv('LLM_NUM_GPU') else None,
            enable_thinking_mode=os.getenv('LLM_THINKING_MODE', 'true').lower() == 'true',
            use_api=os.getenv('LLM_USE_API', 'false').lower() == 'true',
        )

        logger.info(f"LLM 配置已加載: model={config.local_model}, use_api={config.use_api}, num_gpu={config.num_gpu}")
        return config

    @property
    def config(self) -> LLMConfig:
        """獲取當前配置"""
        return self._config

    @property
    def model(self) -> str:
        """獲取當前使用的模型名稱"""
        if self._config.use_api:
            return self._config.api_model
        return self._config.local_model

    @property
    def base_url(self) -> str:
        """獲取當前使用的 API 基礎 URL"""
        if self._config.use_api:
            return self._config.api_base_url
        return self._config.local_base_url

    def set_model(self, model_name: str):
        """動態設置模型（運行時修改）"""
        self._config.local_model = model_name
        logger.info(f"模型已切換為: {model_name}")

    def set_use_api(self, use_api: bool):
        """切換 API/本地模式"""
        self._config.use_api = use_api
        mode = "API" if use_api else "本地 Ollama"
        logger.info(f"已切換到{mode}模式")

    def reload_config(self):
        """重新加載配置"""
        self._config = self._load_config()
        logger.info("配置已重新加載")

    def save_config(self, path: str = 'llm_config.json'):
        """保存當前配置到文件"""
        config_dict = {
            'local_model': self._config.local_model,
            'local_base_url': self._config.local_base_url,
            'api_model': self._config.api_model,
            'api_base_url': self._config.api_base_url,
            'temperature': self._config.temperature,
            'top_p': self._config.top_p,
            'timeout': self._config.timeout,
            'max_tokens': self._config.max_tokens,
            'num_ctx': self._config.num_ctx,
            'num_gpu': self._config.num_gpu,
            'enable_thinking_mode': self._config.enable_thinking_mode,
            'use_api': self._config.use_api,
            'stop_tokens': self._config.stop_tokens,
        }
        # 不保存 api_key 到文件
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(config_dict, f, indent=2, ensure_ascii=False)
        logger.info(f"配置已保存到: {path}")


# 全局配置實例
llm_config_manager = LLMConfigManager()


# 便捷訪問函數
def get_llm_config() -> LLMConfig:
    """獲取 LLM 配置"""
    return llm_config_manager.config


def get_current_model() -> str:
    """獲取當前使用的模型名稱"""
    return llm_config_manager.model


def get_base_url() -> str:
    """獲取當前 API 基礎 URL"""
    return llm_config_manager.base_url


def is_using_api() -> bool:
    """是否使用 API 模式"""
    return llm_config_manager.config.use_api
