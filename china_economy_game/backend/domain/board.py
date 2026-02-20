"""
Domain - 棋盘系统
定义棋盘、格子及其规则
"""
from dataclasses import dataclass, field
from typing import Optional
from .enums import TileType, TransportType, GameStage


@dataclass
class TransportConnection:
    """运输连接"""
    transport_type: TransportType  # 运输类型
    destination_index: int         # 目的地格子索引
    name: str = ""                 # 连接名称（如：北京-上海）


@dataclass
class Tile:
    """棋盘格子"""
    index: int                      # 格子索引
    tile_type: TileType             # 格子类型
    name: str                       # 格子名称
    city: str = ""                  # 所属城市

    # 产业格属性
    allowed_industries: list[str] = field(default_factory=list)  # 允许的产业ID列表
    stage_available: GameStage = GameStage.STAGE_ONE  # 该格子从哪个阶段开始可用

    # 运输格属性
    transport_connections: list[TransportConnection] = field(default_factory=list)

    # 功能格属性
    system_action: str = ""  # 功能格动作（如："抽卡"、"政策触发"）

    def is_industry_tile(self) -> bool:
        """是否为产业格"""
        return self.tile_type == TileType.INDUSTRY

    def is_transport_tile(self) -> bool:
        """是否为运输格"""
        return self.tile_type == TileType.TRANSPORT

    def is_start_tile(self) -> bool:
        """是否为起点格"""
        return self.tile_type == TileType.START

    def is_system_tile(self) -> bool:
        """是否为功能格"""
        return self.tile_type == TileType.SYSTEM

    def can_build_industry(self, industry_id: str, current_stage: GameStage) -> bool:
        """判断是否可以在此格子建设指定产业"""
        if not self.is_industry_tile():
            return False
        if current_stage.value < self.stage_available.value:
            return False
        if self.allowed_industries and industry_id not in self.allowed_industries:
            return False
        return True

    def get_transport_destinations(self) -> list[TransportConnection]:
        """获取运输目的地列表"""
        return self.transport_connections

    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "index": self.index,
            "tile_type": self.tile_type.value,
            "name": self.name,
            "city": self.city,
            "allowed_industries": self.allowed_industries,
            "stage_available": self.stage_available.value,
            "transport_connections": [
                {
                    "type": tc.transport_type.value,
                    "destination": tc.destination_index,
                    "name": tc.name
                } for tc in self.transport_connections
            ],
            "system_action": self.system_action
        }


class Board:
    """游戏棋盘"""

    def __init__(self):
        self._tiles: list[Tile] = []
        self._initialize_board()

    def _initialize_board(self):
        """初始化棋盘 - 创建固定顺序的环形棋盘"""
        # 棋盘设计：24格环形棋盘
        # 模拟中国改革开放的地理与经济布局

        tiles_config = [
            # 0: 起点 - 深圳（改革开放窗口）
            {"type": TileType.START, "name": "起点·深圳", "city": "深圳"},

            # 1: 产业格 - 珠三角轻工业区
            {"type": TileType.INDUSTRY, "name": "珠三角轻工业区", "city": "广州",
             "industries": ["S1_TEXTILE", "S1_APPLIANCE", "S2_TEXTILE"],
             "stage": GameStage.STAGE_ONE},

            # 2: 产业格 - 家具产业区
            {"type": TileType.INDUSTRY, "name": "佛山家具城", "city": "佛山",
             "industries": ["S1_FURNITURE", "S2_FURNITURE"],
             "stage": GameStage.STAGE_ONE},

            # 3: 功能格 - 政策咨询
            {"type": TileType.SYSTEM, "name": "政策咨询中心", "city": "广州",
             "action": "抽取政策卡"},

            # 4: 运输格 - 广州港（海运）
            {"type": TileType.TRANSPORT, "name": "广州港", "city": "广州",
             "connections": [
                 TransportConnection(TransportType.SHIPPING, 12, "广州-上海航线"),
                 TransportConnection(TransportType.SHIPPING, 20, "广州-天津航线"),
             ]},

            # 5: 产业格 - 食品加工区
            {"type": TileType.INDUSTRY, "name": "华南食品加工区", "city": "东莞",
             "industries": ["S1_FOOD", "S2_FOOD"],
             "stage": GameStage.STAGE_ONE},

            # 6: 产业格 - 长三角重工业（第一阶段）
            {"type": TileType.INDUSTRY, "name": "武汉重工基地", "city": "武汉",
             "industries": ["S1_HEAVY", "S2_HEAVY"],
             "stage": GameStage.STAGE_ONE},

            # 7: 运输格 - 武汉铁路枢纽
            {"type": TileType.TRANSPORT, "name": "武汉铁路枢纽", "city": "武汉",
             "connections": [
                 TransportConnection(TransportType.RAILWAY, 15, "京广线北段"),
                 TransportConnection(TransportType.RAILWAY, 11, "沪汉线"),
             ]},

            # 8: 功能格 - 投资机会
            {"type": TileType.SYSTEM, "name": "招商引资大会", "city": "南京",
             "action": "特殊投资机会"},

            # 9: 产业格 - 石化基地（第二阶段）
            {"type": TileType.INDUSTRY, "name": "长江石化走廊", "city": "南京",
             "industries": ["S2_PETROCHEMICAL"],
             "stage": GameStage.STAGE_TWO},

            # 10: 产业格 - 纺织基地
            {"type": TileType.INDUSTRY, "name": "江浙纺织基地", "city": "苏州",
             "industries": ["S1_TEXTILE", "S2_TEXTILE"],
             "stage": GameStage.STAGE_ONE},

            # 11: 产业格 - 家电产业
            {"type": TileType.INDUSTRY, "name": "长三角家电城", "city": "无锡",
             "industries": ["S1_APPLIANCE"],
             "stage": GameStage.STAGE_ONE},

            # 12: 运输格 - 上海港
            {"type": TileType.TRANSPORT, "name": "上海港", "city": "上海",
             "connections": [
                 TransportConnection(TransportType.SHIPPING, 4, "上海-广州航线"),
                 TransportConnection(TransportType.SHIPPING, 20, "上海-天津航线"),
             ]},

            # 13: 产业格 - 金融中心（第二阶段，需高级人力）
            {"type": TileType.INDUSTRY, "name": "陆家嘴金融区", "city": "上海",
             "industries": ["S2_FINANCE"],
             "stage": GameStage.STAGE_TWO},

            # 14: 功能格 - 人才市场
            {"type": TileType.SYSTEM, "name": "高端人才市场", "city": "上海",
             "action": "招聘高级人力"},

            # 15: 运输格 - 京沪高铁
            {"type": TileType.TRANSPORT, "name": "京沪高铁站", "city": "济南",
             "connections": [
                 TransportConnection(TransportType.RAILWAY, 7, "京沪线南段"),
                 TransportConnection(TransportType.RAILWAY, 19, "京沪线北段"),
             ]},

            # 16: 产业格 - 医药产业（第二阶段）
            {"type": TileType.INDUSTRY, "name": "医药产业园", "city": "石家庄",
             "industries": ["S2_MEDICINE"],
             "stage": GameStage.STAGE_TWO},

            # 17: 产业格 - 旅游文化（第二阶段）
            {"type": TileType.INDUSTRY, "name": "文化旅游区", "city": "西安",
             "industries": ["S2_TOURISM"],
             "stage": GameStage.STAGE_TWO},

            # 18: 功能格 - 政策发布
            {"type": TileType.SYSTEM, "name": "国务院政策发布", "city": "北京",
             "action": "执行政策事件"},

            # 19: 产业格 - 高新技术（第二阶段，需高级人力）
            {"type": TileType.INDUSTRY, "name": "中关村科技园", "city": "北京",
             "industries": ["S2_HIGHTECH"],
             "stage": GameStage.STAGE_TWO},

            # 20: 运输格 - 天津港
            {"type": TileType.TRANSPORT, "name": "天津港", "city": "天津",
             "connections": [
                 TransportConnection(TransportType.SHIPPING, 4, "天津-广州航线"),
                 TransportConnection(TransportType.SHIPPING, 12, "天津-上海航线"),
             ]},

            # 21: 产业格 - 重工业基地
            {"type": TileType.INDUSTRY, "name": "东北重工基地", "city": "沈阳",
             "industries": ["S1_HEAVY", "S2_HEAVY"],
             "stage": GameStage.STAGE_ONE},

            # 22: 产业格 - 食品加工
            {"type": TileType.INDUSTRY, "name": "东北粮食加工区", "city": "长春",
             "industries": ["S1_FOOD", "S2_FOOD"],
             "stage": GameStage.STAGE_ONE},

            # 23: 功能格 - 事件抽卡
            {"type": TileType.SYSTEM, "name": "时代机遇", "city": "哈尔滨",
             "action": "抽取事件卡"},
        ]

        for i, config in enumerate(tiles_config):
            tile = Tile(
                index=i,
                tile_type=config["type"],
                name=config["name"],
                city=config.get("city", ""),
                allowed_industries=config.get("industries", []),
                stage_available=config.get("stage", GameStage.STAGE_ONE),
                transport_connections=config.get("connections", []),
                system_action=config.get("action", "")
            )
            self._tiles.append(tile)

    def get_tile(self, index: int) -> Optional[Tile]:
        """获取指定索引的格子"""
        if 0 <= index < len(self._tiles):
            return self._tiles[index]
        return None

    def get_all_tiles(self) -> list[Tile]:
        """获取所有格子"""
        return self._tiles.copy()

    def get_tile_count(self) -> int:
        """获取格子总数"""
        return len(self._tiles)

    def get_next_position(self, current: int, steps: int = 1) -> int:
        """获取移动后的位置（顺时针环形）"""
        return (current + steps) % len(self._tiles)

    def get_start_position(self) -> int:
        """获取起点位置"""
        for tile in self._tiles:
            if tile.is_start_tile():
                return tile.index
        return 0

    def get_industry_tiles(self) -> list[Tile]:
        """获取所有产业格"""
        return [t for t in self._tiles if t.is_industry_tile()]

    def get_transport_tiles(self) -> list[Tile]:
        """获取所有运输格"""
        return [t for t in self._tiles if t.is_transport_tile()]

    def is_valid_transport_destination(self, from_index: int, to_index: int) -> bool:
        """验证运输目的地是否有效"""
        tile = self.get_tile(from_index)
        if not tile or not tile.is_transport_tile():
            return False
        for conn in tile.transport_connections:
            if conn.destination_index == to_index:
                return True
        return False

    def passed_start(self, old_pos: int, new_pos: int) -> bool:
        """判断是否经过起点"""
        start_pos = self.get_start_position()
        if old_pos == new_pos:
            return False
        # 顺时针移动，如果新位置小于等于旧位置，说明绕了一圈
        if new_pos <= old_pos and old_pos != start_pos:
            return True
        # 或者直接经过起点
        if old_pos < start_pos <= new_pos:
            return False  # 没经过
        if new_pos < start_pos and old_pos >= start_pos:
            return False  # 没经过
        return new_pos <= start_pos < old_pos or (old_pos > new_pos)

    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "tile_count": len(self._tiles),
            "tiles": [tile.to_dict() for tile in self._tiles]
        }


# 创建全局棋盘实例
GAME_BOARD = Board()
