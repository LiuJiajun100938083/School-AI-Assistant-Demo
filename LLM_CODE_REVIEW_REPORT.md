# 本地LLM代码审查报告

**审查日期**: 2026年2月3日
**审查范围**: 本地LLM相关代码文件

---

## 一、发现的主要问题

### 1. 模型配置分散且不一致 ⚠️ 严重

**问题描述**：模型名称在多个位置硬编码，且存在不一致：

| 位置 | 配置的模型 | 备注 |
|------|-----------|------|
| `rag_chain.py` 第141行 | `deepseek-r1:14b` | 全局 `llm` 实例 |
| `rag_chain.py` 函数参数默认值 | `qwen3:30b` | 约20+处 |
| `enhanced_analytics_llm.py` 第267行 | `qwen3:30b` | 注释说"改为8b"但实际不是 |
| `notice_generator.py` 第136行 | `qwen3:30b` | 硬编码 |

**代码示例**：
```python
# rag_chain.py 中存在矛盾
llm = OllamaLLM(model="deepseek-r1:14b", ...)  # 第141行

def ask_ai_ict(question: str, model: str = "qwen3:30b"):  # 第487行
    ...  # 但实际调用的是全局 llm
```

---

### 2. 代码重复严重 ⚠️ 严重

**问题描述**：`rag_chain.py` 中约有 **500+ 行重复代码**

**重复的函数模式**：
```python
# 每个学科都有这两种函数（约13个学科 × 2 = 26个几乎相同的函数）
def ask_ai_xxx(question, use_api=False, conversation_history=None, model="qwen3:30b"):
    return ask_ai_subject(question, "xxx", use_api, conversation_history, model)

def ask_ai_xxx_stream(question, conversation_history=None, model="qwen3:30b", ...):
    ask_ai_subject_stream(question, "xxx", conversation_history, model, ...)
```

**更严重的问题**：某些函数被定义了两次！
```python
# ask_ai_ict_stream 在第766行和第913行各定义了一次
# ask_ai_ces_stream 在第787行和第935行各定义了一次
# ask_ai_history_stream 在第808行和第957行各定义了一次
```

---

### 3. API模式与本地模式混乱 ⚠️ 严重

**问题描述**：代码中有 `use_api` 参数，但实际上被强制禁用

```python
# rag_chain.py 第314-316行
def ask_ai_api(...):
    """API模式问答 - 已改为使用本地Ollama模型"""
    return ask_ai_local(...)  # 实际调用本地模型

# rag_chain.py 第476-477行
def ask_ai_subject(...):
    use_api = False  # 强制使用本地模型
```

**结果**：
- `deepseek_api.py` 文件存在但从未被实际调用
- `use_api` 参数成为无效参数，但仍然在函数签名中出现约30+次

---

### 4. 未使用的代码（死代码）⚠️ 中等

```python
# rag_chain.py 中的 ModelPool 类（第29-61行）从未被使用
class ModelPool:
    def __init__(self, num_instances=8):
        ...
        from mlx_lm import load, generate  # 也从未使用

# 这些全局变量从未使用
MAX_WORKERS = 32
MODEL_INSTANCES = 8
MODEL_POOL = []
POOL_SIZE = 16
executor_pool = None
model_pool = None
```

---

### 5. 配置硬编码问题 ⚠️ 中等

```python
# 硬编码的配置应该放入配置文件
os.environ['MLX_MAX_THREADS'] = '64'  # 硬编码
os.environ['OMP_NUM_THREADS'] = '32'  # 硬编码

llm = OllamaLLM(
    base_url="http://localhost:11434",  # 硬编码
    model="deepseek-r1:14b",  # 硬编码
    temperature=0.6,  # 硬编码
    ...
)
```

---

### 6. 思考模式实现问题 ⚠️ 轻微

```python
# rag_chain.py 第380行存在问题
thinking_prompt = apply_thinking_mode(prompt) if 'apply_thinking_mode' in dir() else prompt
# 这个检查是多余的，因为 apply_thinking_mode 在同一文件中定义
```

---

## 二、改进建议

### 建议1：创建统一的LLM配置管理器

```python
# llm_config.py（新文件）
from dataclasses import dataclass
from typing import Optional
import os
import json

@dataclass
class LLMConfig:
    """LLM配置类"""
    model_name: str = "deepseek-r1:14b"
    base_url: str = "http://localhost:11434"
    temperature: float = 0.6
    top_p: float = 0.95
    timeout: int = 60
    max_tokens: int = 4096
    enable_thinking_mode: bool = True

class LLMConfigManager:
    _instance = None
    _config: LLMConfig = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        self._config = self._load_config()

    def _load_config(self) -> LLMConfig:
        """从环境变量或配置文件加载配置"""
        config_path = os.getenv('LLM_CONFIG_PATH', 'llm_config.json')

        if os.path.exists(config_path):
            with open(config_path) as f:
                data = json.load(f)
                return LLMConfig(**data)

        # 从环境变量读取
        return LLMConfig(
            model_name=os.getenv('LLM_MODEL', 'deepseek-r1:14b'),
            base_url=os.getenv('OLLAMA_URL', 'http://localhost:11434'),
            temperature=float(os.getenv('LLM_TEMPERATURE', '0.6')),
        )

    @property
    def config(self) -> LLMConfig:
        return self._config

# 全局访问点
llm_config = LLMConfigManager.get_instance()
```

---

### 建议2：重构学科问答函数（消除重复代码）

```python
# rag_chain.py 重构版本
from typing import Callable, Tuple, List, Optional
from functools import partial

class SubjectQA:
    """统一的学科问答类"""

    def __init__(self, llm, vector_db, subject_manager):
        self.llm = llm
        self.vector_db = vector_db
        self.subject_manager = subject_manager

    def ask(
        self,
        question: str,
        subject_code: str,
        conversation_history: Optional[List[dict]] = None
    ) -> Tuple[str, str]:
        """统一的问答接口"""
        system_prompt = self.subject_manager.get_prompt(subject_code)
        kb_context = self._get_context_from_knowledge_base(question, subject_code)
        # ... 处理逻辑
        return answer, thinking

    def ask_stream(
        self,
        question: str,
        subject_code: str,
        conversation_history: Optional[List[dict]] = None,
        on_reasoning_chunk: Optional[Callable] = None,
        on_content_chunk: Optional[Callable] = None,
        on_complete: Optional[Callable] = None,
        on_error: Optional[Callable] = None
    ) -> None:
        """统一的流式问答接口"""
        # ... 流式处理逻辑

# 使用方式
subject_qa = SubjectQA(llm, vector_db, subject_manager)

# 不再需要为每个学科创建单独的函数
answer, thinking = subject_qa.ask("什么是编程？", "ict")
answer, thinking = subject_qa.ask("中国历史", "history")
```

---

### 建议3：清理API模式相关代码

**方案A**：如果确定只使用本地模型
```python
# 删除所有 use_api 参数
# 删除 deepseek_api.py
# 简化函数签名
def ask_ai_subject(question: str, subject_code: str, conversation_history: List[dict] = None):
    ...
```

**方案B**：如果需要保留API模式作为备选
```python
class LLMProvider:
    """LLM提供者抽象"""

    def __init__(self, use_local: bool = True):
        self.use_local = use_local
        if use_local:
            self.provider = OllamaProvider()
        else:
            self.provider = DeepSeekAPIProvider()

    def generate(self, prompt: str, **kwargs):
        return self.provider.generate(prompt, **kwargs)
```

---

### 建议4：删除未使用的代码

需要删除的代码：
1. `ModelPool` 类及相关代码（约40行）
2. 全局变量 `MAX_WORKERS`, `MODEL_INSTANCES`, `MODEL_POOL`, `POOL_SIZE`, `executor_pool`, `model_pool`
3. `mlx_lm` 导入
4. 重复定义的 `ask_ai_xxx_stream` 函数

---

### 建议5：创建配置文件

```json
// llm_config.json
{
    "model_name": "deepseek-r1:14b",
    "base_url": "http://localhost:11434",
    "temperature": 0.6,
    "top_p": 0.95,
    "timeout": 60,
    "max_tokens": 4096,
    "enable_thinking_mode": true,
    "stop_tokens": ["<|im_start|>", "<|im_end|>"]
}
```

---

## 三、重构优先级建议

| 优先级 | 任务 | 预计工作量 | 风险等级 |
|--------|------|-----------|---------|
| 🔴 高 | 创建统一配置管理器 | 2小时 | 低 |
| 🔴 高 | 消除重复的学科函数 | 3小时 | 中 |
| 🟡 中 | 清理API/本地模式代码 | 2小时 | 中 |
| 🟡 中 | 删除未使用的代码 | 1小时 | 低 |
| 🟢 低 | 统一错误处理 | 2小时 | 中 |

---

## 四、当前代码架构图

```
当前状态（混乱）:
┌─────────────────────────────────────────────────────────────┐
│  rag_chain.py (1080行)                                      │
│  ├── 全局 llm (deepseek-r1:14b)                            │
│  ├── ModelPool (未使用)                                     │
│  ├── ask_ai_ict(), ask_ai_ces(), ... (13个重复函数)        │
│  ├── ask_ai_ict_stream(), ... (13个重复流式函数)           │
│  ├── ask_ai_ict_stream() (重复定义!)                       │
│  └── SUBJECT_ALIASES (别名映射)                            │
├─────────────────────────────────────────────────────────────┤
│  deepseek_api.py (未被使用)                                 │
├─────────────────────────────────────────────────────────────┤
│  enhanced_analytics_llm.py                                  │
│  └── 单独调用 ask_ai_subject()                             │
├─────────────────────────────────────────────────────────────┤
│  notice_generator.py                                        │
│  └── 单独调用 ask_ai_subject()                             │
└─────────────────────────────────────────────────────────────┘

建议状态（清晰）:
┌─────────────────────────────────────────────────────────────┐
│  llm_config.py (新) ← 统一配置                              │
├─────────────────────────────────────────────────────────────┤
│  llm_provider.py (新) ← 统一LLM访问层                       │
│  └── OllamaProvider / DeepSeekProvider                     │
├─────────────────────────────────────────────────────────────┤
│  rag_chain.py (重构后约400行)                               │
│  ├── SubjectQA 类                                          │
│  │   ├── ask(question, subject_code)                       │
│  │   └── ask_stream(question, subject_code, callbacks)     │
│  └── 知识库检索相关函数                                     │
├─────────────────────────────────────────────────────────────┤
│  其他文件保持简洁调用                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 五、总结

你的代码主要问题在于：
1. **配置分散**：模型名称等配置在多处硬编码且不一致
2. **代码重复**：大量学科函数几乎完全相同
3. **死代码**：存在未使用的类和变量
4. **混乱的API/本地模式**：参数存在但被强制忽略

建议按优先级从高到低进行重构，预计总工作量约 **8-10小时**。

如需要，我可以帮你实现其中任何一个改进方案。
