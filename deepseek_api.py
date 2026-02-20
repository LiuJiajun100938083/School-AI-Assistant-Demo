# deepseek_api.py - 修复版本，完全符合DeepSeek API文档
import os
import json
import logging
import time
from typing import Optional, Dict, Tuple, Generator, Callable
from openai import OpenAI

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class DeepSeekAPI:
    """DeepSeek云端API客户端 - 修复版本，严格按照官方文档实现"""

    def __init__(self, base_url: str = "https://api.deepseek.com"):
        self.base_url = base_url
        self.api_key = self.get_api_key()
        self.last_check_time = 0
        self.last_check_result = None

        # 使用官方OpenAI SDK
        if self.api_key:
            try:
                self.client = OpenAI(
                    api_key=self.api_key,
                    base_url=self.base_url,
                    timeout=30.0  # 设置超时时间
                )
                logger.info("✅ OpenAI 客户端初始化成功")
            except Exception as e:
                logger.error(f"❌ OpenAI 客户端初始化失败: {e}")
                self.client = None
        else:
            self.client = None

        logger.info(f"🔑 API密钥状态: {'已配置' if self.api_key else '未配置'}")

    def get_api_key(self) -> str:
        """获取API密钥 - 按优先级从多个来源获取"""
        logger.info("🔍 开始获取API密钥...")

        # 方法1: 从环境变量获取（推荐用于生产环境）
        api_key = os.getenv('DEEPSEEK_API_KEY')
        if api_key:
            logger.info("✅ 从环境变量加载API密钥")
            return api_key

        # 方法2: 从配置文件获取
        try:
            config_file = 'deepseek_config.json'
            if os.path.exists(config_file):
                with open(config_file, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    api_key = config.get('api_key', '')
                    if api_key:
                        logger.info(f"✅ 从配置文件加载API密钥: {config_file}")
                        return api_key
            else:
                logger.warning(f"⚠️ 配置文件 {config_file} 不存在")
        except json.JSONDecodeError:
            logger.error("❌ 配置文件格式错误")
        except Exception as e:
            logger.error(f"❌ 读取配置文件失败: {e}")

        # 方法3: 直接在代码中设置（仅用于开发测试）
        PRESET_API_KEY = "your-company-api-key-here"  # 在这里设置你公司的API密钥

        if PRESET_API_KEY and PRESET_API_KEY != "your-company-api-key-here":
            logger.info("✅ 使用预设API密钥")
            return PRESET_API_KEY

        logger.warning("⚠️ 未找到API密钥，请设置环境变量 DEEPSEEK_API_KEY 或修改配置")
        return ""

    def test_connection(self) -> bool:
        """测试API连接 - 修复版本，使用简单的测试调用"""
        if not self.api_key or not self.client:
            logger.warning("🔍 API连接测试: 密钥未配置")
            return False

        try:
            logger.info("🔄 开始连接测试...")
            start_time = time.time()

            # 使用简单的测试消息
            response = self.client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": "Say 'Hello' in one word."}
                ],
                max_tokens=10,
                timeout=10
            )

            duration = int((time.time() - start_time) * 1000)

            success = (response.choices and
                       len(response.choices) > 0 and
                       response.choices[0].message and
                       response.choices[0].message.content is not None)

            if success:
                logger.info(f"🔍 API连接测试成功 ({duration}ms)")
                logger.info(f"📝 测试响应: {response.choices[0].message.content}")
            else:
                logger.error("🔍 API连接测试失败: 响应格式异常")

            logger.info(f"🔍 连接测试结果: {'成功' if success else '失败'}")
            return success

        except Exception as e:
            logger.error(f"❌ API连接测试失败: {e}")
            # 打印更详细的错误信息
            import traceback
            logger.error(f"❌ 详细错误: {traceback.format_exc()}")
            return False

    def chat_completion_stream(
            self,
            messages: list,
            model: str = "deepseek-chat",
            on_reasoning_chunk: Optional[Callable[[str], None]] = None,
            on_content_chunk: Optional[Callable[[str], None]] = None,
            on_complete: Optional[Callable[[str, str], None]] = None,
            on_error: Optional[Callable[[str], None]] = None
    ) -> None:
        """
        流式聊天完成API - 修复版本，严格按照DeepSeek文档实现

        Args:
            messages: 对话消息列表
            model: 模型名称 (deepseek-chat 或 deepseek-reasoner)
            on_reasoning_chunk: 思考过程片段回调
            on_content_chunk: 回答内容片段回调
            on_complete: 完成回调，传入(完整回答, 完整思考过程)
            on_error: 错误回调
        """
        if not self.api_key or not self.client:
            error_msg = "❌ API密钥未配置，请联系管理员设置DeepSeek API密钥"
            logger.error(error_msg)
            if on_error:
                on_error(error_msg)
            return

        try:
            logger.info(f"🌐 开始流式API调用: {model}")
            logger.info(f"📝 消息数量: {len(messages)}")

            # 根据DeepSeek文档设置参数
            params = {
                "model": model,
                "messages": messages,
                "stream": True,
                "timeout": 60
            }

            # 对于推理模型设置更大的max_tokens
            if model == "deepseek-reasoner":
                params["max_tokens"] = 32000
            else:
                params["max_tokens"] = 4000

            # 创建流式响应
            response = self.client.chat.completions.create(**params)

            reasoning_content = ""
            content = ""
            chunk_count = 0

            # 遍历流式响应块
            for chunk in response:
                chunk_count += 1

                try:
                    if chunk.choices and len(chunk.choices) > 0:
                        delta = chunk.choices[0].delta

                        # 处理推理内容（仅推理模型有）
                        if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
                            reasoning_chunk = delta.reasoning_content
                            reasoning_content += reasoning_chunk
                            logger.debug(f"📭 推理块 {chunk_count}: {len(reasoning_chunk)} 字符")

                            # 触发思考过程回调
                            if on_reasoning_chunk:
                                on_reasoning_chunk(reasoning_chunk)

                        # 处理回答内容
                        elif hasattr(delta, 'content') and delta.content:
                            content_chunk = delta.content
                            content += content_chunk
                            logger.debug(f"📝 内容块 {chunk_count}: {len(content_chunk)} 字符")

                            # 触发内容回调
                            if on_content_chunk:
                                on_content_chunk(content_chunk)

                except Exception as chunk_error:
                    logger.warning(f"处理chunk时出错: {chunk_error}")
                    continue

            logger.info(
                f"✅ 流式响应完成: 总块数={chunk_count}, 内容长度={len(content)}, 推理长度={len(reasoning_content)}")

            # 流式完成后触发完成回调
            if on_complete:
                on_complete(content, reasoning_content)

        except Exception as e:
            logger.error(f"❌ 流式API调用异常: {e}")

            # 打印详细错误信息
            import traceback
            logger.error(f"❌ 详细错误堆栈: {traceback.format_exc()}")

            # 处理不同类型的错误
            error_str = str(e).lower()
            if "unauthorized" in error_str or "401" in error_str:
                error_msg = "❌ API密钥无效或已过期，请检查密钥配置"
            elif "rate limit" in error_str or "429" in error_str:
                error_msg = "❌ API调用频率超限，请稍后再试"
            elif "timeout" in error_str:
                error_msg = "❌ API请求超时，请检查网络连接或稍后重试"
            elif "connection" in error_str:
                error_msg = "❌ 无法连接到DeepSeek API服务，请检查网络"
            else:
                error_msg = f"❌ API调用异常: {str(e)}"

            if on_error:
                on_error(error_msg)

    def chat_completion(self, messages: list, model: str = "deepseek-chat") -> Tuple[Optional[str], Optional[str]]:
        """非流式聊天完成API - 修复版本"""
        if not self.api_key or not self.client:
            return "❌ API密钥未配置，请联系管理员设置DeepSeek API密钥", None

        try:
            logger.info(f"🌐 开始非流式API调用: {model}")
            logger.info(f"📝 消息数量: {len(messages)}")

            # 根据DeepSeek文档设置参数
            params = {
                "model": model,
                "messages": messages,
                "timeout": 60
            }

            # 对于推理模型设置更大的max_tokens
            if model == "deepseek-reasoner":
                params["max_tokens"] = 32000
            else:
                params["max_tokens"] = 4000

            response = self.client.chat.completions.create(**params)

            # 处理推理模型的响应
            if model == "deepseek-reasoner":
                reasoning_content = getattr(response.choices[0].message, 'reasoning_content', None)
                content = response.choices[0].message.content
                logger.info(
                    f"✅ 推理模型响应: 内容长度={len(content) if content else 0}, 推理长度={len(reasoning_content) if reasoning_content else 0}")
                return content, reasoning_content
            else:
                content = response.choices[0].message.content
                logger.info(f"✅ 普通模型响应: 内容长度={len(content) if content else 0}")
                return content, None

        except Exception as e:
            logger.error(f"❌ 非流式API调用异常: {e}")

            # 打印详细错误信息
            import traceback
            logger.error(f"❌ 详细错误堆栈: {traceback.format_exc()}")

            error_str = str(e).lower()
            if "unauthorized" in error_str or "401" in error_str:
                return "❌ API密钥无效或已过期，请检查密钥配置", None
            elif "rate limit" in error_str or "429" in error_str:
                return "❌ API调用频率超限，请稍后再试", None
            elif "timeout" in error_str:
                return "❌ API请求超时，请检查网络连接或稍后重试", None
            elif "connection" in error_str:
                return "❌ 无法连接到DeepSeek API服务，请检查网络", None
            else:
                return f"❌ API调用异常: {str(e)}", None

    def get_status(self) -> dict:
        """获取API状态信息 - 增强版本，包含缓存机制"""
        current_time = time.time()

        # 使用缓存结果（5分钟内）
        if (self.last_check_result and
                current_time - self.last_check_time < 300):
            logger.info("🔍 使用缓存的API状态")
            return self.last_check_result

        has_key = bool(self.api_key)
        is_connected = False

        logger.info(f"🔍 检查API状态: 密钥={'存在' if has_key else '不存在'}")

        if has_key and self.client:
            is_connected = self.test_connection()

        status = {
            "has_api_key": has_key,
            "api_connected": is_connected,
            "status": "ready" if (has_key and is_connected) else "not_ready",
            "base_url": self.base_url,
            "client_initialized": self.client is not None,
            "last_check": current_time,
            "message": "API服务正常可用" if is_connected else ("API密钥未配置" if not has_key else "API连接失败")
        }

        # 缓存结果
        self.last_check_result = status
        self.last_check_time = current_time

        logger.info(f"🔍 API状态结果: {status}")
        return status


# 创建全局API客户端实例
deepseek_api = DeepSeekAPI()

# 启动时测试连接
if __name__ == "__main__":
    print("🔍 测试DeepSeek API连接...")
    status = deepseek_api.get_status()

    if status["has_api_key"]:
        if status["api_connected"]:
            print("✅ DeepSeek API连接正常")

            # 测试非流式调用
            print("\n🧪 测试非流式API...")
            test_messages = [
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": "What is 2+2? Answer in one sentence."}
            ]
            answer, thinking = deepseek_api.chat_completion(test_messages, model="deepseek-chat")
            print(f"📝 回答: {answer}")


            # 测试流式调用
            def on_reasoning(chunk):
                print(f"💭 {chunk}", end="", flush=True)


            def on_content(chunk):
                print(f"📝 {chunk}", end="", flush=True)


            def on_complete(content, reasoning):
                print(f"\n✅ 流式完成! 回答长度: {len(content)}, 思考长度: {len(reasoning) if reasoning else 0}")


            def on_error(error):
                print(f"\n❌ 流式错误: {error}")


            print("\n🧪 测试流式API...")
            deepseek_api.chat_completion_stream(
                test_messages,
                model="deepseek-chat",
                on_reasoning_chunk=on_reasoning,
                on_content_chunk=on_content,
                on_complete=on_complete,
                on_error=on_error
            )
        else:
            print("❌ DeepSeek API连接失败")
    else:
        print("⚠️ DeepSeek API密钥未配置")