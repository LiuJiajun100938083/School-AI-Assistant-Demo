"""
服务层统一入口
==============
提供 ServiceContainer 和所有 Service 的导出

用法:
    from app.services import get_services
    services = get_services()
    user = services.user.get_user("admin")
"""

from app.services.container import ServiceContainer, get_services, init_services

__all__ = ["ServiceContainer", "get_services", "init_services"]
