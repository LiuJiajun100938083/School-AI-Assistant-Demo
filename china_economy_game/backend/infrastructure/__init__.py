"""
Infrastructure 层
数据存储（第一版使用内存存储）
"""
from .memory_store import Room, MemoryStore, memory_store

__all__ = ['Room', 'MemoryStore', 'memory_store']
