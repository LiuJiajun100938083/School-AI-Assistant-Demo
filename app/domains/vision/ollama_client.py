"""
Ollama Vision Client — API 通信層
=================================
封裝對 Ollama qwen3-vl 模型的 HTTP 調用，
包括圖片預處理、base64 編碼、JSON/普通模式切換。
"""

import os
import json
import logging
import base64
import re
import time
from typing import Optional

from app.domains.vision import json_utils

logger = logging.getLogger(__name__)


class OllamaVisionClient:
    """Ollama Vision API 客戶端"""

    def __init__(
        self,
        vision_model: str,
        base_url: str = "http://localhost:11434",
        max_image_size: int = 4 * 1024 * 1024,
        timeout: int = 1200,
    ):
        self._vision_model = vision_model
        self._base_url = base_url
        self._max_image_size = max_image_size
        self._timeout = timeout

    # ================================================================
    #  普通模式調用
    # ================================================================

    async def call_vision_model(
        self, image_path: str, prompt: str,
        priority: int = 2,   # Priority.INTERACTIVE
        weight: int = 2,     # Weight.VISION_SINGLE
    ) -> Optional[str]:
        """
        調用 Ollama qwen3-vl 模型（普通模式）。
        使用 /api/chat 端點，通過 images 參數傳遞圖片。
        經過 AI 調度器排隊，避免高並發雪崩。
        """
        try:
            import httpx
            from app.core.ai_gate import ai_gate

            t_start = time.monotonic()

            image_b64 = encode_image_base64(image_path)
            if not image_b64:
                logger.error("圖片 base64 編碼失敗")
                return None

            t_encode = time.monotonic()

            final_prompt = f"/no_think\n{prompt}"

            payload = {
                "model": self._vision_model,
                "messages": [
                    {
                        "role": "user",
                        "content": final_prompt,
                        "images": [image_b64],
                    }
                ],
                "stream": False,
                "think": False,
                "options": {
                    "temperature": 0.1,
                    "num_predict": 8192,
                },
            }

            timeout = httpx.Timeout(float(self._timeout), connect=10.0)

            t_before_gate = time.monotonic()
            async with ai_gate("vision_ocr", priority=priority, weight=weight) as client:
                t_after_gate = time.monotonic()
                logger.info(
                    "[PERF] normal_mode gate_wait=%.1fs encode=%.1fs",
                    t_after_gate - t_before_gate, t_encode - t_start,
                )
                response = await client.post("/api/chat", json=payload, timeout=timeout)
                response.raise_for_status()
                data = response.json()
            t_model = time.monotonic()

            msg = data.get("message", {})
            raw_content = msg.get("content", "")
            thinking_content = msg.get("thinking", "")

            logger.info(
                "Vision 原始回應: content_len=%d, thinking_len=%d",
                len(raw_content), len(thinking_content),
            )
            if not raw_content and not thinking_content:
                logger.warning("Vision 模型返回完全空回應，完整 data: %s", str(data)[:500])

            content = json_utils.strip_thinking_tags(raw_content)

            # ---- 核心修復：Qwen3-VL 可能把所有輸出放進 thinking 字段 ----
            if not content:
                if thinking_content:
                    logger.info(
                        "content 為空但 thinking 字段有內容 (len=%d)，使用 thinking 作為回應",
                        len(thinking_content),
                    )
                    logger.debug(
                        "thinking 前500字: %s", thinking_content[:500]
                    )
                    content = json_utils.strip_thinking_tags(thinking_content)
                    if not content:
                        content = thinking_content.strip()
                elif raw_content:
                    logger.warning(
                        "strip_thinking_tags 後內容為空，嘗試提取 think 內容, raw_len=%d",
                        len(raw_content),
                    )
                    think_match = re.search(r"<think>(.*?)</think>", raw_content, re.DOTALL)
                    if think_match:
                        content = think_match.group(1).strip()

            # ---- 純推理檢測：先嘗試從中提取嵌入 JSON ----
            is_pure_reasoning = bool(content and json_utils.looks_like_pure_reasoning(content))
            if is_pure_reasoning:
                # 即使是純推理，也嘗試提取嵌入的 JSON
                if "{" in content:
                    embedded = json_utils.extract_json_from_reasoning(content)
                    if embedded and len(embedded) >= 50:
                        try:
                            json.loads(embedded)
                            logger.info(
                                "從純推理文本中成功提取嵌入 JSON (len=%d)",
                                len(embedded),
                            )
                            content = embedded
                            is_pure_reasoning = False
                        except (json.JSONDecodeError, ValueError):
                            pass
                if is_pure_reasoning:
                    logger.info(
                        "thinking 內容為純推理文本 (len=%d)，保留給 recovery",
                        len(content),
                    )

            # ---- 從推理文本中嘗試提取嵌入的 JSON（純推理跳過） ----
            if content and "{" in content and not is_pure_reasoning:
                is_valid_json = False
                try:
                    json_utils.safe_json_loads(content)
                    is_valid_json = True
                    logger.debug("content 直接解析為合法 JSON (len=%d)", len(content))
                except (json.JSONDecodeError, ValueError):
                    pass

                if not is_valid_json:
                    json_candidate = json_utils.extract_json_from_reasoning(content)
                    if json_candidate and len(json_candidate) >= 50:
                        logger.info("從推理文本中提取到嵌入 JSON (len=%d)", len(json_candidate))
                        content = json_candidate
                    elif json_candidate:
                        logger.warning(
                            "從推理文本提取到的 JSON 過小 (len=%d)，跳過: %s",
                            len(json_candidate), json_candidate[:100]
                        )
                    else:
                        extracted = json_utils.extract_json_from_thinking(content)
                        if extracted != content:
                            try:
                                json_utils.safe_json_loads(extracted)
                                size_ratio = len(extracted) / max(len(content), 1)
                                if len(extracted) < 200 and size_ratio < 0.3:
                                    logger.warning(
                                        "thinking 提取結果過小 (len=%d, 原始=%d, 比例=%.1f%%)，"
                                        "可能為子對象，跳過替換。前100字: %s",
                                        len(extracted), len(content),
                                        size_ratio * 100, extracted[:100]
                                    )
                                else:
                                    logger.info("thinking 提取成功 (len=%d)", len(extracted))
                                    content = extracted
                            except (json.JSONDecodeError, ValueError):
                                logger.warning(
                                    "thinking 提取的 JSON 仍無法解析 (len=%d), 前200字: %s",
                                    len(extracted), extracted[:200]
                                )

            # 分流判定
            json_valid = False
            schema_valid = False
            if content:
                try:
                    json.loads(content)
                    json_valid = True
                except (json.JSONDecodeError, ValueError):
                    pass
                schema_valid = json_utils.validate_vision_json(content) if json_valid else False

            logger.info(
                "Vision 普通模式: model=%s, raw_len=%d, thinking_len=%d, final_len=%d, "
                "json_valid=%s, schema_valid=%s",
                self._vision_model,
                len(raw_content), len(thinking_content), len(content),
                json_valid, schema_valid,
            )

            t_end = time.monotonic()
            logger.info(
                "[PERF] normal_mode total=%.1fs model=%.1fs extract=%.1fs",
                t_end - t_start, t_model - t_before_gate, t_end - t_model,
            )

            if schema_valid:
                return content
            if json_valid:
                logger.warning("普通模式: JSON 合法但不符合 vision schema，交由 parser 處理")
                return content
            if content:
                if is_pure_reasoning:
                    # 純推理文本不應交給 recovery parser（會產生垃圾題目）
                    logger.warning(
                        "普通模式: 純推理文本 (len=%d)，無法提取有效 JSON，丟棄。"
                        "qwen3-vl 可能處於 thinking 模式，建議切換到 qwen2.5-vl",
                        len(content),
                    )
                    return None
                else:
                    logger.warning(
                        "普通模式: 非 JSON 非純推理 (len=%d)，交由 recovery parser",
                        len(content),
                    )
                return content
            return None

        except Exception as e:
            logger.error("Vision 模型調用失敗: %s", e, exc_info=True)
            return None

    # ================================================================
    #  JSON 強制模式調用
    # ================================================================

    async def call_vision_model_json(
        self, image_path: str, prompt: str,
        priority: int = 2,   # Priority.INTERACTIVE
        weight: int = 2,     # Weight.VISION_SINGLE
    ) -> Optional[str]:
        """
        調用 Ollama qwen3-vl 模型（強制 JSON 輸出模式）。
        使用 format:"json" 強制 Ollama 約束解碼為合法 JSON。
        經過 AI 調度器排隊，避免高並發雪崩。
        """
        try:
            import httpx
            from app.core.ai_gate import ai_gate

            t_start = time.monotonic()

            image_b64 = encode_image_base64(image_path)
            if not image_b64:
                return None

            payload = {
                "model": self._vision_model,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "/no_think\n"
                            "You are a JSON-only OCR assistant. "
                            "Output EXACTLY one JSON object. "
                            "NEVER output reasoning, analysis, or natural language. "
                            "NEVER start with words like 'First', '首先', 'Let me', '我需要'. "
                            "NEVER describe what you see — directly output the structured JSON. "
                            "If uncertain about a field, use null or empty string, "
                            "but you MUST still output valid JSON."
                        ),
                    },
                    {
                        "role": "user",
                        "content": prompt,
                        "images": [image_b64],
                    },
                ],
                "stream": False,
                "think": False,
                "format": "json",
                "options": {
                    "temperature": 0.1,
                    "num_predict": 8192,
                },
            }

            timeout = httpx.Timeout(180.0, connect=30.0)

            t_before_gate = time.monotonic()
            async with ai_gate("vision_ocr_json", priority=priority, weight=weight) as client:
                t_after_gate = time.monotonic()
                logger.info(
                    "[PERF] json_mode gate_wait=%.1fs",
                    t_after_gate - t_before_gate,
                )
                response = await client.post("/api/chat", json=payload, timeout=timeout)
                response.raise_for_status()
                data = response.json()
            t_model = time.monotonic()

            msg = data.get("message", {})
            content = msg.get("content", "")
            thinking = msg.get("thinking", "")

            logger.info(
                "Vision JSON 模式回應: content_len=%d, thinking_len=%d",
                len(content), len(thinking),
            )

            content = json_utils.strip_thinking_tags(content)

            if not content and thinking:
                logger.info("JSON 模式 content 為空，嘗試從 thinking 提取 (thinking_len=%d)", len(thinking))
                cleaned_thinking = json_utils.strip_thinking_tags(thinking) or thinking
                # 策略 1: extract_json_from_reasoning（改進版，從後往前搜索 "questions"）
                extracted = json_utils.extract_json_from_reasoning(cleaned_thinking)
                if extracted and len(extracted) >= 50:
                    logger.info("JSON 模式: 從 thinking 用 reasoning 提取成功 (len=%d)", len(extracted))
                    content = extracted
                else:
                    # 策略 2: extract_json_from_thinking（通用括號匹配）
                    extracted2 = json_utils.extract_json_from_thinking(cleaned_thinking)
                    if extracted2 and len(extracted2) >= 100:
                        logger.info("JSON 模式: 從 thinking 用 thinking 提取成功 (len=%d)", len(extracted2))
                        content = extracted2
                    else:
                        # 策略 3: 嘗試截斷修復（thinking 可能在 JSON 中間被截斷）
                        if '{' in cleaned_thinking and '"question' in cleaned_thinking:
                            last_brace = cleaned_thinking.rfind('{')
                            # 找包含 "questions" 的最後一個 {
                            for m in re.finditer(r'\{[^{]*?"questions"\s*:', cleaned_thinking):
                                last_brace = m.start()
                            fragment = cleaned_thinking[last_brace:]
                            repaired = json_utils.repair_truncated_json(fragment)
                            if repaired and isinstance(repaired, dict) and ("questions" in repaired or "question" in repaired):
                                content = json.dumps(repaired, ensure_ascii=False)
                                logger.info("JSON 模式: 從 thinking 截斷修復成功 (len=%d)", len(content))

            if content:
                valid = json_utils.validate_vision_json(content)
                if valid:
                    t_end = time.monotonic()
                    logger.info(
                        "[PERF] json_mode total=%.1fs model=%.1fs gate_wait=%.1fs result=PASS",
                        t_end - t_start, t_model - t_after_gate,
                        t_after_gate - t_before_gate,
                    )
                else:
                    logger.warning(
                        "Vision JSON 模式提取到文本但不符合 vision schema (len=%d)，丟棄。前200字: %s",
                        len(content), content[:200],
                    )
                    content = None
            else:
                logger.warning("Vision JSON 模式未能提取有效內容")

            if not content:
                t_end = time.monotonic()
                logger.info(
                    "[PERF] json_mode total=%.1fs model=%.1fs gate_wait=%.1fs result=FAIL",
                    t_end - t_start, t_model - t_after_gate,
                    t_after_gate - t_before_gate,
                )

            return content if content else None

        except Exception as e:
            logger.error("Vision JSON 模式調用失敗: %s", e)
            return None

    # ================================================================
    #  圖片預處理
    # ================================================================

    async def preprocess_image(self, image_path: str) -> str:
        """圖片預處理：HEIC 轉換、壓縮、旋轉校正"""
        try:
            from PIL import Image, ExifTags

            ext = os.path.splitext(image_path)[1].lower()
            if ext in (".heic", ".heif"):
                img = convert_heic_to_pil(image_path)
                if img is None:
                    raise ValueError(f"無法轉換 HEIC 文件: {image_path}")
            else:
                img = Image.open(image_path)

            # EXIF 旋轉校正
            try:
                exif = img._getexif()
                if exif:
                    for key, val in exif.items():
                        if ExifTags.TAGS.get(key) == "Orientation":
                            if val == 3:
                                img = img.rotate(180, expand=True)
                            elif val == 6:
                                img = img.rotate(270, expand=True)
                            elif val == 8:
                                img = img.rotate(90, expand=True)
                            break
            except (AttributeError, KeyError):
                pass

            max_dim = 2048
            if max(img.size) > max_dim:
                ratio = max_dim / max(img.size)
                new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
                img = img.resize(new_size, Image.LANCZOS)

            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")

            processed_dir = os.path.join(
                os.path.dirname(image_path), ".processed"
            )
            os.makedirs(processed_dir, exist_ok=True)
            processed_path = os.path.join(
                processed_dir,
                os.path.basename(image_path).rsplit(".", 1)[0] + ".jpg",
            )
            img.save(processed_path, "JPEG", quality=90)

            logger.debug("圖片預處理完成: %s → %s", image_path, processed_path)
            return processed_path

        except ImportError:
            logger.error("Pillow 未安裝，無法預處理圖片")
            raise RuntimeError("Pillow 未安裝，請執行: pip install Pillow")
        except Exception as e:
            logger.error("圖片預處理失敗: %s", e)
            raise RuntimeError(f"圖片預處理失敗: {e}")


# ================================================================
#  工具函數
# ================================================================

def encode_image_base64(image_path: str) -> Optional[str]:
    """將圖片編碼為 base64 字串"""
    try:
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")
    except Exception as e:
        logger.error("圖片 base64 編碼失敗: %s", e)
        return None


def convert_heic_to_pil(image_path: str):
    """將 HEIC/HEIF 圖片轉為 PIL Image 對象"""
    try:
        from pillow_heif import register_heif_opener
        register_heif_opener()
        from PIL import Image
        return Image.open(image_path)
    except ImportError:
        pass

    try:
        import pyheif
        from PIL import Image
        heif_file = pyheif.read(image_path)
        return Image.frombytes(
            heif_file.mode,
            heif_file.size,
            heif_file.data,
            "raw",
            heif_file.mode,
            heif_file.stride,
        )
    except ImportError:
        pass

    logger.error(
        "無法處理 HEIC 文件，請安裝 pillow-heif: "
        "pip install pillow-heif"
    )
    return None
