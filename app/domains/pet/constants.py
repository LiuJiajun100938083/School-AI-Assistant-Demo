#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
虚拟宠物系统 — 常量 & 配置

所有数值集中管理，方便调参。不在业务逻辑中写死任何数值。
"""

# ============================================================
# 宠物外观部件范围
# ============================================================

BODY_TYPE_COUNT = 8       # blob/bun/cube/mecha/ghost/crystal/cloud/ufo
COLOR_COUNT = 15          # 15 色调色板
PATTERN_COUNT = 1         # 花纹暂不用（染色系统替代）
EYES_COUNT = 9            # kawaii/cool/fierce/star/visor/cyclops/sleepy/happy/x_eyes
EARS_COUNT = 9            # floppy/cat/antenna/horns/headphones/halo/crown/flower/none
TAIL_COUNT = 8            # stubby/dino/lightning/rocket/wings/tentacles/plug/none

# ============================================================
# 成长阶段
# ============================================================

GROWTH_STAGES = {
    "egg":   {"min": 0,   "max": 99,  "label": "蛋"},
    "young": {"min": 100, "max": 499, "label": "幼年"},
    "adult": {"min": 500, "max": None, "label": "成年"},
}

def get_growth_stage(growth: int) -> str:
    """根据 growth 值返回成长阶段 key"""
    if growth < 100:
        return "egg"
    if growth < 500:
        return "young"
    return "adult"

# ============================================================
# 属性衰减
# ============================================================

DECAY_RATE_PER_HOUR = {
    "hunger":  2.0,   # 饱食度每小时 -2
    "hygiene": 1.5,   # 清洁度每小时 -1.5
    "mood":    1.0,   # 心情每小时 -1
}

ATTRIBUTE_MIN = 0
ATTRIBUTE_MAX = 100
ATTRIBUTE_DEFAULT = 100

# ============================================================
# 金币系统 — 学生来源
# ============================================================

STUDENT_COIN_SOURCES = {
    "dictation_submit":      {"amount": 5,  "label": "默写提交"},
    "dictation_perfect":     {"amount": 10, "label": "默写满分"},
    "mistake_review":        {"amount": 3,  "label": "错题复习"},
    "mistake_mastered":      {"amount": 15, "label": "知识点掌握"},
    "class_diary_commend":   {"amount": 8,  "label": "课室表扬"},
    "class_diary_violation":  {"amount": -10, "label": "课室违规"},
    "game_new_record":       {"amount": 5,  "label": "游戏新纪录"},
    "task_complete":         {"amount": 5,  "label": "任务完成"},
    "social_like_given":     {"amount": 1,  "label": "给别人点赞"},
    "social_like_received":  {"amount": 2,  "label": "收到点赞"},
    "pet_chat_reward":       {"amount": 2,  "label": "宠物聊天"},
}

# ============================================================
# 金币系统 — 教师来源
# ============================================================

TEACHER_COIN_SOURCES = {
    "upload_lesson":         {"amount": 10, "label": "上传教案"},
    "publish_assignment":    {"amount": 8,  "label": "发布作业"},
    "grade_submission":      {"amount": 2,  "label": "批改作业"},
    "grade_with_feedback":   {"amount": 5,  "label": "批改+反馈"},
    "publish_dictation":     {"amount": 8,  "label": "发布默写"},
    "submit_class_diary":    {"amount": 5,  "label": "课室日志"},
    "generate_exam":         {"amount": 10, "label": "生成考卷"},
    "complete_lesson":       {"amount": 10, "label": "完成课堂"},
    "review_at_risk":        {"amount": 3,  "label": "关注风险学生"},
    "generate_report":       {"amount": 8,  "label": "生成学生报告"},
    "publish_task":          {"amount": 5,  "label": "发布学习任务"},
    "upload_game":           {"amount": 15, "label": "上传游戏"},
    "social_like_given":     {"amount": 1,  "label": "给别人点赞"},
    "social_like_received":  {"amount": 2,  "label": "收到点赞"},
    "pet_chat_reward":       {"amount": 2,  "label": "宠物聊天"},
}

# 手动加减币（教师/管理员操作，amount 由操作者指定）
MANUAL_COIN_SOURCES = {
    "teacher_award":   {"label": "教师奖励"},
    "teacher_penalty": {"label": "教师扣分"},
    "admin_award":     {"label": "管理员奖励"},
    "admin_penalty":   {"label": "管理员扣分"},
}

DAILY_EARN_CAP_STUDENT = 100
DAILY_EARN_CAP_TEACHER = 150

# ============================================================
# Streak 连续学习
# ============================================================

STREAK_MULTIPLIERS = {
    7:  1.5,
    14: 2.0,
    30: 3.0,
}
STREAK_FREEZE_PRICE = 50  # 金币

def get_streak_multiplier(streak_days: int) -> float:
    """返回当前 streak 对应的金币倍率"""
    multiplier = 1.0
    for threshold, mult in sorted(STREAK_MULTIPLIERS.items()):
        if streak_days >= threshold:
            multiplier = mult
    return multiplier

# ============================================================
# 段位系统
# ============================================================

LEAGUE_TIERS = [
    {"name": "bronze",  "label": "青铜", "icon": "bronze",  "min_weekly": 0},
    {"name": "silver",  "label": "白银", "icon": "silver",  "min_weekly": 50},
    {"name": "gold",    "label": "黄金", "icon": "gold",    "min_weekly": 100},
    {"name": "diamond", "label": "钻石", "icon": "diamond", "min_weekly": 200},
    {"name": "master",  "label": "大师", "icon": "master",  "min_weekly": 350},
]

def get_league_tier(weekly_coins: int) -> dict:
    """根据本周金币获取量返回段位"""
    tier = LEAGUE_TIERS[0]
    for t in LEAGUE_TIERS:
        if weekly_coins >= t["min_weekly"]:
            tier = t
    return tier

# ============================================================
# 学科倾向
# ============================================================

SUBJECT_GROUPS = {
    "science":    {"label": "理科", "subjects": ["math", "physics", "chemistry", "biology"]},
    "humanities": {"label": "文科", "subjects": ["chinese", "english", "history", "liberal_studies"]},
    "business":   {"label": "商科", "subjects": ["economics", "business", "accounting"]},
    "tech":       {"label": "科技", "subjects": ["ict", "coding"]},
}

# 活动/学科 → 学科组映射
ACTIVITY_SUBJECT_MAP = {
    "dictation_chinese": "humanities",
    "dictation_english": "humanities",
    "dictation_math": "science",
    "chem2048": "science",
    "trade_game": "business",
    "farm_game": "business",
    "ai_chat_math": "science",
    "ai_chat_physics": "science",
    "ai_chat_chemistry": "science",
    "ai_chat_biology": "science",
    "ai_chat_chinese": "humanities",
    "ai_chat_english": "humanities",
    "ai_chat_history": "humanities",
    "ai_chat_liberal_studies": "humanities",
    "ai_chat_economics": "business",
    "ai_chat_business": "business",
    "ai_chat_accounting": "business",
    "ai_chat_ict": "tech",
    "ai_chat_coding": "tech",
}

SUBJECT_XP_PER_ACTIVITY = 5  # 每次活动增加的学科 XP

# ============================================================
# 性格系统
# ============================================================

PERSONALITY_TYPES = {
    "scholar":     {"label": "学者型",  "icon": "scholar"},
    "active":      {"label": "活跃型",  "icon": "active"},
    "linguist":    {"label": "语言型",  "icon": "linguist"},
    "disciplined": {"label": "自律型",  "icon": "disciplined"},
    "leader":      {"label": "榜样型",  "icon": "leader"},
    "creative":    {"label": "创意型",  "icon": "creative"},
}

TEACHER_PERSONALITY_TYPES = {
    "rigorous": {"label": "严谨型", "icon": "rigorous"},
    "creative": {"label": "创作型", "icon": "creative"},
    "caring":   {"label": "关怀型", "icon": "caring"},
    "allround": {"label": "全能型", "icon": "allround"},
}

# ============================================================
# 社交系统
# ============================================================

DAILY_LIKE_GIVE_LIMIT = 10        # 每日最多给 10 人点赞
DAILY_LIKE_RECEIVE_CAP_COINS = 20  # 收赞每日最多获 20 币

PRESET_MESSAGES = [
    "真可爱！",
    "继续加油！",
    "好厉害！",
    "你的宠物好酷！",
    "学习达人！",
    "太棒了！",
    "一起努力！",
    "加油加油！",
]

# ============================================================
# 商店物品分类
# ============================================================

SHOP_CATEGORIES = ["food", "hygiene", "toy", "decoration"]

# 默认商品（init_table 时插入，如果表为空）
DEFAULT_SHOP_ITEMS = [
    # 食物
    {"name": "面包",     "category": "food",    "price": 5,  "effect_type": "hunger",  "effect_value": 20, "icon": "bread",    "sort_order": 1},
    {"name": "牛排",     "category": "food",    "price": 15, "effect_type": "hunger",  "effect_value": 50, "icon": "steak",    "sort_order": 2},
    {"name": "大餐",     "category": "food",    "price": 30, "effect_type": "hunger",  "effect_value": 100, "icon": "feast",   "sort_order": 3},
    # 清洁
    {"name": "肥皂",     "category": "hygiene", "price": 5,  "effect_type": "hygiene", "effect_value": 20, "icon": "soap",     "sort_order": 10},
    {"name": "沐浴露",   "category": "hygiene", "price": 15, "effect_type": "hygiene", "effect_value": 50, "icon": "shampoo",  "sort_order": 11},
    {"name": "豪华浴缸", "category": "hygiene", "price": 30, "effect_type": "hygiene", "effect_value": 100, "icon": "bathtub", "sort_order": 12},
    # 玩具
    {"name": "小球",     "category": "toy",     "price": 5,  "effect_type": "mood",    "effect_value": 20, "icon": "ball",     "sort_order": 20},
    {"name": "毛绒玩具", "category": "toy",     "price": 15, "effect_type": "mood",    "effect_value": 50, "icon": "plush",    "sort_order": 21},
    {"name": "游乐场",   "category": "toy",     "price": 30, "effect_type": "mood",    "effect_value": 100, "icon": "playground", "sort_order": 22},
]

# ============================================================
# 成就系统
# ============================================================

ACHIEVEMENTS = [
    {"code": "first_pet",       "name": "初次见面",   "description": "创建你的第一只宠物",        "reward_coins": 0,   "icon": "first_pet"},
    {"code": "streak_7",        "name": "7日之约",    "description": "连续学习 7 天",             "reward_coins": 20,  "icon": "streak_7"},
    {"code": "streak_30",       "name": "月度坚持",   "description": "连续学习 30 天",            "reward_coins": 100, "icon": "streak_30"},
    {"code": "coins_500",       "name": "金币猎人",   "description": "累计赚取 500 金币",         "reward_coins": 30,  "icon": "coins_500"},
    {"code": "perfect_3",       "name": "满分学霸",   "description": "默写获得 3 次满分",         "reward_coins": 50,  "icon": "perfect_3"},
    {"code": "knowledge_10",    "name": "知识大师",   "description": "掌握 10 个知识点",          "reward_coins": 50,  "icon": "knowledge_10"},
    {"code": "social_butterfly", "name": "社交达人",  "description": "累计点赞 50 次",            "reward_coins": 20,  "icon": "social"},
    {"code": "growth_young",    "name": "破壳而出",   "description": "宠物从蛋成长为幼年",        "reward_coins": 30,  "icon": "hatch"},
    {"code": "growth_adult",    "name": "茁壮成长",   "description": "宠物成长为成年",            "reward_coins": 50,  "icon": "grow"},
]

# 管理员内测：admin 角色金币无限
ADMIN_UNLIMITED_COINS = True
# 功能开放范围：'admin' = 仅管理员，'all' = 全部用户
ACCESS_LEVEL = "admin"

# ============================================================
# 宠物聊天
# ============================================================

PET_CHAT_MODEL = "qwen3.5:4b"       # 轻量本地模型
PET_CHAT_MAX_TOKENS = 200            # 宠物回复简短
PET_CHAT_TEMPERATURE = 0.8           # 稍活泼
PET_CHAT_TIMEOUT = 30                # 30 秒超时（不像主力聊天那样等 120 秒）
PET_CHAT_HISTORY_LIMIT = 10          # 保留最近 10 轮对话

# 性格 → 语气描述（用于 system prompt）
PET_PERSONALITY_TONES = {
    "scholar":     "沉稳、好学、喜欢引用知识和名言",
    "active":      "活泼好动、充满活力、喜欢用感叹号",
    "linguist":    "文雅、喜欢用成语和修辞、偶尔夹杂英文",
    "disciplined": "认真严谨、喜欢鼓励坚持和计划",
    "leader":      "自信大方、喜欢激励他人、有号召力",
    "creative":    "天马行空、想象力丰富、喜欢用比喻和类比",
}

# 学科组 → 擅长话题描述
PET_SUBJECT_TOPICS = {
    "science":    "数学、物理、化学、生物等理科话题",
    "humanities": "语文、英语、历史等文科话题",
    "business":   "经济、商业、理财等商科话题",
    "tech":       "编程、科技、计算机等技术话题",
}

def build_pet_chat_prompt(pet_name: str, personality: str,
                          dominant_subject: str, stage: str) -> str:
    """根据宠物属性构建 system prompt"""
    tone = PET_PERSONALITY_TONES.get(personality, PET_PERSONALITY_TONES["creative"])
    topic = PET_SUBJECT_TOPICS.get(dominant_subject, "各种学习话题")
    stage_desc = {"egg": "刚出生的蛋", "young": "幼年期", "adult": "成年期"}.get(stage, "成长中")

    return (
        f"你是一只叫「{pet_name}」的虚拟宠物精灵，目前处于{stage_desc}。\n"
        f"你的性格特点是：{tone}。\n"
        f"你擅长聊{topic}，但也可以聊日常话题。\n"
        f"你的主人是一名中学生，请用简短、可爱的语气回复。\n"
        f"每次回复控制在 2-3 句话以内（不超过 80 字）。\n"
        f"你可以鼓励主人学习，回答学习问题，或者撒娇卖萌。\n"
        f"绝对不要回答涉及暴力、色情、政治等不当内容的问题，"
        f"遇到这类问题请可爱地拒绝。\n"
        f"请用繁体中文或简体中文回复（跟随主人的语言）。"
    )
