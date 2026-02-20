"""
论坛系统模块 (Forum System)
==========================

类似Piazza的论坛讨论系统，支持：
- 老师发布主题讨论/分享内容
- 学生可见性控制 (public/private)
- 匿名提问
- 投票/点赞
- 实时更新
- 文件附件
- 搜索功能
- 分类标签
- 通知系统

架构：
    API层 (api/)      → 处理HTTP请求/响应
    Service层 (service/) → 业务逻辑
    DAL层 (dal/)      → 数据库访问
    Models (models/)  → Pydantic模型
    Utils (utils/)    → 工具函数
"""

__version__ = "1.0.0"
__author__ = "AI Learning Partner Team"
