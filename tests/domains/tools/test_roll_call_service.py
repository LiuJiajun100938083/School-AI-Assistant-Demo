"""roll_call_service 單元測試 — 純函式 List[dict] → List[dict] 測試"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

import pytest

from app.domains.tools.exceptions import ToolInputError
from app.domains.tools.roll_call_service import (
    group_by_count,
    group_by_size,
    pick_random_students,
)


def _make(n: int):
    return [{"id": i, "display_name": f"S{i}"} for i in range(1, n + 1)]


# ============================================================
# pick_random_students
# ============================================================

class TestPickRandomStudents:
    def test_pick_one(self):
        pool = _make(10)
        out = pick_random_students(pool, n=1)
        assert len(out) == 1
        assert out[0] in pool

    def test_pick_five_from_ten_no_repeat(self):
        pool = _make(10)
        out = pick_random_students(pool, n=5)
        assert len(out) == 5
        # 無放回 → 全部都要不同
        ids = [s["id"] for s in out]
        assert len(set(ids)) == 5

    def test_pick_more_than_pool_caps_at_pool_size(self):
        pool = _make(3)
        out = pick_random_students(pool, n=10)
        # 不 raise,抽滿池
        assert len(out) == 3
        assert {s["id"] for s in out} == {1, 2, 3}

    def test_exclude_ids_respected(self):
        pool = _make(5)
        out = pick_random_students(pool, n=3, exclude_ids=[1, 2])
        ids = {s["id"] for s in out}
        assert 1 not in ids and 2 not in ids
        assert ids.issubset({3, 4, 5})

    def test_exclude_emptied_pool_raises(self):
        pool = _make(3)
        with pytest.raises(ToolInputError) as exc:
            pick_random_students(pool, n=1, exclude_ids=[1, 2, 3])
        assert "空" in exc.value.message

    def test_allow_repeat_ignores_exclude(self):
        pool = _make(5)
        out = pick_random_students(
            pool, n=20, exclude_ids=[1, 2, 3, 4, 5], allow_repeat=True
        )
        # allow_repeat 讓排除失效,可以抽出 20 個(有重複)
        assert len(out) == 20

    def test_allow_repeat_can_produce_duplicates(self):
        pool = _make(2)
        out = pick_random_students(pool, n=100, allow_repeat=True)
        assert len(out) == 100
        assert len({s["id"] for s in out}) <= 2

    def test_n_zero_raises(self):
        with pytest.raises(ToolInputError):
            pick_random_students(_make(5), n=0)

    def test_n_too_large_raises(self):
        with pytest.raises(ToolInputError):
            pick_random_students(_make(5), n=999)

    def test_empty_pool_raises(self):
        with pytest.raises(ToolInputError):
            pick_random_students([], n=1)


# ============================================================
# group_by_size
# ============================================================

class TestGroupBySize:
    def test_ten_by_four(self):
        pool = _make(10)
        groups = group_by_size(pool, size=4)
        # 10 / 4 = 2 組滿 + 1 組 2 人 = 3 組
        assert len(groups) == 3
        assert len(groups[0]) == 4
        assert len(groups[1]) == 4
        assert len(groups[2]) == 2
        all_ids = sorted(s["id"] for g in groups for s in g)
        assert all_ids == list(range(1, 11))

    def test_exact_division(self):
        groups = group_by_size(_make(12), size=3)
        assert len(groups) == 4
        for g in groups:
            assert len(g) == 3

    def test_size_larger_than_pool(self):
        pool = _make(3)
        groups = group_by_size(pool, size=10)
        assert len(groups) == 1
        assert len(groups[0]) == 3

    def test_empty_pool(self):
        assert group_by_size([], size=3) == []

    def test_size_zero_raises(self):
        with pytest.raises(ToolInputError):
            group_by_size(_make(5), size=0)

    def test_shuffled_not_identical(self):
        # 多次跑同一池,至少其中一次的第一個不是原 id=1(概率)
        pool = _make(50)
        firsts = set()
        for _ in range(20):
            groups = group_by_size(pool, size=10)
            firsts.add(groups[0][0]["id"])
        assert len(firsts) > 1  # 有被洗牌


# ============================================================
# group_by_count
# ============================================================

class TestGroupByCount:
    def test_ten_into_three(self):
        pool = _make(10)
        groups = group_by_count(pool, count=3)
        # 10 / 3 → [4, 3, 3]
        assert len(groups) == 3
        sizes = sorted([len(g) for g in groups], reverse=True)
        assert sizes == [4, 3, 3]
        all_ids = sorted(s["id"] for g in groups for s in g)
        assert all_ids == list(range(1, 11))

    def test_exact(self):
        groups = group_by_count(_make(12), count=4)
        assert len(groups) == 4
        for g in groups:
            assert len(g) == 3

    def test_count_larger_than_pool_drops_empty_groups(self):
        # 5 人分 10 組 → 只 5 組,每組 1 人
        pool = _make(5)
        groups = group_by_count(pool, count=10)
        assert len(groups) == 5
        for g in groups:
            assert len(g) == 1

    def test_empty_pool(self):
        assert group_by_count([], count=3) == []

    def test_count_zero_raises(self):
        with pytest.raises(ToolInputError):
            group_by_count(_make(5), count=0)

    def test_count_too_large_raises(self):
        with pytest.raises(ToolInputError):
            group_by_count(_make(5), count=999)

    def test_no_student_lost(self):
        # 關鍵性質:分組後所有學生必須出現且不重複
        pool = _make(37)
        groups = group_by_count(pool, count=5)
        all_ids = [s["id"] for g in groups for s in g]
        assert len(all_ids) == 37
        assert set(all_ids) == set(range(1, 38))
