# llm/config.py
"""
LLM 配置管理器
集中管理所有 LLM 相關配置，避免硬編碼分散在各個文件中。
"""

import base64
import os
import json
import logging
from dataclasses import dataclass, field
from typing import Optional, List

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)


@dataclass
class LLMConfig:
    """LLM 配置數據類"""
    # 本地模型配置 (Ollama)
    local_model: str = "qwen3.5:35b"
    local_base_url: str = "http://localhost:11434"

    # SVG 幾何圖 spec 提取專用模型
    svg_model: str = "qwen3.5:35b"

    # API 模型配置 (Qwen / DashScope 雲端)
    api_model: str = "qwen-plus"
    api_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    api_key: Optional[str] = None

    # 通用參數
    temperature: float = 0.6
    top_p: float = 0.95
    timeout: int = 300
    max_tokens: int = 16384
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

    # 是否使用 API (True = 雲端 API, False = 本地 Ollama)
    use_api: bool = True


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
        # 先從 .env 文件載入環境變量（確保 LLM_API_KEY 等持久化值可用）
        self._load_dotenv()

        config_path = os.getenv('LLM_CONFIG_PATH', 'llm_config.json')

        # 嘗試從配置文件加載
        if os.path.exists(config_path):
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    logger.info(f"從配置文件加載 LLM 配置: {config_path}")
                    config = LLMConfig(**data)
                    # llm_config.json 不存儲 api_key，需從 .env 補充
                    if not config.api_key:
                        config.api_key = self._decode_api_key(os.getenv('LLM_API_KEY'))
                    # 同理補充 api_model（.env 可能有管理員更新的值）
                    env_model = os.getenv('LLM_API_MODEL')
                    if env_model:
                        config.api_model = env_model
                    # Docker 環境下 JSON 內的 localhost 不通，需從環境變量覆蓋
                    env_base_url = os.getenv('LLM_LOCAL_BASE_URL') or os.getenv('OLLAMA_BASE_URL')
                    if env_base_url:
                        config.local_base_url = env_base_url
                    if config.api_key:
                        logger.info("已從 .env 補充 API Key 配置")
                    return config
            except Exception as e:
                logger.warning(f"加載配置文件失敗: {e}，使用默認配置")

        # 從環境變量讀取（優先級低於配置文件）
        config = LLMConfig(
            local_model=os.getenv('LLM_LOCAL_MODEL', 'qwen3.5:35b'),
            local_base_url=os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434'),
            svg_model=os.getenv('LLM_SVG_MODEL', 'qwen3.5:35b'),
            api_model=os.getenv('LLM_API_MODEL', 'qwen-plus'),
            api_base_url=os.getenv('LLM_API_BASE_URL', 'https://dashscope.aliyuncs.com/compatible-mode/v1'),
            api_key=self._decode_api_key(os.getenv('LLM_API_KEY')),
            temperature=float(os.getenv('LLM_TEMPERATURE', '0.6')),
            top_p=float(os.getenv('LLM_TOP_P', '0.95')),
            timeout=int(os.getenv('LLM_TIMEOUT', '120')),
            max_tokens=int(os.getenv('LLM_MAX_TOKENS', '16384')),
            num_ctx=int(os.getenv('LLM_NUM_CTX', '131072')),
            num_gpu=int(os.getenv('LLM_NUM_GPU')) if os.getenv('LLM_NUM_GPU') else None,
            enable_thinking_mode=os.getenv('LLM_THINKING_MODE', 'true').lower() == 'true',
            use_api=os.getenv('LLM_USE_API', 'true').lower() == 'true',
        )

        logger.info(f"LLM 配置已加載: model={config.local_model}, use_api={config.use_api}, num_gpu={config.num_gpu}")
        return config

    @staticmethod
    def _project_root() -> str:
        """專案根目錄的絕對路徑(host dev = repo root, docker = /app)"""
        return os.path.dirname(os.path.dirname(__file__))

    @classmethod
    def _runtime_env_path(cls) -> str:
        """API key / 模型名 等 runtime 改動的持久化檔位置。

        放在 user_data/ 是因為:
          - 該目錄在 docker-compose.yml 已 bind-mount 為 ./user_data
          - host 與容器雙向同步,容器重啟不會丟值
          - 與 .env 分離,不污染 host 的 dev .env
        """
        return os.path.join(cls._project_root(), "user_data", "llm_runtime.env")

    @classmethod
    def _load_dotenv(cls):
        """載入 .env (基本配置) 與 user_data/llm_runtime.env (runtime 覆蓋)。

        順序:
          1. 先讀 .env (一般配置),只補入尚未設定的環境變量
          2. 再讀 llm_runtime.env (admin 介面動態改的 API key 等),
             這次「強制覆蓋」既有環境變量,確保最新值生效
        """
        # Step 1: .env (基本配置)
        env_path = os.path.join(cls._project_root(), ".env")
        cls._load_env_file(env_path, override=False)

        # Step 2: runtime 覆蓋檔
        runtime_path = cls._runtime_env_path()
        cls._load_env_file(runtime_path, override=True)

    @staticmethod
    def _load_env_file(path: str, override: bool):
        if not os.path.exists(path):
            return
        try:
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    eq = line.find("=")
                    if eq <= 0:
                        continue
                    key = line[:eq].strip()
                    val = line[eq + 1:].strip()
                    if override or key not in os.environ:
                        os.environ[key] = val
        except Exception as e:
            logger.warning("載入 env 檔失敗 %s: %s", path, e)

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

    def update_runtime(self, **kwargs):
        """運行時更新配置字段，關鍵配置同步持久化到 .env。"""
        # 需要持久化到 .env 的字段映射：屬性名 → 環境變量名
        _PERSIST_MAP = {
            "api_key": "LLM_API_KEY",
            "api_model": "LLM_API_MODEL",
        }
        env_updates = {}
        for key, value in kwargs.items():
            if hasattr(self._config, key):
                setattr(self._config, key, value)
                logger.info("LLM 配置已更新: %s", key)
                if key in _PERSIST_MAP and value is not None:
                    # api_key 存入 .env 時做 Fernet 加密，避免明文暴露
                    store_val = self._encode_api_key(value) if key == "api_key" else value
                    env_updates[_PERSIST_MAP[key]] = store_val
        if env_updates:
            self._update_env_file(env_updates, env_path=self._runtime_env_path())

    # ── Fernet 加密 / 解密 ──

    @staticmethod
    def _get_fernet() -> Optional[Fernet]:
        """讀取 .encryption_key 並返回 Fernet 實例，失敗返回 None。"""
        key_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".encryption_key")
        if not os.path.exists(key_path):
            logger.warning("加密金鑰檔案不存在: %s — API Key 將以 Base64 備援模式存儲", key_path)
            return None
        try:
            with open(key_path, "r", encoding="utf-8") as f:
                return Fernet(f.read().strip().encode())
        except Exception as e:
            logger.warning("載入加密金鑰失敗: %s — 降級為 Base64", e)
            return None

    @classmethod
    def _encode_api_key(cls, key: str) -> str:
        """加密 API key — 優先 Fernet (enc:)，降級 Base64 (b64:)"""
        fernet = cls._get_fernet()
        if fernet:
            token = fernet.encrypt(key.encode()).decode()
            return f"enc:{token}"
        # 降級：Base64 編碼
        return "b64:" + base64.b64encode(key.encode()).decode()

    @classmethod
    def _decode_api_key(cls, raw: str | None) -> str | None:
        """解密 API key — 支持 enc: (Fernet)、b64: (Base64)、明文（向後兼容）。"""
        if not raw:
            return None
        if raw.startswith("enc:"):
            fernet = cls._get_fernet()
            if fernet:
                try:
                    return fernet.decrypt(raw[4:].encode()).decode()
                except InvalidToken:
                    logger.error("Fernet 解密 API Key 失敗（金鑰不匹配？）")
                    return None
            logger.error("無法載入加密金鑰，無法解密 enc: 格式的 API Key")
            return None
        if raw.startswith("b64:"):
            try:
                return base64.b64decode(raw[4:]).decode()
            except Exception:
                return raw
        return raw  # 明文（兼容舊配置）

    @staticmethod
    def _update_env_file(updates: dict[str, str], env_path: str = ".env"):
        """將鍵值對寫入 env 文件（已有則更新，沒有則追加）。

        預設目標已改為 user_data/llm_runtime.env (見 update_runtime),
        確保 docker 容器內的修改可持久化到 host (user_data/ 是 bind mount)。
        """
        # 確保父目錄存在 (user_data/ 在 host 上應該已經存在,但保險起見)
        parent = os.path.dirname(os.path.abspath(env_path))
        if parent and not os.path.exists(parent):
            try:
                os.makedirs(parent, exist_ok=True)
            except Exception as e:
                logger.warning("無法建立 env 檔目錄 %s: %s", parent, e)

        lines = []
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                lines = f.readlines()

        remaining = dict(updates)  # 還沒寫入的 key
        new_lines = []
        for line in lines:
            stripped = line.strip()
            if stripped and not stripped.startswith("#"):
                eq_pos = stripped.find("=")
                if eq_pos > 0:
                    env_key = stripped[:eq_pos].strip()
                    if env_key in remaining:
                        new_lines.append(f"{env_key}={remaining.pop(env_key)}\n")
                        continue
            new_lines.append(line)

        # 追加新的 key
        for env_key, env_val in remaining.items():
            if new_lines and not new_lines[-1].endswith("\n"):
                new_lines.append("\n")
            new_lines.append(f"{env_key}={env_val}\n")

        with open(env_path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
        logger.info("已持久化到 %s: %s", env_path, list(updates.keys()))

    def save_config(self, path: str = 'llm_config.json'):
        """保存當前配置到文件"""
        config_dict = {
            'local_model': self._config.local_model,
            'local_base_url': self._config.local_base_url,
            'svg_model': self._config.svg_model,
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


def get_llm_config_manager() -> LLMConfigManager:
    """獲取配置管理器實例"""
    return llm_config_manager


def is_using_api() -> bool:
    """是否使用 API 模式"""
    return llm_config_manager.config.use_api
