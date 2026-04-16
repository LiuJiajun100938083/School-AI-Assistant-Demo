#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
虚拟宠物系统 — Service 层

封装所有业务逻辑：宠物管理、金币奖励、商店购买、属性衰减、Streak、成就检测。
Service 不直接操作数据库，通过 Repository 层完成。
"""

import logging
import re
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from app.domains.pet.constants import (
    ACCESS_LEVEL,
    ACHIEVEMENTS,
    ACTIVITY_SUBJECT_MAP,
    ADMIN_UNLIMITED_COINS,
    ATTRIBUTE_MAX,
    ATTRIBUTE_MIN,
    DAILY_EARN_CAP_STUDENT,
    DAILY_EARN_CAP_TEACHER,
    DAILY_LIKE_GIVE_LIMIT,
    DECAY_RATE_PER_HOUR,
    LEAGUE_TIERS,
    MANUAL_COIN_SOURCES,
    PERSONALITY_TYPES,
    PRESET_MESSAGES,
    STUDENT_COIN_SOURCES,
    SUBJECT_XP_PER_ACTIVITY,
    TEACHER_COIN_SOURCES,
    get_growth_stage,
    get_league_tier,
    get_streak_multiplier,
)
from app.domains.pet.repository import (
    AchievementRepository,
    CoinTransactionRepository,
    LikeRepository,
    PetRepository,
    ShopItemRepository,
    StreakRepository,
)

logger = logging.getLogger(__name__)


class PetService:
    """虚拟宠物业务服务"""

    def __init__(
        self,
        pet_repo: PetRepository,
        coin_repo: CoinTransactionRepository,
        shop_repo: ShopItemRepository,
        streak_repo: StreakRepository,
        achievement_repo: AchievementRepository,
        like_repo: LikeRepository,
    ):
        self._pet = pet_repo
        self._coin = coin_repo
        self._shop = shop_repo
        self._streak = streak_repo
        self._achievement = achievement_repo
        self._like = like_repo

    # ============================================================
    # 初始化
    # ============================================================

    def init_system(self) -> None:
        """建表 + 插入默认数据"""
        try:
            self._pet.init_table()
            self._coin.init_table()
            self._shop.init_table()
            self._streak.init_table()
            self._achievement.init_table()
            self._like.init_table()
            self._achievement.seed_achievements(ACHIEVEMENTS)
            logger.info("宠物系统初始化完成")
        except Exception as e:
            logger.error("宠物系统初始化失败: %s", e)
            raise

    # ============================================================
    # 权限检查
    # ============================================================

    @staticmethod
    def check_access(user_role: str) -> bool:
        """检查用户是否有权限访问宠物系统"""
        if ACCESS_LEVEL == "all":
            return True
        return user_role == "admin"

    # ============================================================
    # 宠物名字审核（复用 image_gen 关键词黑名单 + LLM 语义审核）
    # ============================================================

    @staticmethod
    def validate_pet_name_keywords(name: str) -> str:
        """
        关键词黑名单快速检查（同步）。
        通过返回 ""，不通过返回错误原因。
        """
        from app.domains.image_gen.service import _BLOCKED_RE
        match = _BLOCKED_RE.search(name)
        if match:
            return f"名字包含不适当内容"
        return ""

    @staticmethod
    async def validate_pet_name_ai(name: str, username: str) -> str:
        """
        LLM 语义审核（异步）。
        通过返回 ""，不通过返回错误原因。
        """
        try:
            from forum_system.service.content_moderator import check_content_safety
            result = await check_content_safety(
                name,
                content_type="general",
                route="pet_name",
                username=username,
            )
            if result.status == "blocked":
                return "名字未通过安全审核"
            if result.status == "error":
                # 审核服务不可用时放行（fail-open for pet names）
                logger.warning("宠物名字审核服务不可用，放行: %s", username)
                return ""
            return ""
        except Exception as e:
            logger.warning("宠物名字 AI 审核异常，放行: %s", e)
            return ""

    # ============================================================
    # 宠物 CRUD
    # ============================================================

    def get_pet(self, user_id: int) -> Optional[Dict[str, Any]]:
        """获取宠物信息（含衰减计算 + 成长阶段 + 自动补发历史金币）"""
        pet = self._pet.get_by_user(user_id)
        if not pet:
            return None

        # 自动补发历史金币（仅一次）
        if not pet.get("backfilled"):
            try:
                self._backfill_single_user(user_id, pet["user_role"])
                self._pet.mark_backfilled(user_id)
                pet = self._pet.get_by_user(user_id)  # 重新读取更新后的余额
            except Exception:
                logger.debug("自动补发金币失败 user=%d", user_id)

        pet = self._apply_decay(pet)
        pet["stage"] = get_growth_stage(pet["growth"])
        pet["league"] = get_league_tier(self._coin.get_weekly_earned(user_id))
        return pet

    def create_pet(self, user_id: int, user_role: str, pet_name: str,
                   body_type: int, color_id: int, pattern_id: int,
                   eyes_id: int, ears_id: int, tail_id: int) -> Dict:
        """创建宠物"""
        existing = self._pet.get_by_user(user_id)
        if existing:
            raise ValueError("你已经有一只宠物了")

        pet_id = self._pet.create_pet(
            user_id, user_role, pet_name,
            body_type, color_id, pattern_id,
            eyes_id, ears_id, tail_id
        )
        # 初始化 streak
        self._streak.upsert_streak(user_id, user_role, 0, 0, None, 0)
        # 解锁"初次见面"成就
        self._try_unlock_achievement(user_id, "first_pet")

        pet = self._pet.get_by_user(user_id)
        pet["stage"] = get_growth_stage(pet["growth"])

        # 自动补发历史金币并标记
        try:
            self._backfill_single_user(user_id, user_role)
            self._pet.mark_backfilled(user_id)
            pet = self._pet.get_by_user(user_id)
            pet["stage"] = get_growth_stage(pet["growth"])
        except Exception:
            logger.debug("自动补发金币失败 user=%d", user_id)

        return pet

    def customize_pet(self, user_id: int, **fields) -> Dict:
        """重新自定义宠物外观"""
        pet = self._pet.get_by_user(user_id)
        if not pet:
            raise ValueError("尚未创建宠物")
        self._pet.update_appearance(user_id, **fields)
        return self.get_pet(user_id)

    # ============================================================
    # 属性衰减（懒计算）
    # ============================================================

    def _apply_decay(self, pet: Dict) -> Dict:
        """根据时间差计算属性衰减"""
        now = datetime.now()
        last = pet["last_decay_at"]
        if not last:
            last = now
        elapsed_hours = (now - last).total_seconds() / 3600
        if elapsed_hours < 0.1:
            return pet

        hunger = max(ATTRIBUTE_MIN, int(pet["hunger"] - elapsed_hours * DECAY_RATE_PER_HOUR["hunger"]))
        hygiene = max(ATTRIBUTE_MIN, int(pet["hygiene"] - elapsed_hours * DECAY_RATE_PER_HOUR["hygiene"]))
        mood = max(ATTRIBUTE_MIN, int(pet["mood"] - elapsed_hours * DECAY_RATE_PER_HOUR["mood"]))

        self._pet.update_attributes(pet["user_id"], hunger, hygiene, mood, now)
        pet["hunger"] = hunger
        pet["hygiene"] = hygiene
        pet["mood"] = mood
        pet["last_decay_at"] = now
        return pet

    # ============================================================
    # 金币系统
    # ============================================================

    def award_coins(self, user_id: int, user_role: str, source_type: str,
                    source_id: Optional[str] = None,
                    amount_override: Optional[int] = None,
                    reason: Optional[str] = None,
                    operated_by: Optional[int] = None) -> Dict:
        """
        统一金币奖励/扣除入口。

        - source_type 在 STUDENT/TEACHER_COIN_SOURCES 或 MANUAL_COIN_SOURCES 中注册
        - source_id 用于防重复（同一 source_type+source_id 不重复发放）
        - amount_override 手动操作时指定金额
        - admin 角色购买时不扣币
        """
        # 查找金额配置
        if source_type in MANUAL_COIN_SOURCES:
            if amount_override is None:
                raise ValueError("手动操作必须指定 amount")
            amount = amount_override
        else:
            sources = STUDENT_COIN_SOURCES if user_role == "student" else TEACHER_COIN_SOURCES
            config = sources.get(source_type)
            if not config:
                raise ValueError(f"未注册的金币来源: {source_type}")
            amount = config["amount"]

        # 防重复
        if source_id and self._coin.has_transaction(user_id, source_type, source_id):
            return {"awarded": False, "reason": "已发放过"}

        # Streak 倍率（正数收入，先算再检查上限）
        if amount > 0 and source_type not in MANUAL_COIN_SOURCES:
            streak = self._streak.get_by_user(user_id)
            if streak:
                multiplier = get_streak_multiplier(streak["current_streak"])
                amount = int(amount * multiplier)

        # 每日上限检查（倍率后）
        if amount > 0 and source_type not in MANUAL_COIN_SOURCES:
            cap = DAILY_EARN_CAP_STUDENT if user_role == "student" else DAILY_EARN_CAP_TEACHER
            daily = self._coin.get_daily_earned(user_id)
            if daily >= cap:
                return {"awarded": False, "reason": "今日已达获取上限"}

        # 更新余额
        pet = self._pet.get_by_user(user_id)
        if not pet:
            return {"awarded": False, "reason": "尚未创建宠物"}

        if amount < 0:
            # admin 无限金币：扣币不检查余额
            if user_role == "admin" and ADMIN_UNLIMITED_COINS:
                new_balance = pet["coins"]  # 不扣
            else:
                new_balance = self._pet.update_coins(user_id, amount)
                if new_balance is None:
                    return {"awarded": False, "reason": "金币不足"}
        else:
            new_balance = self._pet.update_coins(user_id, amount)

        # 记流水
        self._coin.record_transaction(
            user_id=user_id,
            user_role=user_role,
            amount=amount,
            source_type=source_type,
            source_id=source_id,
            reason=reason,
            operated_by=operated_by,
            balance_after=new_balance or 0,
        )

        # 检查金币相关成就
        self._check_coin_achievements(user_id)

        return {"awarded": True, "amount": amount, "balance": new_balance}

    def _check_coin_achievements(self, user_id: int) -> None:
        total = self._coin.get_total_earned(user_id)
        if total >= 500:
            self._try_unlock_achievement(user_id, "coins_500")

    # ============================================================
    # 商店
    # ============================================================

    def get_shop_items(self, category: Optional[str] = None) -> List[Dict]:
        return self._shop.get_enabled_items(category)

    def purchase_item(self, user_id: int, user_role: str, item_id: int) -> Dict:
        """购买并使用商品"""
        item = self._shop.get_item(item_id)
        if not item or not item.get("enabled"):
            raise ValueError("商品不存在或已下架")

        price = item["price"]
        # source_id 加时间戳，允许重复购买同一商品
        purchase_sid = f"buy_{item_id}_{datetime.now().strftime('%Y%m%d%H%M%S%f')}"

        # admin 不扣币
        if user_role == "admin" and ADMIN_UNLIMITED_COINS:
            pet = self._pet.get_by_user(user_id)
            admin_balance = pet["coins"] if pet else 0
            self._coin.record_transaction(
                user_id=user_id, user_role=user_role,
                amount=-price, source_type="purchase",
                source_id=purchase_sid, balance_after=admin_balance,
            )
        else:
            new_balance = self._pet.update_coins(user_id, -price)
            if new_balance is None:
                raise ValueError("金币不足")
            self._coin.record_transaction(
                user_id=user_id, user_role=user_role,
                amount=-price, source_type="purchase",
                source_id=purchase_sid, balance_after=new_balance,
            )

        # 应用效果
        self._pet.apply_item_effect(user_id, item["effect_type"], item["effect_value"])

        pet = self.get_pet(user_id)
        return {"item": item, "pet": pet}

    # ============================================================
    # Streak
    # ============================================================

    def record_activity(self, user_id: int, user_role: str) -> Dict:
        """记录今日有学习活动（更新 streak）"""
        today = date.today()
        streak = self._streak.get_by_user(user_id)

        if not streak:
            self._streak.upsert_streak(user_id, user_role, 1, 1, today, 0)
            return {"current_streak": 1, "is_new_day": True}

        last = streak["last_active_date"]
        if last == today:
            return {"current_streak": streak["current_streak"], "is_new_day": False}

        current = streak["current_streak"]
        freeze = streak["streak_freeze_count"]

        if last == today - timedelta(days=1):
            # 连续
            current += 1
        elif last == today - timedelta(days=2) and freeze > 0:
            # 用了保护卡
            current += 1
            freeze -= 1
        else:
            # 断了
            current = 1

        longest = max(streak["longest_streak"], current)
        self._streak.upsert_streak(user_id, user_role, current, longest, today, freeze)

        # Streak 成就
        if current >= 7:
            self._try_unlock_achievement(user_id, "streak_7")
        if current >= 30:
            self._try_unlock_achievement(user_id, "streak_30")

        return {"current_streak": current, "is_new_day": True}

    def get_streak(self, user_id: int) -> Dict:
        streak = self._streak.get_by_user(user_id)
        if not streak:
            return {"current_streak": 0, "longest_streak": 0, "multiplier": 1.0}
        return {
            **streak,
            "multiplier": get_streak_multiplier(streak["current_streak"]),
        }

    def buy_streak_freeze(self, user_id: int, user_role: str) -> Dict:
        """购买连续保护卡"""
        from app.domains.pet.constants import STREAK_FREEZE_PRICE
        result = self.award_coins(user_id, user_role, "purchase",
                                  source_id="streak_freeze",
                                  amount_override=-STREAK_FREEZE_PRICE)
        if not result.get("awarded"):
            raise ValueError(result.get("reason", "购买失败"))

        streak = self._streak.get_by_user(user_id)
        if streak:
            self._streak.upsert_streak(
                user_id, user_role,
                streak["current_streak"], streak["longest_streak"],
                streak["last_active_date"],
                streak["streak_freeze_count"] + 1,
            )
        return {"freeze_count": (streak["streak_freeze_count"] + 1) if streak else 1}

    # ============================================================
    # 学科倾向
    # ============================================================

    def add_subject_xp(self, user_id: int, activity_key: str) -> None:
        """根据活动类型增加学科 XP"""
        group = ACTIVITY_SUBJECT_MAP.get(activity_key)
        if group:
            self._pet.update_subject_xp(user_id, group, SUBJECT_XP_PER_ACTIVITY)

    # ============================================================
    # 性格计算
    # ============================================================

    def recalculate_personality(self, user_id: int, user_stats: Dict[str, int]) -> str:
        """根据行为数据重算性格"""
        scores = {
            "scholar":     user_stats.get("mistake_reviews", 0),
            "active":      user_stats.get("game_plays", 0),
            "linguist":    user_stats.get("dictation_count", 0),
            "disciplined": user_stats.get("streak_days", 0) + user_stats.get("task_completions", 0),
            "leader":      user_stats.get("commendations", 0),
        }
        # 如果所有值相近（最大值 < 最小值 * 2），则为创意型
        vals = [v for v in scores.values() if v > 0]
        if vals and max(vals) < max(min(vals) * 2, 5):
            personality = "creative"
        else:
            personality = max(scores, key=scores.get) if vals else "creative"

        self._pet.update_personality(user_id, personality)
        return personality

    # ============================================================
    # 社交（点赞）
    # ============================================================

    def like_pet(self, from_user_id: int, from_role: str,
                 to_user_id: int, message_code: int) -> Dict:
        """给别人点赞"""
        if from_user_id == to_user_id:
            raise ValueError("不能给自己点赞")

        today = date.today()
        given_count = self._like.get_daily_given_count(from_user_id, today)
        if given_count >= DAILY_LIKE_GIVE_LIMIT:
            raise ValueError("今日点赞次数已达上限")

        success = self._like.add_like(from_user_id, to_user_id, message_code, today)
        if not success:
            raise ValueError("今天已经给这位同学点过赞了")

        # 给点赞者加币
        self.award_coins(from_user_id, from_role, "social_like_given",
                         source_id=f"like_{to_user_id}_{today}")
        # 给被赞者加币
        to_pet = self._pet.get_by_user(to_user_id)
        if to_pet:
            self.award_coins(to_user_id, to_pet["user_role"], "social_like_received",
                             source_id=f"liked_by_{from_user_id}_{today}")

        return {
            "success": True,
            "message": PRESET_MESSAGES[message_code] if message_code < len(PRESET_MESSAGES) else "",
            "daily_given": given_count + 1,
        }

    def get_pet_for_visit(self, target_user_id: int, visitor_user_id: int) -> Optional[Dict]:
        """访问别人的宠物（隐藏金币）"""
        pet = self.get_pet(target_user_id)
        if not pet:
            return None
        pet.pop("coins", None)
        pet["recent_likes"] = self._like.get_recent_likes(target_user_id, limit=5)
        pet["achievements"] = self._achievement.get_user_achievements(target_user_id)
        return pet

    # ============================================================
    # 排行榜
    # ============================================================

    def get_leaderboard(self, leaderboard_type: str = "growth",
                        role: Optional[str] = None,
                        class_name: Optional[str] = None,
                        limit: int = 20) -> List[Dict]:
        order_map = {
            "growth": "p.growth DESC",
            "care": "(p.hunger + p.hygiene + p.mood) DESC",
        }
        order_by = order_map.get(leaderboard_type, "p.growth DESC")

        if leaderboard_type == "coins_earned":
            # 需要从流水表聚合
            sql = """
                SELECT p.*, u.display_name, u.class_name,
                       COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0) AS total_earned
                FROM user_pets p
                JOIN users u ON p.user_id = u.id
                LEFT JOIN pet_coin_transactions t ON t.user_id = p.user_id
            """
            conditions = []
            params = []
            if role:
                conditions.append("p.user_role = %s")
                params.append(role)
            if class_name:
                conditions.append("u.class_name = %s")
                params.append(class_name)
            if conditions:
                sql += " WHERE " + " AND ".join(conditions)
            sql += " GROUP BY p.id ORDER BY total_earned DESC LIMIT %s"
            params.append(limit)
            return self._pet.pool.execute(sql, params)

        return self._pet.get_leaderboard(order_by, role, class_name, limit)

    # ============================================================
    # 成就
    # ============================================================

    def get_achievements(self, user_id: int) -> List[Dict]:
        return self._achievement.get_user_achievements(user_id)

    def _try_unlock_achievement(self, user_id: int, code: str) -> bool:
        unlocked = self._achievement.unlock(user_id, code)
        if unlocked:
            # 发放成就奖励
            for a in ACHIEVEMENTS:
                if a["code"] == code and a["reward_coins"] > 0:
                    new_balance = self._pet.update_coins(user_id, a["reward_coins"])
                    self._coin.record_transaction(
                        user_id=user_id, user_role="",
                        amount=a["reward_coins"],
                        source_type="achievement",
                        source_id=code,
                        balance_after=new_balance or 0,
                    )
            logger.info("用户 %d 解锁成就: %s", user_id, code)
        return unlocked

    # ============================================================
    # 手动加减金币（教师/管理员）
    # ============================================================

    def manual_award_coins(self, operator_id: int, operator_role: str,
                           target_user_ids: List[int], amount: int,
                           reason: str) -> Dict:
        """给一批学生加/减金币"""
        if operator_role not in ("teacher", "admin"):
            raise ValueError("只有教师和管理员可以操作")

        source_type = f"{operator_role}_award" if amount >= 0 else f"{operator_role}_penalty"
        results = {"success": 0, "failed": 0, "details": []}

        for uid in target_user_ids:
            try:
                result = self.award_coins(
                    user_id=uid,
                    user_role="student",
                    source_type=source_type,
                    source_id=f"manual_{operator_id}_{uid}_{date.today()}_{abs(amount)}",
                    amount_override=amount,
                    reason=reason,
                    operated_by=operator_id,
                )
                if result.get("awarded"):
                    results["success"] += 1
                else:
                    results["failed"] += 1
                    results["details"].append({"user_id": uid, "reason": result.get("reason")})
            except Exception as e:
                results["failed"] += 1
                results["details"].append({"user_id": uid, "reason": str(e)})

        return results

    # ============================================================
    # 宠物状态消息（情感通知）
    # ============================================================

    def get_pet_message(self, pet: Dict) -> Optional[str]:
        """根据宠物状态返回情感消息"""
        if pet["hunger"] < 20:
            return "小伙伴，我好饿... 🥺"
        if pet["hygiene"] < 20:
            return "我需要洗个澡啦 🫧"
        if pet["mood"] < 20:
            return "今天没人陪我玩... 😢"
        if pet["hunger"] >= 80 and pet["hygiene"] >= 80 and pet["mood"] >= 80:
            return "我今天超开心！谢谢小伙伴！❤️"
        return None

    # ============================================================
    # 金币交易历史
    # ============================================================

    def get_coin_history(self, user_id: int, limit: int = 50) -> List[Dict]:
        return self._coin.get_history(user_id, limit)

    # ============================================================
    # 历史数据补发金币
    # ============================================================

    def _backfill_single_user(self, user_id: int, user_role: str) -> int:
        """
        给单个用户补发历史金币。领养宠物后自动调用。
        幂等：同一 source_id 不会重复发放。
        返回本次补发总金币数。
        """
        from app.infrastructure.database.pool import get_database_pool
        awarded = 0

        if user_role in ("teacher", "admin"):
            # 1. 上传游戏
            try:
                from app.domains.game_upload.repository import GameUploadRepository
                games = GameUploadRepository().find_all(
                    where="uploader_id = %s", params=(user_id,)
                )
                for g in games:
                    r = self.award_coins(user_id, "teacher", "upload_game",
                                         source_id=f"game_{g.get('uuid', g.get('game_uuid', g.get('id')))}")
                    if r.get("awarded"):
                        awarded += r["amount"]
            except Exception as e:
                logger.debug("补发游戏金币失败: %s", e)

            # 2. 作业
            try:
                pool = get_database_pool()
                assignments = pool.execute(
                    "SELECT id FROM assignments WHERE created_by = %s AND is_deleted = 0",
                    (user_id,)
                )
                for a in assignments:
                    self.award_coins(user_id, "teacher", "create_assignment",
                                     source_id=f"asgn_create_{a['id']}")
                published = pool.execute(
                    "SELECT id FROM assignments WHERE created_by = %s AND status = 'published' AND is_deleted = 0",
                    (user_id,)
                )
                for p in published:
                    r = self.award_coins(user_id, "teacher", "publish_assignment",
                                         source_id=f"pub_asgn_{p['id']}")
                    if r.get("awarded"):
                        awarded += r["amount"]
            except Exception as e:
                logger.debug("补发作业金币失败: %s", e)

            # 3. 默写
            try:
                pool = get_database_pool()
                dictations = pool.execute(
                    "SELECT id, status FROM dictations WHERE created_by = %s",
                    (user_id,)
                )
                for d in dictations:
                    self.award_coins(user_id, "teacher", "create_dictation",
                                     source_id=f"dict_create_{d['id']}")
                    if d.get("status") == "published":
                        r = self.award_coins(user_id, "teacher", "publish_dictation",
                                             source_id=f"pub_dict_{d['id']}")
                        if r.get("awarded"):
                            awarded += r["amount"]
            except Exception as e:
                logger.debug("补发默写金币失败: %s", e)

            # 4. 课室日志
            try:
                pool = get_database_pool()
                diaries = pool.execute(
                    "SELECT id FROM class_diary_entries WHERE submitted_by = (SELECT username FROM users WHERE id = %s)",
                    (user_id,)
                )
                for d in diaries:
                    r = self.award_coins(user_id, "teacher", "submit_class_diary",
                                         source_id=f"diary_{d['id']}")
                    if r.get("awarded"):
                        awarded += r["amount"]
            except Exception as e:
                logger.debug("补发课室日志金币失败: %s", e)

            # 5. PPT 上传
            try:
                pool = get_database_pool()
                ppts = pool.execute(
                    "SELECT file_id FROM ppt_files WHERE teacher_username = (SELECT username FROM users WHERE id = %s)",
                    (user_id,)
                )
                for p in ppts:
                    r = self.award_coins(user_id, "teacher", "upload_lesson",
                                         source_id=f"ppt_{p['file_id']}")
                    if r.get("awarded"):
                        awarded += r["amount"]
            except Exception as e:
                logger.debug("补发PPT金币失败: %s", e)

        if user_role == "student":
            try:
                pool = get_database_pool()
                # 1. 默写提交
                subs = pool.execute(
                    "SELECT id, score FROM dictation_submissions WHERE student_id = %s AND status = 'graded'",
                    (user_id,)
                )
                for s in subs:
                    r = self.award_coins(user_id, "student", "dictation_submit", f"dict_sub_{s['id']}")
                    if r.get("awarded"):
                        awarded += r["amount"]
                    if s.get("score") and float(s["score"]) >= 95:
                        r2 = self.award_coins(user_id, "student", "dictation_perfect", f"dict_perf_{s['id']}")
                        if r2.get("awarded"):
                            awarded += r2["amount"]

                # 2. 游戏新纪录
                scores = pool.execute(
                    "SELECT id, game_uuid FROM game_scores WHERE student_id = %s",
                    (user_id,)
                )
                for sc in scores:
                    r = self.award_coins(user_id, "student", "game_new_record", f"game_{sc.get('game_uuid','')}_{sc['id']}")
                    if r.get("awarded"):
                        awarded += r["amount"]

                # 3. 学习任务完成
                tasks = pool.execute(
                    "SELECT task_id, item_id FROM learning_task_completions WHERE student_id = %s AND is_completed = 1",
                    (user_id,)
                )
                for t in tasks:
                    r = self.award_coins(user_id, "student", "task_complete", f"task_{t['task_id']}_{t['item_id']}")
                    if r.get("awarded"):
                        awarded += r["amount"]
            except Exception as e:
                logger.debug("补发学生金币失败 uid=%d: %s", user_id, e)

        logger.info("单用户补发金币完成: user=%d role=%s awarded=%d", user_id, user_role, awarded)
        return awarded

    def backfill_teacher_coins(self) -> Dict:
        """
        扫描历史数据，给已有宠物的教师补发金币。
        按实际上传/操作数量 × 对应金币额度计算。
        幂等：同一 source_id 不会重复发放。
        """
        from app.domains.pet.constants import TEACHER_COIN_SOURCES
        results = {"teachers_processed": 0, "total_awarded": 0, "details": []}

        # 获取所有有宠物的教师
        teachers = self._pet.find_all(
            where="user_role IN ('teacher', 'admin')"
        )

        for teacher in teachers:
            uid = teacher["user_id"]
            awarded = 0
            detail = {"user_id": uid, "items": []}

            # 1. 上传游戏数量
            try:
                from app.domains.game_upload.repository import GameUploadRepository
                games = GameUploadRepository().find_all(
                    where="uploader_id = %s", params=(uid,)
                )
                for g in games:
                    r = self.award_coins(uid, "teacher", "upload_game",
                                         source_id=f"game_{g.get('uuid', g.get('game_uuid', g.get('id')))}")
                    if r.get("awarded"):
                        awarded += r["amount"]
                if games:
                    detail["items"].append(f"游戏×{len(games)}")
            except Exception as e:
                logger.debug("补发游戏金币失败: %s", e)

            # 2. 创建的作业数量
            try:
                from app.infrastructure.database.pool import get_database_pool
                pool = get_database_pool()
                assignments = pool.execute(
                    "SELECT id FROM assignments WHERE created_by = %s AND is_deleted = 0",
                    (uid,)
                )
                for a in assignments:
                    self.award_coins(uid, "teacher", "create_assignment",
                                     source_id=f"asgn_create_{a['id']}")
                # 已发布的
                published = pool.execute(
                    "SELECT id FROM assignments WHERE created_by = %s AND status = 'published' AND is_deleted = 0",
                    (uid,)
                )
                for p in published:
                    r = self.award_coins(uid, "teacher", "publish_assignment",
                                         source_id=f"pub_asgn_{p['id']}")
                    if r.get("awarded"):
                        awarded += r["amount"]
                if assignments:
                    detail["items"].append(f"作业×{len(assignments)}")
            except Exception as e:
                logger.debug("补发作业金币失败: %s", e)

            # 3. 创建的默写数量
            try:
                pool = get_database_pool()
                dictations = pool.execute(
                    "SELECT id, status FROM dictations WHERE created_by = %s",
                    (uid,)
                )
                for d in dictations:
                    self.award_coins(uid, "teacher", "create_dictation",
                                     source_id=f"dict_create_{d['id']}")
                    if d.get("status") == "published":
                        r = self.award_coins(uid, "teacher", "publish_dictation",
                                             source_id=f"pub_dict_{d['id']}")
                        if r.get("awarded"):
                            awarded += r["amount"]
                if dictations:
                    detail["items"].append(f"默写×{len(dictations)}")
            except Exception as e:
                logger.debug("补发默写金币失败: %s", e)

            # 4. 课室日志数量
            try:
                pool = get_database_pool()
                diaries = pool.execute(
                    "SELECT id FROM class_diary_entries WHERE submitted_by = (SELECT username FROM users WHERE id = %s)",
                    (uid,)
                )
                for d in diaries:
                    r = self.award_coins(uid, "teacher", "submit_class_diary",
                                         source_id=f"diary_{d['id']}")
                    if r.get("awarded"):
                        awarded += r["amount"]
                if diaries:
                    detail["items"].append(f"课室日志×{len(diaries)}")
            except Exception as e:
                logger.debug("补发课室日志金币失败: %s", e)

            # 5. PPT 上传数量
            try:
                pool = get_database_pool()
                ppts = pool.execute(
                    "SELECT file_id FROM ppt_files WHERE teacher_username = (SELECT username FROM users WHERE id = %s)",
                    (uid,)
                )
                for p in ppts:
                    r = self.award_coins(uid, "teacher", "upload_lesson",
                                         source_id=f"ppt_{p['file_id']}")
                    if r.get("awarded"):
                        awarded += r["amount"]
                if ppts:
                    detail["items"].append(f"PPT×{len(ppts)}")
            except Exception as e:
                logger.debug("补发PPT金币失败: %s", e)

            if awarded > 0:
                results["teachers_processed"] += 1
                results["total_awarded"] += awarded
                detail["awarded"] = awarded
                results["details"].append(detail)

        # ── 学生历史数据补发 ──
        students = self._pet.find_all(where="user_role = 'student'")

        for stu in students:
            uid = stu["user_id"]
            awarded = 0
            detail = {"user_id": uid, "items": [], "role": "student"}

            try:
                pool = get_database_pool()

                # 1. 默写提交（已批改的）
                subs = pool.execute(
                    "SELECT id, score FROM dictation_submissions WHERE student_id = %s AND status = 'graded'",
                    (uid,)
                )
                for s in subs:
                    r = self.award_coins(uid, "student", "dictation_submit", f"dict_sub_{s['id']}")
                    if r.get("awarded"):
                        awarded += r["amount"]
                    if s.get("score") and float(s["score"]) >= 95:
                        r2 = self.award_coins(uid, "student", "dictation_perfect", f"dict_perf_{s['id']}")
                        if r2.get("awarded"):
                            awarded += r2["amount"]
                if subs:
                    detail["items"].append(f"默写×{len(subs)}")

                # 2. 游戏新纪录
                scores = pool.execute(
                    "SELECT id, game_uuid FROM game_scores WHERE student_id = %s",
                    (uid,)
                )
                for sc in scores:
                    r = self.award_coins(uid, "student", "game_new_record", f"game_{sc.get('game_uuid','')}_{sc['id']}")
                    if r.get("awarded"):
                        awarded += r["amount"]
                if scores:
                    detail["items"].append(f"游戏分数×{len(scores)}")

                # 3. 学习任务完成
                tasks = pool.execute(
                    "SELECT task_id, item_id FROM learning_task_completions WHERE student_id = %s AND is_completed = 1",
                    (uid,)
                )
                for t in tasks:
                    r = self.award_coins(uid, "student", "task_complete", f"task_{t['task_id']}_{t['item_id']}")
                    if r.get("awarded"):
                        awarded += r["amount"]
                if tasks:
                    detail["items"].append(f"任务×{len(tasks)}")

            except Exception as e:
                logger.debug("补发学生金币失败 uid=%d: %s", uid, e)

            if awarded > 0:
                results["teachers_processed"] += 1
                results["total_awarded"] += awarded
                detail["awarded"] = awarded
                results["details"].append(detail)

        logger.info("历史金币补发完成: 共 %d 人, %d 金币",
                     results["teachers_processed"], results["total_awarded"])
        return results

    # ============================================================
    # 教师面板
    # ============================================================

    def get_teacher_classes_summary(self, class_names: List[str]) -> List[Dict]:
        """获取多个班级的宠物汇总统计"""
        return self._pet.get_classes_summary(class_names)

    def get_class_pets(self, class_name: str) -> List[Dict]:
        """获取某班所有学生的宠物详细（含衰减计算 + 成长阶段）"""
        rows = self._pet.get_class_pets(class_name)
        result = []
        for row in rows:
            if row.get("pet_name") is None:
                # 没有宠物
                result.append({
                    "user_id": row["user_id"],
                    "display_name": row["display_name"],
                    "has_pet": False,
                })
            else:
                # 有宠物：加成长阶段
                row["has_pet"] = True
                row["stage"] = get_growth_stage(row.get("growth", 0))
                row["streak"] = row.get("current_streak", 0)
                result.append(row)
        return result

    # ============================================================
    # 宠物聊天（SSE 流式）
    # ============================================================

    def _get_dominant_subject(self, pet: Dict) -> str:
        """获取宠物最擅长的学科组"""
        xps = {
            "science":    pet.get("science_xp", 0),
            "humanities": pet.get("humanities_xp", 0),
            "business":   pet.get("business_xp", 0),
            "tech":       pet.get("tech_xp", 0),
        }
        if max(xps.values()) == 0:
            return "science"
        return max(xps, key=xps.get)

    async def chat_stream(self, user_id: int, message: str,
                          history: list) -> Any:
        """
        宠物聊天流式响应。
        Demo 雲端版：走 Qwen 雲端 API（OpenAI-compatible /chat/completions 流式），yield SSE 事件。
        """
        import json
        import time
        import httpx
        from app.domains.pet.constants import (
            PET_CHAT_MODEL,
            PET_CHAT_MAX_TOKENS,
            PET_CHAT_TEMPERATURE,
            PET_CHAT_TIMEOUT,
            PET_CHAT_HISTORY_LIMIT,
            build_pet_chat_prompt,
            get_growth_stage,
        )

        pet = self._pet.get_by_user(user_id)
        if not pet:
            yield 'event: error\ndata: {"message": "尚未创建宠物"}\n\n'
            return

        # Demo 雲端：從 LLM 配置讀取 Qwen API key/base_url/model
        from llm.config import get_llm_config
        cfg = get_llm_config()
        if not cfg.use_api or not cfg.api_key:
            yield 'event: error\ndata: {"message": "云端 API 未配置，无法聊天"}\n\n'
            return

        model = cfg.api_model or PET_CHAT_MODEL
        base_url = cfg.api_base_url
        api_key = cfg.api_key
        url = f"{base_url}/chat/completions"

        # 构建 system prompt
        stage = get_growth_stage(pet["growth"])
        dominant = self._get_dominant_subject(pet)
        system_prompt = build_pet_chat_prompt(
            pet["pet_name"], pet["personality"], dominant, stage
        )

        # 构建消息列表（system + history + 当前消息）
        messages = [{"role": "system", "content": system_prompt}]
        # 只保留最近 N 轮
        recent = history[-PET_CHAT_HISTORY_LIMIT * 2:] if history else []
        for h in recent:
            messages.append({
                "role": h.get("role", "user"),
                "content": h.get("content", ""),
            })
        messages.append({"role": "user", "content": message})

        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "stream_options": {"include_usage": True},
            "temperature": PET_CHAT_TEMPERATURE,
            "max_tokens": PET_CHAT_MAX_TOKENS,
        }
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        try:
            t_start = time.monotonic()
            async with httpx.AsyncClient(timeout=PET_CHAT_TIMEOUT) as client:
                async with client.stream(
                    "POST", url, json=payload, headers=headers, timeout=PET_CHAT_TIMEOUT
                ) as resp:
                    if resp.status_code != 200:
                        yield f'event: error\ndata: {{"message": "模型服务不可用 ({resp.status_code})"}}\n\n'
                        return

                    full_answer = ""
                    prompt_tokens = 0
                    completion_tokens = 0
                    duration_ms = 0
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        # OpenAI SSE 格式: "data: {json}" 或 "data: [DONE]"
                        if line.startswith("data:"):
                            data_str = line[5:].strip()
                            if data_str == "[DONE]":
                                break
                            try:
                                chunk = json.loads(data_str)
                                choices = chunk.get("choices") or []
                                if choices:
                                    delta = choices[0].get("delta", {}) or {}
                                    content = delta.get("content") or ""
                                    if content:
                                        full_answer += content
                                        yield f'event: token\ndata: {json.dumps({"content": content}, ensure_ascii=False)}\n\n'
                                # usage 通常在最後一個 chunk 中
                                usage = chunk.get("usage") or {}
                                if usage:
                                    prompt_tokens = usage.get("prompt_tokens", prompt_tokens)
                                    completion_tokens = usage.get("completion_tokens", completion_tokens)
                            except json.JSONDecodeError:
                                continue

                    duration_ms = int((time.monotonic() - t_start) * 1000)
                    yield f'event: done\ndata: {json.dumps({"full_answer": full_answer}, ensure_ascii=False)}\n\n'

                    # 记录雲端模型使用量
                    try:
                        from app.services.container import get_services
                        await get_services().llm_usage.record_async(
                            user_id=user_id,
                            provider="qwen",
                            model=model,
                            purpose="pet_chat",
                            usage_dict={
                                "prompt_tokens": prompt_tokens,
                                "completion_tokens": completion_tokens,
                                "total_tokens": prompt_tokens + completion_tokens,
                            },
                            duration_ms=duration_ms,
                            status="ok",
                        )
                    except Exception as rec_err:
                        logger.warning("记录宠物聊天使用量失败: %s", rec_err)

                    # 每次成功聊天给金币 + 更新 streak
                    try:
                        pet_row = self._pet.get_by_user(user_id)
                        if pet_row:
                            self.award_coins(
                                user_id=user_id,
                                user_role=pet_row["user_role"],
                                source_type="pet_chat_reward",
                                source_id=None,  # 不防重复，每次聊天都给
                            )
                            self.record_activity(user_id, pet_row["user_role"])
                    except Exception as reward_err:
                        logger.warning("宠物聊天奖励失败: %s", reward_err)

        except httpx.TimeoutException:
            yield 'event: error\ndata: {"message": "回复超时了，请稍后再试"}\n\n'
        except Exception as e:
            logger.error("宠物聊天失败: %s", e)
            yield f'event: error\ndata: {{"message": "聊天出错了"}}\n\n'
