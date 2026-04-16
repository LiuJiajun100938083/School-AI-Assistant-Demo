#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
虚拟宠物系统 — Repository 层

封装所有数据库操作。遵循 BaseRepository 模式，全部参数化查询。
"""

import logging
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from app.domains.pet.constants import DEFAULT_SHOP_ITEMS
from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


# ============================================================
# 宠物 Repository
# ============================================================

class PetRepository(BaseRepository):
    """user_pets 表操作"""

    TABLE = "user_pets"

    def init_table(self) -> None:
        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_pets (
                    id          INT AUTO_INCREMENT PRIMARY KEY,
                    user_id     INT NOT NULL COMMENT '用户 ID (users.id)',
                    user_role   VARCHAR(20) NOT NULL DEFAULT 'student' COMMENT 'student/teacher/admin',
                    pet_name    VARCHAR(50) NOT NULL DEFAULT '小宠',

                    -- 外观部件
                    body_type   TINYINT NOT NULL DEFAULT 0,
                    color_id    TINYINT NOT NULL DEFAULT 0,
                    pattern_id  TINYINT NOT NULL DEFAULT 0,
                    eyes_id     TINYINT NOT NULL DEFAULT 0,
                    ears_id     TINYINT NOT NULL DEFAULT 0,
                    tail_id     TINYINT NOT NULL DEFAULT 0,

                    -- 属性
                    hunger      INT NOT NULL DEFAULT 100,
                    hygiene     INT NOT NULL DEFAULT 100,
                    mood        INT NOT NULL DEFAULT 100,
                    growth      INT NOT NULL DEFAULT 0,
                    coins       INT NOT NULL DEFAULT 0,

                    -- 学科倾向 XP
                    science_xp      INT NOT NULL DEFAULT 0,
                    humanities_xp   INT NOT NULL DEFAULT 0,
                    business_xp     INT NOT NULL DEFAULT 0,
                    tech_xp         INT NOT NULL DEFAULT 0,

                    -- 性格
                    personality         VARCHAR(20) NOT NULL DEFAULT 'creative',
                    personality_updated_at DATE DEFAULT NULL,

                    -- 衰减追踪
                    last_decay_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

                    backfilled  TINYINT NOT NULL DEFAULT 0 COMMENT '历史金币是否已补发',

                    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

                    UNIQUE INDEX uk_user (user_id),
                    INDEX idx_growth (growth DESC),
                    INDEX idx_coins (coins DESC)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                COMMENT='虚拟宠物'
            """)

            # 迁移：已有表加 backfilled 列
            try:
                self.pool.execute(
                    "ALTER TABLE user_pets ADD COLUMN backfilled TINYINT NOT NULL DEFAULT 0 COMMENT '历史金币是否已补发'"
                )
            except Exception:
                pass  # 列已存在

    def mark_backfilled(self, user_id: int) -> None:
        self.update(data={"backfilled": 1}, where="user_id = %s", params=(user_id,))

    def get_by_user(self, user_id: int) -> Optional[Dict[str, Any]]:
        return self.find_one("user_id = %s", (user_id,))

    def create_pet(self, user_id: int, user_role: str, pet_name: str,
                   body_type: int, color_id: int, pattern_id: int,
                   eyes_id: int, ears_id: int, tail_id: int) -> int:
        sql = """
            INSERT INTO user_pets
                (user_id, user_role, pet_name, body_type, color_id, pattern_id, eyes_id, ears_id, tail_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(sql, (user_id, user_role, pet_name,
                                 body_type, color_id, pattern_id,
                                 eyes_id, ears_id, tail_id))
            return cursor.lastrowid

    def update_appearance(self, user_id: int, **fields) -> None:
        """更新外观部件（仅传入的字段）"""
        allowed = {"pet_name", "body_type", "color_id", "pattern_id", "eyes_id", "ears_id", "tail_id"}
        updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
        if not updates:
            return
        set_clause = ", ".join(f"{k} = %s" for k in updates)
        params = list(updates.values()) + [user_id]
        sql = f"UPDATE user_pets SET {set_clause} WHERE user_id = %s"
        with self.transaction() as conn:
            conn.cursor().execute(sql, params)

    def update_attributes(self, user_id: int, hunger: int, hygiene: int,
                          mood: int, last_decay_at: datetime) -> None:
        """更新属性（衰减计算后）"""
        sql = """
            UPDATE user_pets
            SET hunger = %s, hygiene = %s, mood = %s, last_decay_at = %s
            WHERE user_id = %s
        """
        with self.transaction() as conn:
            conn.cursor().execute(sql, (hunger, hygiene, mood, last_decay_at, user_id))

    def apply_item_effect(self, user_id: int, effect_type: str, effect_value: int) -> None:
        """应用物品效果（增加属性值，上限 100）"""
        sql = f"""
            UPDATE user_pets
            SET {effect_type} = LEAST(100, {effect_type} + %s),
                growth = growth + %s
            WHERE user_id = %s
        """
        growth_bonus = max(1, effect_value // 10)
        with self.transaction() as conn:
            conn.cursor().execute(sql, (effect_value, growth_bonus, user_id))

    def update_coins(self, user_id: int, delta: int) -> Optional[int]:
        """原子更新金币余额，返回更新后余额。余额不足时返回 None。"""
        if delta < 0:
            sql = """
                UPDATE user_pets SET coins = coins + %s
                WHERE user_id = %s AND coins >= %s
            """
            with self.transaction() as conn:
                cursor = conn.cursor()
                cursor.execute(sql, (delta, user_id, abs(delta)))
                if cursor.rowcount == 0:
                    return None
                cursor.execute("SELECT coins FROM user_pets WHERE user_id = %s", (user_id,))
                row = cursor.fetchone()
                return row["coins"] if row else None
        else:
            sql = "UPDATE user_pets SET coins = coins + %s WHERE user_id = %s"
            with self.transaction() as conn:
                cursor = conn.cursor()
                cursor.execute(sql, (delta, user_id))
                cursor.execute("SELECT coins FROM user_pets WHERE user_id = %s", (user_id,))
                row = cursor.fetchone()
                return row["coins"] if row else None

    def set_coins(self, user_id: int, amount: int) -> None:
        """直接设置金币（管理员用）"""
        sql = "UPDATE user_pets SET coins = %s WHERE user_id = %s"
        with self.transaction() as conn:
            conn.cursor().execute(sql, (amount, user_id))

    def update_subject_xp(self, user_id: int, group: str, xp: int) -> None:
        """增加学科 XP"""
        col = f"{group}_xp"
        if col not in ("science_xp", "humanities_xp", "business_xp", "tech_xp"):
            return
        sql = f"UPDATE user_pets SET {col} = {col} + %s WHERE user_id = %s"
        with self.transaction() as conn:
            conn.cursor().execute(sql, (xp, user_id))

    def update_personality(self, user_id: int, personality: str) -> None:
        sql = "UPDATE user_pets SET personality = %s, personality_updated_at = %s WHERE user_id = %s"
        with self.transaction() as conn:
            conn.cursor().execute(sql, (personality, date.today(), user_id))

    def get_leaderboard(self, order_by: str = "growth DESC",
                        role: Optional[str] = None,
                        class_name: Optional[str] = None,
                        limit: int = 20) -> List[Dict]:
        """排行榜查询"""
        sql = """
            SELECT p.*, u.display_name, u.class_name
            FROM user_pets p
            JOIN users u ON p.user_id = u.id
        """
        conditions = []
        params = []
        if role:
            roles = [r.strip() for r in role.split(",")]
            if len(roles) == 1:
                conditions.append("p.user_role = %s")
                params.append(roles[0])
            else:
                placeholders = ", ".join(["%s"] * len(roles))
                conditions.append(f"p.user_role IN ({placeholders})")
                params.extend(roles)
        if class_name:
            conditions.append("u.class_name = %s")
            params.append(class_name)
        if conditions:
            sql += " WHERE " + " AND ".join(conditions)
        sql += f" ORDER BY {order_by} LIMIT %s"
        params.append(limit)
        return self.pool.execute(sql, params)


    def get_class_pets(self, class_name: str) -> List[Dict]:
        """获取某班所有学生的宠物详细数据（含未创建宠物的学生）"""
        sql = """
            SELECT u.id AS user_id, u.display_name, u.class_name,
                   p.pet_name, p.body_type, p.color_id, p.pattern_id,
                   p.eyes_id, p.ears_id, p.tail_id,
                   p.hunger, p.hygiene, p.mood, p.growth, p.coins,
                   p.personality, p.science_xp, p.humanities_xp,
                   p.business_xp, p.tech_xp, p.last_decay_at,
                   s.current_streak
            FROM users u
            LEFT JOIN user_pets p ON u.id = p.user_id
            LEFT JOIN user_streaks s ON u.id = s.user_id
            WHERE u.class_name = %s AND u.role = 'student' AND u.is_active = 1
            ORDER BY COALESCE(p.growth, 0) DESC
        """
        return self.pool.execute(sql, (class_name,))

    def get_classes_summary(self, class_names: List[str]) -> List[Dict]:
        """获取多个班级的宠物汇总统计"""
        if not class_names:
            return []
        placeholders = ",".join(["%s"] * len(class_names))
        sql = f"""
            SELECT u.class_name,
                   COUNT(DISTINCT u.id) AS total_students,
                   COUNT(DISTINCT p.user_id) AS pet_count,
                   CAST(COALESCE(AVG(p.growth), 0) AS SIGNED) AS avg_growth,
                   CAST(COALESCE(AVG(p.coins), 0) AS SIGNED) AS avg_coins,
                   CAST(COALESCE(AVG((COALESCE(p.hunger,0)+COALESCE(p.hygiene,0)+COALESCE(p.mood,0))/3), 0) AS SIGNED) AS avg_care
            FROM users u
            LEFT JOIN user_pets p ON u.id = p.user_id
            WHERE u.class_name IN ({placeholders}) AND u.role = 'student' AND u.is_active = 1
            GROUP BY u.class_name
            ORDER BY u.class_name
        """
        return self.pool.execute(sql, class_names)


# ============================================================
# 金币流水 Repository
# ============================================================

class CoinTransactionRepository(BaseRepository):
    """pet_coin_transactions 表操作"""

    TABLE = "pet_coin_transactions"

    def init_table(self) -> None:
        with self.transaction() as conn:
            conn.cursor().execute("""
                CREATE TABLE IF NOT EXISTS pet_coin_transactions (
                    id          INT AUTO_INCREMENT PRIMARY KEY,
                    user_id     INT NOT NULL,
                    user_role   VARCHAR(20) NOT NULL DEFAULT 'student',
                    amount      INT NOT NULL COMMENT '正=获得 负=消费/扣除',
                    source_type VARCHAR(50) NOT NULL COMMENT '来源类型',
                    source_id   VARCHAR(100) DEFAULT NULL COMMENT '关联原始记录ID',
                    reason      VARCHAR(200) DEFAULT NULL COMMENT '手动操作原因',
                    operated_by INT DEFAULT NULL COMMENT '操作者ID（系统自动则NULL）',
                    balance_after INT NOT NULL DEFAULT 0 COMMENT '交易后余额',
                    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

                    INDEX idx_user (user_id),
                    INDEX idx_source (source_type, source_id),
                    INDEX idx_date (created_at),
                    UNIQUE INDEX uk_no_dup (user_id, source_type, source_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                COMMENT='宠物金币流水'
            """)

    def record_transaction(self, user_id: int, user_role: str, amount: int,
                           source_type: str, balance_after: int,
                           source_id: Optional[str] = None,
                           reason: Optional[str] = None,
                           operated_by: Optional[int] = None) -> int:
        sql = """
            INSERT INTO pet_coin_transactions
                (user_id, user_role, amount, source_type, source_id, reason, operated_by, balance_after)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """
        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(sql, (user_id, user_role, amount, source_type,
                                 source_id, reason, operated_by, balance_after))
            return cursor.lastrowid

    def has_transaction(self, user_id: int, source_type: str, source_id: str) -> bool:
        """检查是否已有相同来源的交易（防重复）"""
        row = self.find_one(
            "user_id = %s AND source_type = %s AND source_id = %s",
            (user_id, source_type, source_id)
        )
        return row is not None

    def get_daily_earned(self, user_id: int, today: Optional[date] = None) -> int:
        """获取今日已赚取金币总额（只算正数）"""
        if today is None:
            today = date.today()
        sql = """
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM pet_coin_transactions
            WHERE user_id = %s AND amount > 0 AND DATE(created_at) = %s
              AND source_type NOT IN ('admin_award', 'teacher_award')
        """
        row = self.pool.execute_one(sql, (user_id, today))
        return row["total"] if row else 0

    def get_weekly_earned(self, user_id: int) -> int:
        """获取本周已赚取金币（周一起算）"""
        sql = """
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM pet_coin_transactions
            WHERE user_id = %s AND amount > 0
              AND created_at >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
        """
        row = self.pool.execute_one(sql, (user_id,))
        return row["total"] if row else 0

    def get_total_earned(self, user_id: int) -> int:
        """累计赚取总额（正数）"""
        sql = """
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM pet_coin_transactions
            WHERE user_id = %s AND amount > 0
        """
        row = self.pool.execute_one(sql, (user_id,))
        return row["total"] if row else 0

    def get_history(self, user_id: int, limit: int = 50) -> List[Dict]:
        return self.find_all(
            where="user_id = %s",
            params=(user_id,),
            order_by="created_at DESC",
            limit=limit
        )


# ============================================================
# 商店 Repository
# ============================================================

class ShopItemRepository(BaseRepository):
    """pet_shop_items 表操作"""

    TABLE = "pet_shop_items"

    def init_table(self) -> None:
        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS pet_shop_items (
                    id          INT AUTO_INCREMENT PRIMARY KEY,
                    name        VARCHAR(50) NOT NULL,
                    category    VARCHAR(20) NOT NULL COMMENT 'food/hygiene/toy/decoration',
                    price       INT NOT NULL DEFAULT 10,
                    effect_type VARCHAR(20) NOT NULL COMMENT 'hunger/hygiene/mood/growth',
                    effect_value INT NOT NULL DEFAULT 10,
                    icon        VARCHAR(50) NOT NULL DEFAULT 'default',
                    enabled     TINYINT(1) NOT NULL DEFAULT 1,
                    sort_order  INT NOT NULL DEFAULT 0,

                    INDEX idx_category (category),
                    INDEX idx_enabled (enabled)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                COMMENT='宠物商店物品'
            """)
            # 如果表为空，插入默认商品
            cursor.execute("SELECT COUNT(*) AS cnt FROM pet_shop_items")
            row = cursor.fetchone()
            if row and row["cnt"] == 0:
                for item in DEFAULT_SHOP_ITEMS:
                    cursor.execute("""
                        INSERT INTO pet_shop_items
                            (name, category, price, effect_type, effect_value, icon, sort_order)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """, (item["name"], item["category"], item["price"],
                          item["effect_type"], item["effect_value"],
                          item["icon"], item["sort_order"]))
                logger.info("已插入 %d 个默认商品", len(DEFAULT_SHOP_ITEMS))

    def get_enabled_items(self, category: Optional[str] = None) -> List[Dict]:
        if category:
            return self.find_all("enabled = 1 AND category = %s", (category,), order_by="sort_order")
        return self.find_all("enabled = 1", order_by="sort_order")

    def get_item(self, item_id: int) -> Optional[Dict]:
        return self.find_by_id(item_id)


# ============================================================
# Streak Repository
# ============================================================

class StreakRepository(BaseRepository):
    """user_streaks 表操作"""

    TABLE = "user_streaks"

    def init_table(self) -> None:
        with self.transaction() as conn:
            conn.cursor().execute("""
                CREATE TABLE IF NOT EXISTS user_streaks (
                    id              INT AUTO_INCREMENT PRIMARY KEY,
                    user_id         INT NOT NULL,
                    user_role       VARCHAR(20) NOT NULL DEFAULT 'student',
                    current_streak  INT NOT NULL DEFAULT 0,
                    longest_streak  INT NOT NULL DEFAULT 0,
                    last_active_date DATE DEFAULT NULL,
                    streak_freeze_count INT NOT NULL DEFAULT 0,
                    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

                    UNIQUE INDEX uk_user (user_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                COMMENT='连续学习 Streak'
            """)

    def get_by_user(self, user_id: int) -> Optional[Dict]:
        return self.find_one("user_id = %s", (user_id,))

    def upsert_streak(self, user_id: int, user_role: str,
                      current: int, longest: int,
                      last_active: date, freeze_count: int) -> None:
        sql = """
            INSERT INTO user_streaks
                (user_id, user_role, current_streak, longest_streak, last_active_date, streak_freeze_count)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                current_streak = VALUES(current_streak),
                longest_streak = VALUES(longest_streak),
                last_active_date = VALUES(last_active_date),
                streak_freeze_count = VALUES(streak_freeze_count)
        """
        with self.transaction() as conn:
            conn.cursor().execute(sql, (user_id, user_role, current, longest, last_active, freeze_count))


# ============================================================
# 成就 Repository
# ============================================================

class AchievementRepository(BaseRepository):
    """pet_achievements + user_achievements 表操作"""

    TABLE = "user_achievements"

    def init_table(self) -> None:
        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS pet_achievements (
                    id              INT AUTO_INCREMENT PRIMARY KEY,
                    achievement_code VARCHAR(50) NOT NULL,
                    name            VARCHAR(50) NOT NULL,
                    description     VARCHAR(200) NOT NULL,
                    reward_coins    INT NOT NULL DEFAULT 0,
                    icon            VARCHAR(50) NOT NULL DEFAULT 'default',
                    sort_order      INT NOT NULL DEFAULT 0,

                    UNIQUE INDEX uk_code (achievement_code)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                COMMENT='成就定义'
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_achievements (
                    id              INT AUTO_INCREMENT PRIMARY KEY,
                    user_id         INT NOT NULL,
                    achievement_code VARCHAR(50) NOT NULL,
                    unlocked_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

                    UNIQUE INDEX uk_user_achievement (user_id, achievement_code),
                    INDEX idx_user (user_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                COMMENT='用户已解锁成就'
            """)

    def seed_achievements(self, achievements: list) -> None:
        """写入成就定义（冪等）"""
        sql = """
            INSERT IGNORE INTO pet_achievements
                (achievement_code, name, description, reward_coins, icon, sort_order)
            VALUES (%s, %s, %s, %s, %s, %s)
        """
        with self.transaction() as conn:
            cursor = conn.cursor()
            for i, a in enumerate(achievements):
                cursor.execute(sql, (a["code"], a["name"], a["description"],
                                     a["reward_coins"], a["icon"], i))

    def get_user_achievements(self, user_id: int) -> List[Dict]:
        sql = """
            SELECT a.*, ua.unlocked_at
            FROM pet_achievements a
            LEFT JOIN user_achievements ua ON a.achievement_code = ua.achievement_code AND ua.user_id = %s
            ORDER BY a.sort_order
        """
        return self.pool.execute(sql, (user_id,))

    def has_achievement(self, user_id: int, code: str) -> bool:
        row = self.find_one("user_id = %s AND achievement_code = %s", (user_id, code))
        return row is not None

    def unlock(self, user_id: int, code: str) -> bool:
        """解锁成就，返回是否是新解锁"""
        sql = "INSERT IGNORE INTO user_achievements (user_id, achievement_code) VALUES (%s, %s)"
        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(sql, (user_id, code))
            return cursor.rowcount > 0


# ============================================================
# 点赞 Repository
# ============================================================

class LikeRepository(BaseRepository):
    """pet_likes 表操作"""

    TABLE = "pet_likes"

    def init_table(self) -> None:
        with self.transaction() as conn:
            conn.cursor().execute("""
                CREATE TABLE IF NOT EXISTS pet_likes (
                    id          INT AUTO_INCREMENT PRIMARY KEY,
                    from_user_id INT NOT NULL,
                    to_user_id  INT NOT NULL,
                    message_code TINYINT NOT NULL DEFAULT 0,
                    created_at  DATE NOT NULL,

                    UNIQUE INDEX uk_daily_like (from_user_id, to_user_id, created_at),
                    INDEX idx_to_user (to_user_id, created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                COMMENT='宠物点赞'
            """)

    def add_like(self, from_user_id: int, to_user_id: int,
                 message_code: int, today: date) -> bool:
        """添加点赞，返回是否成功（已存在则失败）"""
        sql = """
            INSERT IGNORE INTO pet_likes (from_user_id, to_user_id, message_code, created_at)
            VALUES (%s, %s, %s, %s)
        """
        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(sql, (from_user_id, to_user_id, message_code, today))
            return cursor.rowcount > 0

    def get_daily_given_count(self, from_user_id: int, today: date) -> int:
        sql = "SELECT COUNT(*) AS cnt FROM pet_likes WHERE from_user_id = %s AND created_at = %s"
        row = self.pool.execute_one(sql, (from_user_id, today))
        return row["cnt"] if row else 0

    def get_recent_likes(self, to_user_id: int, limit: int = 5) -> List[Dict]:
        sql = """
            SELECT l.*, u.display_name AS from_name
            FROM pet_likes l
            JOIN users u ON l.from_user_id = u.id
            WHERE l.to_user_id = %s
            ORDER BY l.created_at DESC, l.id DESC
            LIMIT %s
        """
        return self.pool.execute(sql, (to_user_id, limit))
