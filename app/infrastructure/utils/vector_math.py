"""
向量數學工具
============
純函數，無外部依賴，易於單元測試。
"""

import math


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """
    計算兩個向量的余弦相似度，返回 [-1, 1]，越接近 1 越相似。
    輸入為空向量時返回 0.0。
    """
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)
