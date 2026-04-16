"""實用工具 — ToolSpec 描述器

單一結構描述一個工具的所有元資料。首頁 app_modules 會根據這個生成
卡片條目,router 也從這讀需不需要註冊端點。

加新工具的流程:
  1. 寫 <name>_service.py (純函式,可測)
  2. 在 registry.TOOLS 加一個 ToolSpec
  3. 寫對應 web_static/tools/<name>.html + js
  4. (可選) 在 web_static/js/index.js::_appIcons 加對應 SVG

不要在 DEFAULT_APP_MODULES / app_modules.json / 分類系統手改。
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class ToolSpec:
    id: str                    # 'tool_qrcode' — 也用作 _appIcons key
    name_zh: str
    name_en: str
    description_zh: str
    description_en: str
    page_url: str              # '/tools/qrcode' — 前端頁路徑
    needs_backend: bool        # True → 有對應 /api/tools/<...> 端點

    def to_module_entry(self, order: int) -> dict:
        """轉為 DEFAULT_APP_MODULES 可接受的 dict 格式(啟動期使用 zh 為初值)"""
        return {
            "id": self.id,
            "name": self.name_zh,
            "icon": "",             # 留空,前端 _appIcons[id] 接手
            "description": self.description_zh,
            "url": self.page_url,
            "roles": ["student", "teacher", "admin"],
            "enabled": True,
            "order": order,
            "category": "utilities",
        }
