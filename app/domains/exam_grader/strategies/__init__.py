from app.domains.exam_grader.strategies.base import SubjectGradingStrategy
from app.domains.exam_grader.strategies.ict import ICTGradingStrategy

STRATEGY_MAP = {
    "ict": ICTGradingStrategy,
}


def get_strategy(subject: str) -> SubjectGradingStrategy:
    """按科目获取评分策略，找不到则 KeyError"""
    cls = STRATEGY_MAP.get(subject)
    if cls is None:
        raise KeyError(f"不支持的科目: {subject}，当前支持: {list(STRATEGY_MAP.keys())}")
    return cls()
