"""
視覺識別模組 (Vision Service)
=============================
封裝 Qwen3-VL 多模態模型，提供圖片 OCR 能力：
- 印刷體題目識別
- 手寫答案識別
- 數學公式識別
- 三科（中/英/數/物理）專用識別策略
- 試卷多題識別
- 幾何圖形 schema 驗證

模組結構：
- service.py        — VisionService facade（公開 API）
- ollama_client.py  — Ollama API 通信層
- json_utils.py     — JSON 提取/修復/驗證
- ocr_prompts.py    — 三科 OCR prompt 模板
- ocr_parser.py     — OCR 結果解析
- exam_recognizer.py — 試卷識別鏈路
- figure_handler.py — 幾何圖形描述 + schema 驗證
- geometry_descriptor.py — 幾何描述中間層
- schemas.py        — Pydantic 模型
"""
