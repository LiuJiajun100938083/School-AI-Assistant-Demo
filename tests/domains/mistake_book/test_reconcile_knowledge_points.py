"""
KnowledgePointRepository.reconcile_subject 單元測試
====================================================
純邏輯測試 — 用 in-memory fake 替換 DB 操作 (find_all / upsert / deactivate),
驗證 reconciliation 的三路徑: insert / update / deactivate。

不需要 MySQL,不需要 pool。
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

import pytest


# ============================================================
# 純邏輯 helper — 模擬 reconcile_subject 的核心 diff 演算法
# (測試不需要整個 KnowledgePointRepository 的繼承鏈)
# ============================================================

class _FakeKnowledgeRepo:
    """In-memory fake,行為模擬 KnowledgePointRepository.reconcile_subject。"""

    def __init__(self, initial_rows=None):
        # {point_code: {**fields, is_active: bool}}
        self.rows = {}
        for r in (initial_rows or []):
            self.rows[r["point_code"]] = dict(r)

    def find_all_point_codes_for_subject(self, subject, *, only_active=False):
        codes = []
        for r in self.rows.values():
            if r.get("subject") != subject:
                continue
            if only_active and not r.get("is_active", True):
                continue
            codes.append(r["point_code"])
        return codes

    def deactivate_by_codes(self, codes):
        n = 0
        for c in codes:
            if c in self.rows:
                self.rows[c]["is_active"] = False
                n += 1
        return n

    def upsert(self, data, update_fields=None):
        code = data["point_code"]
        if code in self.rows:
            # UPDATE
            self.rows[code].update(data)
        else:
            # INSERT
            self.rows[code] = dict(data)
        return 1

    def reconcile_subject(self, subject, desired_points):
        """模仿 KnowledgePointRepository.reconcile_subject 的邏輯"""
        existing_all = set(
            self.find_all_point_codes_for_subject(subject, only_active=False)
        )
        desired_codes = {p["point_code"] for p in desired_points}

        to_deactivate = sorted(existing_all - desired_codes)
        deactivated = self.deactivate_by_codes(to_deactivate)

        upserted = 0
        for p in desired_points:
            p_active = dict(p)
            p_active["is_active"] = True
            self.upsert(p_active, update_fields=[
                "point_name", "description", "grade_levels",
                "parent_code", "difficulty_level", "display_order",
                "category", "is_active",
            ])
            upserted += 1

        return {
            "inserted": upserted,
            "deactivated": deactivated,
            "kept": len(existing_all & desired_codes),
        }


# ============================================================
# Fixtures
# ============================================================

def _kp(code, subject="physics", name=None, parent=None):
    return {
        "subject": subject,
        "point_code": code,
        "point_name": name or code,
        "category": "test",
        "description": "[compulsory:core] desc",
        "parent_code": parent,
        "difficulty_level": 2,
        "display_order": 1,
        "is_active": True,
    }


# ============================================================
# Tests
# ============================================================

class TestReconcileSubjectInsert:
    """空 DB → 全新 subject → 全部 INSERT"""

    def test_empty_db_insert_all(self):
        repo = _FakeKnowledgeRepo()
        desired = [_kp("phys_a"), _kp("phys_b"), _kp("phys_c")]
        result = repo.reconcile_subject("physics", desired)
        assert result["inserted"] == 3
        assert result["deactivated"] == 0
        assert result["kept"] == 0
        # 全部 is_active=TRUE
        for code in ("phys_a", "phys_b", "phys_c"):
            assert repo.rows[code]["is_active"] is True

    def test_insert_preserves_other_subjects(self):
        repo = _FakeKnowledgeRepo([
            _kp("math_x", subject="math"),
            _kp("math_y", subject="math"),
        ])
        desired = [_kp("phys_a"), _kp("phys_b")]
        result = repo.reconcile_subject("physics", desired)
        assert result["inserted"] == 2
        assert result["deactivated"] == 0
        # math 一點都沒動
        assert repo.rows["math_x"]["is_active"] is True
        assert repo.rows["math_y"]["is_active"] is True


class TestReconcileSubjectUpdate:
    """已存在 → UPDATE 欄位"""

    def test_update_name_and_description(self):
        repo = _FakeKnowledgeRepo([
            {
                "subject": "physics", "point_code": "phys_a",
                "point_name": "舊名字", "description": "[compulsory:core] 舊描述",
                "category": "old", "is_active": True,
            },
        ])
        desired = [
            {
                "subject": "physics", "point_code": "phys_a",
                "point_name": "新名字", "description": "[compulsory:extension] 新描述",
                "category": "new", "parent_code": None,
                "difficulty_level": 3, "display_order": 2,
            },
        ]
        result = repo.reconcile_subject("physics", desired)
        assert result["inserted"] == 1  # upserted 算 1 次
        assert result["deactivated"] == 0
        assert result["kept"] == 1
        row = repo.rows["phys_a"]
        assert row["point_name"] == "新名字"
        assert row["description"] == "[compulsory:extension] 新描述"
        assert row["category"] == "new"
        assert row["is_active"] is True


class TestReconcileSubjectDeactivate:
    """DB 有但 desired 沒有 → is_active=FALSE"""

    def test_deactivate_missing(self):
        repo = _FakeKnowledgeRepo([
            _kp("phys_a"),
            _kp("phys_b"),
            _kp("phys_old_skill"),  # 將被 deactivate
        ])
        desired = [_kp("phys_a"), _kp("phys_b")]
        result = repo.reconcile_subject("physics", desired)
        assert result["inserted"] == 2
        assert result["deactivated"] == 1
        assert result["kept"] == 2
        assert repo.rows["phys_a"]["is_active"] is True
        assert repo.rows["phys_b"]["is_active"] is True
        assert repo.rows["phys_old_skill"]["is_active"] is False

    def test_deactivate_preserves_row_not_delete(self):
        repo = _FakeKnowledgeRepo([_kp("phys_removed")])
        repo.reconcile_subject("physics", [])
        # row 還在,只是 inactive
        assert "phys_removed" in repo.rows
        assert repo.rows["phys_removed"]["is_active"] is False

    def test_deactivate_only_within_subject(self):
        repo = _FakeKnowledgeRepo([
            _kp("phys_a"),
            _kp("math_x", subject="math"),
        ])
        desired = []  # physics 全部清空
        result = repo.reconcile_subject("physics", desired)
        assert result["deactivated"] == 1
        assert repo.rows["phys_a"]["is_active"] is False
        # math_x 完全不受影響
        assert repo.rows["math_x"]["is_active"] is True


class TestReconcileSubjectMixed:
    """綜合場景:insert + update + deactivate 同時發生"""

    def test_all_three_paths(self):
        repo = _FakeKnowledgeRepo([
            {"subject": "physics", "point_code": "phys_old_name", "point_name": "舊", "category": "c", "is_active": True},
            {"subject": "physics", "point_code": "phys_to_deactivate", "point_name": "廢棄", "category": "c", "is_active": True},
        ])
        desired = [
            {"subject": "physics", "point_code": "phys_old_name", "point_name": "新", "category": "c", "description": "[elective] x", "parent_code": None, "difficulty_level": 1, "display_order": 1},
            {"subject": "physics", "point_code": "phys_new_one", "point_name": "剛加的", "category": "c", "description": "[compulsory:core] y", "parent_code": None, "difficulty_level": 1, "display_order": 2},
        ]
        result = repo.reconcile_subject("physics", desired)
        assert result["inserted"] == 2  # upserted = rename(1) + insert(1)
        assert result["deactivated"] == 1
        assert result["kept"] == 1  # phys_old_name 在 DB 且在 desired
        # 檢查狀態
        assert repo.rows["phys_old_name"]["point_name"] == "新"
        assert repo.rows["phys_old_name"]["is_active"] is True
        assert repo.rows["phys_new_one"]["is_active"] is True
        assert repo.rows["phys_to_deactivate"]["is_active"] is False


class TestReconcileSubjectIdempotent:
    """Seed 兩次應該冪等 — count 不增"""

    def test_second_run_is_noop(self):
        repo = _FakeKnowledgeRepo()
        desired = [_kp("phys_a"), _kp("phys_b")]
        r1 = repo.reconcile_subject("physics", desired)
        r2 = repo.reconcile_subject("physics", desired)
        # 第二次 upserted 都是 UPDATE(不新增),deactivated=0
        assert r1["inserted"] == 2 and r1["deactivated"] == 0
        assert r2["inserted"] == 2 and r2["deactivated"] == 0 and r2["kept"] == 2
        assert len(repo.rows) == 2


class TestReconcileSubjectReactivate:
    """之前 deactivate 的 point 再次出現在 desired → is_active=TRUE"""

    def test_reactivate(self):
        repo = _FakeKnowledgeRepo([
            {"subject": "physics", "point_code": "phys_a", "is_active": False, "point_name": "x", "category": "c"},
        ])
        desired = [_kp("phys_a")]
        result = repo.reconcile_subject("physics", desired)
        assert repo.rows["phys_a"]["is_active"] is True
        assert result["inserted"] == 1
        assert result["deactivated"] == 0
        assert result["kept"] == 1


# ============================================================
# 實際 seed JSON 資料合理性驗證
# ============================================================

class TestPhysicsSeedJson:
    """讀真實 data/knowledge_points_seed.json 驗證物理 section 結構"""

    def _load(self):
        import json, os
        path = os.path.join(
            os.path.dirname(__file__), "..", "..", "..",
            "data", "knowledge_points_seed.json",
        )
        with open(path, encoding="utf-8") as f:
            return json.load(f)

    def test_physics_count(self):
        data = self._load()
        phys = [p for p in data["points"] if p.get("subject") == "physics"]
        # 預期 ~53 (plan 最終數字)
        assert len(phys) >= 40, f"物理知識點至少 40 個,實際 {len(phys)}"
        assert len(phys) <= 70, f"物理知識點不應超過 70,實際 {len(phys)}"

    def test_physics_all_have_tag_prefix(self):
        data = self._load()
        phys = [p for p in data["points"] if p.get("subject") == "physics"]
        valid_prefixes = ("[compulsory:core]", "[compulsory:extension]", "[elective]")
        missing = [
            p["point_code"]
            for p in phys
            if not (p.get("description") or "").startswith(valid_prefixes)
        ]
        assert missing == [], f"缺 tag prefix: {missing}"

    def test_physics_no_orphan_parent(self):
        data = self._load()
        phys = [p for p in data["points"] if p.get("subject") == "physics"]
        codes = {p["point_code"] for p in phys}
        orphans = [
            p["point_code"]
            for p in phys
            if p.get("parent_code") and p["parent_code"] not in codes
        ]
        assert orphans == [], f"parent_code 不存在: {orphans}"

    def test_physics_has_9_root_chapters(self):
        data = self._load()
        phys = [p for p in data["points"] if p.get("subject") == "physics"]
        roots = [p for p in phys if p.get("parent_code") is None]
        # DSE Physics: 5 必修 + 4 選修 = 9 章
        assert len(roots) == 9, f"預期 9 個 ROOT,實際 {len(roots)}"

    def test_physics_has_new_elective_points(self):
        """驗證新增的 8 個選修葉節點都存在"""
        data = self._load()
        phys_codes = {p["point_code"] for p in data["points"] if p.get("subject") == "physics"}
        must_have = {
            "phys_universe_scale",
            "phys_rutherford_model", "phys_nano_scale",
            "phys_home_electricity", "phys_building_efficiency", "phys_transport_efficiency",
            "phys_eye_ear", "phys_non_ionising",
        }
        missing = must_have - phys_codes
        assert missing == set(), f"缺新增的選修點: {missing}"

    def test_physics_sba_removed(self):
        """驗證 5 個 SBA 技能點已從 JSON 移除"""
        data = self._load()
        phys_codes = {p["point_code"] for p in data["points"] if p.get("subject") == "physics"}
        sba = {
            "phys_skill_graph", "phys_skill_dimensional",
            "phys_skill_variables", "phys_skill_data", "phys_skill_uncertainty",
        }
        still_present = phys_codes & sba
        assert still_present == set(), f"SBA 仍在 JSON 裡 (應被 reconcile 為 inactive): {still_present}"

    def test_physics_classification_counts(self):
        """驗證 core / extension / elective 分類數量符合預期"""
        data = self._load()
        phys = [p for p in data["points"] if p.get("subject") == "physics"]
        core = sum(1 for p in phys if "[compulsory:core]" in (p.get("description") or ""))
        ext = sum(1 for p in phys if "[compulsory:extension]" in (p.get("description") or ""))
        elec = sum(1 for p in phys if "[elective]" in (p.get("description") or ""))
        assert core > 20, f"必修核心應 > 20,實際 {core}"
        assert ext == 6, f"延伸應為 6,實際 {ext}"
        assert elec > 15, f"選修應 > 15,實際 {elec}"
