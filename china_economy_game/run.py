#!/usr/bin/env python3
"""
中国经济发展桌游 - 启动脚本
"""
import uvicorn
import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    print("=" * 50)
    print("🇨🇳 中国经济发展桌游")
    print("=" * 50)
    print()
    print("启动服务器...")
    print("访问地址: http://localhost:8000")
    print("API文档: http://localhost:8000/docs")
    print()
    print("按 Ctrl+C 停止服务器")
    print("=" * 50)

    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=["backend", "frontend"]
    )
