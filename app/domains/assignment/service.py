#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
作業管理 Service
=================
業務邏輯層，處理作業的創建、提交、批改等完整流程。

用法:
    service = AssignmentService(...)
    # 老師: 創建作業
    assignment = service.create_assignment(teacher_id=1, title="Swift 實作", ...)
    # 學生: 提交作業
    submission = service.submit(assignment_id=1, student=user, files=[...])
    # 老師: AI 批改
    ai_result = service.ai_grade_submission(submission_id=1)
    # 老師: 確認並提交分數
    service.grade_submission(submission_id=1, rubric_scores=[...], feedback="...")
"""

import json
import logging
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from fastapi import UploadFile

from app.core.exceptions import NotFoundError, ValidationError
from app.domains.assignment.constants import (
    DOCUMENT_EXTENSIONS,
    EXTENSION_TYPE_MAP,
    MAX_FILE_SIZE,
    TEXT_READABLE_EXTENSIONS,
)
from app.domains.assignment.exceptions import (
    AssignmentNotFoundError,
    AssignmentNotPublishedError,
    DeadlinePassedError,
    FileTooLargeError,
    InvalidFileTypeError,
    SubmissionNotFoundError,
    TooManyFilesError,
)
from app.domains.assignment.repository import (
    AssignmentAttachmentRepository,
    AssignmentRepository,
    RubricItemRepository,
    RubricScoreRepository,
    SubmissionFileRepository,
    SubmissionRepository,
)
from app.domains.user.repository import UserRepository

logger = logging.getLogger(__name__)

# 上傳目錄
UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent.parent / "uploads" / "assignments"


class AssignmentService:
    """作業管理服務"""

    def __init__(
        self,
        assignment_repo: AssignmentRepository,
        submission_repo: SubmissionRepository,
        file_repo: SubmissionFileRepository,
        rubric_repo: RubricItemRepository,
        score_repo: RubricScoreRepository,
        user_repo: UserRepository,
        attachment_repo: Optional["AssignmentAttachmentRepository"] = None,
        settings=None,
    ):
        self._assignment_repo = assignment_repo
        self._submission_repo = submission_repo
        self._file_repo = file_repo
        self._rubric_repo = rubric_repo
        self._score_repo = score_repo
        self._user_repo = user_repo
        self._attachment_repo = attachment_repo
        self._settings = settings
        self._ask_ai_func: Optional[Callable] = None

        # 確保上傳目錄存在
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    def set_ai_function(self, ask_ai: Callable):
        """注入 AI 函數"""
        self._ask_ai_func = ask_ai

    # ================================================================
    # 老師操作
    # ================================================================

    def _calc_max_score(self, rubric_type: str, rubric_items: Optional[List[Dict]],
                         rubric_config: Optional[Dict] = None) -> Optional[float]:
        """根據評分類型計算滿分"""
        if rubric_type == "competency":
            return None  # 能力等級制無數字分數
        if rubric_type == "holistic":
            if rubric_config and rubric_config.get("levels"):
                return max((lv.get("max", 0) for lv in rubric_config["levels"]), default=100)
            return 100.0
        if rubric_type == "weighted_pct":
            return float(rubric_config.get("total_score", 100)) if rubric_config else 100.0
        if rubric_type == "checklist":
            return float(rubric_config.get("max_score", 100)) if rubric_config else 100.0
        # points / analytic_levels / dse_criterion
        if rubric_items:
            return sum(item.get("max_points", 0) or 0 for item in rubric_items)
        return 100.0

    def create_assignment(
        self,
        teacher_id: int,
        teacher_name: str,
        title: str,
        description: str = "",
        target_type: str = "all",
        target_value: Optional[str] = None,
        deadline: Optional[str] = None,
        max_files: int = 5,
        allow_late: bool = False,
        rubric_type: str = "points",
        rubric_config: Optional[Dict] = None,
        rubric_items: Optional[List[Dict]] = None,
    ) -> Dict[str, Any]:
        """創建作業 (草稿狀態)"""
        if not title or not title.strip():
            raise ValidationError("作業標題不能為空", field="title")

        # 解析截止日期
        deadline_dt = None
        if deadline:
            try:
                deadline_dt = datetime.fromisoformat(deadline)
            except ValueError:
                raise ValidationError("截止日期格式無效", field="deadline")

        # 計算滿分
        max_score = self._calc_max_score(rubric_type, rubric_items, rubric_config)

        # 插入作業
        insert_data = {
            "title": title.strip(),
            "description": description.strip() if description else "",
            "created_by": teacher_id,
            "created_by_name": teacher_name,
            "target_type": target_type,
            "target_value": target_value,
            "max_score": max_score,
            "rubric_type": rubric_type,
            "deadline": deadline_dt,
            "status": "draft",
            "allow_late": allow_late,
            "max_files": max_files,
            "created_at": datetime.now(),
            "updated_at": datetime.now(),
        }
        if rubric_config is not None:
            insert_data["rubric_config"] = json.dumps(rubric_config, ensure_ascii=False)

        assignment_id = self._assignment_repo.insert_get_id(insert_data)

        # 插入評分標準
        if rubric_items:
            self._rubric_repo.batch_insert(assignment_id, rubric_items)

        logger.info("教師 %s 創建了作業 #%d: %s (類型=%s)", teacher_name, assignment_id, title, rubric_type)
        return self.get_assignment_detail(assignment_id)

    def update_assignment(
        self,
        assignment_id: int,
        teacher_id: int,
        **fields,
    ) -> Dict[str, Any]:
        """更新草稿作業"""
        assignment = self._get_assignment_or_raise(assignment_id)

        if assignment["status"] != "draft":
            raise ValidationError("只有草稿狀態的作業可以編輯")

        rubric_items = fields.pop("rubric_items", None)
        rubric_type = fields.pop("rubric_type", None)
        rubric_config = fields.pop("rubric_config", None)

        allowed = {"title", "description", "target_type", "target_value",
                    "deadline", "max_files", "allow_late"}
        update_data = {}
        for key, value in fields.items():
            if key in allowed and value is not None:
                if key == "deadline" and isinstance(value, str):
                    try:
                        update_data[key] = datetime.fromisoformat(value) if value else None
                    except ValueError:
                        raise ValidationError("截止日期格式無效", field="deadline")
                else:
                    update_data[key] = value

        if rubric_type is not None:
            update_data["rubric_type"] = rubric_type
        if rubric_config is not None:
            update_data["rubric_config"] = json.dumps(rubric_config, ensure_ascii=False)

        # 更新評分標準
        if rubric_items is not None:
            self._rubric_repo.delete_by_assignment(assignment_id)
            if rubric_items:
                self._rubric_repo.batch_insert(assignment_id, rubric_items)
            # 重新計算滿分
            effective_type = rubric_type or assignment.get("rubric_type") or "points"
            effective_config = rubric_config
            if effective_config is None and assignment.get("rubric_config"):
                cfg = assignment["rubric_config"]
                effective_config = json.loads(cfg) if isinstance(cfg, str) else cfg
            update_data["max_score"] = self._calc_max_score(
                effective_type, rubric_items, effective_config
            )

        update_data["updated_at"] = datetime.now()

        if update_data:
            self._assignment_repo.update(
                data=update_data,
                where="id = %s",
                params=(assignment_id,),
            )

        logger.info("教師更新了作業 #%d", assignment_id)
        return self.get_assignment_detail(assignment_id)

    def publish_assignment(self, assignment_id: int, teacher_id: int) -> Dict[str, Any]:
        """發布作業"""
        assignment = self._get_assignment_or_raise(assignment_id)

        if assignment["status"] == "closed":
            raise ValidationError("已關閉的作業不能重新發布")

        self._assignment_repo.update(
            data={
                "status": "published",
                "published_at": datetime.now(),
                "updated_at": datetime.now(),
            },
            where="id = %s AND is_deleted = 0",
            params=(assignment_id,),
        )

        logger.info("作業 #%d 已發布", assignment_id)
        return self.get_assignment_detail(assignment_id)

    def close_assignment(self, assignment_id: int, teacher_id: int) -> Dict[str, Any]:
        """關閉作業 (停止接受提交)"""
        self._get_assignment_or_raise(assignment_id)

        self._assignment_repo.update(
            data={"status": "closed", "updated_at": datetime.now()},
            where="id = %s AND is_deleted = 0",
            params=(assignment_id,),
        )

        logger.info("作業 #%d 已關閉", assignment_id)
        return self.get_assignment_detail(assignment_id)

    def delete_assignment(self, assignment_id: int, teacher_id: int) -> None:
        """軟刪除作業"""
        self._get_assignment_or_raise(assignment_id)
        self._assignment_repo.soft_delete(
            where="id = %s",
            params=(assignment_id,),
        )
        logger.info("作業 #%d 已刪除", assignment_id)

    def list_teacher_assignments(
        self,
        teacher_id: int = 0,
        status: str = "",
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """獲取老師的作業列表 (分頁)"""
        result = self._assignment_repo.find_active(
            status=status,
            created_by=teacher_id,
            page=page,
            page_size=page_size,
        )

        # 為每個作業附加統計和評分標準
        for item in result["items"]:
            stats = self._submission_repo.get_submission_stats(item["id"])
            item["submission_count"] = stats["total_submissions"] if stats else 0
            item["graded_count"] = stats["graded_count"] if stats else 0
            rubric = self._rubric_repo.find_by_assignment(item["id"])
            item["rubric_items"] = rubric

        return result

    @staticmethod
    def _deserialize_json_fields(data: Dict) -> Dict:
        """反序列化 JSON 字段"""
        for key in ("rubric_config", "level_definitions"):
            val = data.get(key)
            if isinstance(val, str):
                try:
                    data[key] = json.loads(val)
                except (json.JSONDecodeError, TypeError):
                    pass
        return data

    def get_assignment_detail(self, assignment_id: int) -> Dict[str, Any]:
        """獲取作業完整詳情"""
        assignment = self._get_assignment_or_raise(assignment_id)
        self._deserialize_json_fields(assignment)

        rubric_items = self._rubric_repo.find_by_assignment(assignment_id)
        for item in rubric_items:
            self._deserialize_json_fields(item)
        assignment["rubric_items"] = rubric_items

        # 附件
        if self._attachment_repo:
            assignment["attachments"] = self._attachment_repo.find_by_assignment(assignment_id)
        else:
            assignment["attachments"] = []

        stats = self._submission_repo.get_submission_stats(assignment_id)
        assignment["submission_count"] = stats["total_submissions"] if stats else 0
        assignment["graded_count"] = stats["graded_count"] if stats else 0
        assignment["avg_score"] = float(stats["avg_score"]) if stats and stats["avg_score"] else None

        return assignment

    def list_submissions(
        self,
        assignment_id: int,
        status: str = "",
    ) -> List[Dict[str, Any]]:
        """獲取某作業的所有提交"""
        self._get_assignment_or_raise(assignment_id)
        submissions = self._submission_repo.find_by_assignment(assignment_id, status)

        # 附加文件和逐項得分
        for sub in submissions:
            sub["files"] = self._file_repo.find_by_submission(sub["id"])
            sub["rubric_scores"] = self._score_repo.find_by_submission(sub["id"])

        return submissions

    def get_submission_detail(self, submission_id: int) -> Dict[str, Any]:
        """獲取單個提交的完整詳情"""
        submission = self._submission_repo.find_by_id(submission_id)
        if not submission:
            raise SubmissionNotFoundError(submission_id)

        submission["files"] = self._file_repo.find_by_submission(submission_id)
        submission["rubric_scores"] = self._score_repo.find_by_submission(submission_id)

        # 附加作業信息 (含評分標準)
        assignment = self._assignment_repo.find_by_id(submission["assignment_id"])
        if assignment:
            self._deserialize_json_fields(assignment)
            submission["assignment"] = assignment
            rubric_items = self._rubric_repo.find_by_assignment(
                submission["assignment_id"]
            )
            for item in rubric_items:
                self._deserialize_json_fields(item)
            submission["rubric_items"] = rubric_items

        return submission

    def _calc_total_score(self, rubric_type: str, rubric_scores: List[Dict],
                           rubric_items: List[Dict], rubric_config: Optional[Dict]) -> Optional[float]:
        """根據評分類型計算學生總分"""
        if rubric_type == "competency":
            return None

        if rubric_type == "holistic":
            # 整體評分: 直接取第一個分數
            if rubric_scores:
                return rubric_scores[0].get("points") or 0
            return 0

        if rubric_type == "checklist":
            # 通過清單: passed / total × max_score
            max_score = float(rubric_config.get("max_score", 100)) if rubric_config else 100.0
            total_items = len(rubric_items) if rubric_items else 1
            passed = sum(1 for s in rubric_scores if (s.get("points") or 0) > 0)
            return round(passed / total_items * max_score, 1)

        if rubric_type == "weighted_pct":
            # 權重百分比: sum(score × weight / 100)
            item_map = {item["id"]: item for item in rubric_items}
            total = 0.0
            for s in rubric_scores:
                item = item_map.get(s["rubric_item_id"], {})
                weight = float(item.get("weight", 0) or 0)
                pts = float(s.get("points", 0) or 0)
                total += pts * weight / 100.0
            return round(total, 1)

        # points / analytic_levels / dse_criterion: sum of points
        return sum(float(s.get("points", 0) or 0) for s in rubric_scores)

    def grade_submission(
        self,
        submission_id: int,
        teacher_id: int,
        rubric_scores: List[Dict],
        feedback: str = "",
    ) -> Dict[str, Any]:
        """批改提交 - 逐項打分 (支持多種評分類型)"""
        submission = self._submission_repo.find_by_id(submission_id)
        if not submission:
            raise SubmissionNotFoundError(submission_id)

        # 獲取作業信息以確定評分類型
        assignment = self._assignment_repo.find_by_id(submission["assignment_id"])
        rubric_type = (assignment or {}).get("rubric_type") or "points"
        rubric_config_raw = (assignment or {}).get("rubric_config")
        rubric_config = json.loads(rubric_config_raw) if isinstance(rubric_config_raw, str) else rubric_config_raw
        rubric_items = self._rubric_repo.find_by_assignment(submission["assignment_id"])

        # 保存逐項得分
        if rubric_scores:
            self._score_repo.batch_upsert(submission_id, rubric_scores)

        # 計算總分
        total_score = self._calc_total_score(rubric_type, rubric_scores, rubric_items, rubric_config)

        # 更新提交狀態
        self._submission_repo.update(
            data={
                "status": "graded",
                "score": total_score,
                "feedback": feedback,
                "graded_by": teacher_id,
                "graded_at": datetime.now(),
                "updated_at": datetime.now(),
            },
            where="id = %s",
            params=(submission_id,),
        )

        logger.info("提交 #%d 已批改，總分: %s (類型=%s)", submission_id, total_score, rubric_type)
        return self.get_submission_detail(submission_id)

    def get_available_targets(self) -> Dict[str, Any]:
        """獲取可選的佈置目標 (班級列表 + 學生列表)"""
        classes_result = self._user_repo.raw_query(
            "SELECT DISTINCT class_name FROM users "
            "WHERE class_name IS NOT NULL AND class_name != '' "
            "ORDER BY class_name"
        )
        classes = [r["class_name"] for r in classes_result]

        students = self._user_repo.find_all(
            where="role = 'student' AND is_active = 1",
            columns="id, username, display_name, class_name",
            order_by="class_name ASC, username ASC",
        )

        return {
            "classes": classes,
            "students": students,
        }

    # ================================================================
    # AI 批改
    # ================================================================

    def _build_ai_prompt(self, rubric_type: str, assignment: Dict,
                          rubric_items: List[Dict], rubric_config: Optional[Dict],
                          submission: Dict, file_contents: str) -> str:
        """根據評分類型構建 AI 批改提示"""
        base = f"""你是一位專業的作業批改助手。請根據以下評分標準嚴格批改學生的作業。

## 作業標題
{assignment['title']}

## 作業描述
{assignment.get('description', '無')}

## 學生提交備註
{submission.get('content', '無')}

## 學生提交文件內容
{file_contents if file_contents else '（無可讀取的文件內容）'}
"""

        if rubric_type == "holistic":
            levels_text = ""
            if rubric_config and rubric_config.get("levels"):
                levels_text = "\n".join(
                    f"- {lv['label']} ({lv.get('min',0)}-{lv.get('max',100)}分): {lv.get('description','')}"
                    for lv in rubric_config["levels"]
                )
            return base + f"""
## 整體評分等級
{levels_text}

請以嚴格 JSON 格式返回:
{{"selected_level": "等級標籤", "points": 分數, "reason": "評分理由", "overall_feedback": "總體評語"}}
"""

        if rubric_type == "checklist":
            items_text = "\n".join(f"- id={item['id']}: {item['title']}" for item in rubric_items)
            return base + f"""
## 檢查清單 (每項判斷通過/不通過)
{items_text}

請以嚴格 JSON 格式返回:
{{"items": [{{"rubric_item_id": ID, "passed": true或false, "reason": "理由"}}, ...], "overall_feedback": "總體評語"}}
"""

        if rubric_type == "competency":
            level_labels = (rubric_config or {}).get("level_labels", ["Not Yet", "Approaching", "Meeting", "Exceeding"])
            labels_text = " / ".join(level_labels)
            items_text = "\n".join(f"- id={item['id']}: {item['title']}" for item in rubric_items)
            return base + f"""
## 能力等級評估 (等級: {labels_text})
{items_text}

請以嚴格 JSON 格式返回 (無數字分數):
{{"items": [{{"rubric_item_id": ID, "selected_level": "等級", "reason": "理由"}}, ...], "overall_feedback": "總體評語"}}
"""

        if rubric_type == "analytic_levels":
            items_text = ""
            for item in rubric_items:
                ld = item.get("level_definitions") or []
                if isinstance(ld, str):
                    try: ld = json.loads(ld)
                    except: ld = []
                levels = ", ".join(f"{l['level']}={l.get('points',0)}分" for l in ld)
                items_text += f"- id={item['id']}: {item['title']} (滿分{item['max_points']}) 等級: [{levels}]\n"
            return base + f"""
## 分級評分標準
{items_text}

請為每項選擇一個等級，以嚴格 JSON 格式返回:
{{"items": [{{"rubric_item_id": ID, "selected_level": "等級名", "points": 分數, "reason": "理由"}}, ...], "overall_feedback": "總體評語"}}
"""

        if rubric_type == "weighted_pct":
            total_score = (rubric_config or {}).get("total_score", 100)
            items_text = "\n".join(
                f"- id={item['id']}: {item['title']} (權重{item.get('weight',0)}%)"
                for item in rubric_items
            )
            return base + f"""
## 權重百分比評分 (滿分 {total_score})
{items_text}

請為每項打分 (0-{total_score})，以嚴格 JSON 格式返回:
{{"items": [{{"rubric_item_id": ID, "points": 分數, "reason": "理由"}}, ...], "overall_feedback": "總體評語"}}
"""

        if rubric_type == "dse_criterion":
            items_text = ""
            for item in rubric_items:
                ld = item.get("level_definitions") or []
                if isinstance(ld, str):
                    try: ld = json.loads(ld)
                    except: ld = []
                desc = "; ".join(f"Level {l['level']}: {l.get('description','')}" for l in ld if l.get("description"))
                items_text += f"- id={item['id']}: {item['title']} (max {item['max_points']}) [{desc}]\n"
            return base + f"""
## DSE 標準量規
{items_text}

請為每項選擇等級 (0-max)，以嚴格 JSON 格式返回:
{{"items": [{{"rubric_item_id": ID, "points": 等級數, "reason": "理由"}}, ...], "overall_feedback": "總體評語"}}
"""

        # Default: points
        rubric_text = "\n".join(
            f"{i+1}. {item['title']} (滿分 {item['max_points']} 分)"
            for i, item in enumerate(rubric_items)
        )
        id_hint = ", ".join(
            f'id={item["id"]}:"{item["title"]}"(滿分{item["max_points"]})'
            for item in rubric_items
        )
        return base + f"""
## 評分標準
{rubric_text}

請以嚴格的 JSON 格式返回批改結果，不要包含任何其他文字：
{{"items": [{{"rubric_item_id": {rubric_items[0]['id']}, "points": 分數, "reason": "評分理由"}}, ...], "overall_feedback": "總體評語"}}

注意：
- 每個 rubric_item_id 必須對應上述評分標準的 ID
- points 不能超過該項的滿分
- reason 請簡短說明得分或失分原因
- overall_feedback 請給出總體評價和改進建議

評分標準 ID 對照: {id_hint}"""

    def ai_grade_submission(self, submission_id: int) -> Dict[str, Any]:
        """AI 自動批改一份提交"""
        if not self._ask_ai_func:
            raise ValidationError("AI 批改功能未初始化")

        submission = self._submission_repo.find_by_id(submission_id)
        if not submission:
            raise SubmissionNotFoundError(submission_id)

        assignment = self._assignment_repo.find_by_id(submission["assignment_id"])
        if not assignment:
            raise AssignmentNotFoundError(submission["assignment_id"])
        self._deserialize_json_fields(assignment)

        rubric_type = assignment.get("rubric_type") or "points"
        rubric_config = assignment.get("rubric_config")

        # 讀取評分標準
        rubric_items = self._rubric_repo.find_by_assignment(assignment["id"])
        for item in rubric_items:
            self._deserialize_json_fields(item)

        if not rubric_items and rubric_type != "holistic":
            raise ValidationError("此作業沒有設定評分標準，無法使用 AI 批改")

        # 讀取提交文件
        files = self._file_repo.find_by_submission(submission_id)
        file_contents = self._extract_file_contents(files)

        prompt = self._build_ai_prompt(
            rubric_type, assignment, rubric_items, rubric_config,
            submission, file_contents
        )

        try:
            model = None
            if self._settings and hasattr(self._settings, 'llm_local_model'):
                model = self._settings.llm_local_model

            answer, _ = self._ask_ai_func(
                question=prompt,
                subject_code="general",
                use_api=False,
                conversation_history=[],
                model=model,
            )

            result = self._parse_ai_response(answer, rubric_items, rubric_type)
            return result

        except Exception as e:
            logger.error("AI 批改失敗: %s", e)
            return {
                "items": [],
                "overall_feedback": f"AI 批改失敗: {str(e)}",
                "error": True,
            }

    def _parse_ai_response(
        self, answer: str, rubric_items: List[Dict], rubric_type: str = "points"
    ) -> Dict[str, Any]:
        """解析 AI 回應中的 JSON"""
        try:
            result = json.loads(answer)
            return self._validate_ai_result(result, rubric_items, rubric_type)
        except json.JSONDecodeError:
            pass

        json_match = re.search(r'\{[\s\S]*\}', answer)
        if json_match:
            try:
                result = json.loads(json_match.group())
                return self._validate_ai_result(result, rubric_items, rubric_type)
            except json.JSONDecodeError:
                pass

        return {
            "items": [],
            "overall_feedback": answer[:500],
            "error": True,
        }

    def _validate_ai_result(
        self, result: Dict, rubric_items: List[Dict], rubric_type: str = "points"
    ) -> Dict[str, Any]:
        """驗證和修正 AI 結果"""
        # 整體評分特殊處理
        if rubric_type == "holistic":
            return {
                "selected_level": result.get("selected_level", ""),
                "points": float(result.get("points", 0)),
                "reason": result.get("reason", ""),
                "overall_feedback": result.get("overall_feedback", ""),
                "items": [],
                "error": False,
            }

        valid_ids = {item["id"]: item for item in rubric_items}
        validated_items = []

        for item in result.get("items", []):
            rid = item.get("rubric_item_id")
            if rid not in valid_ids:
                continue

            rubric_item = valid_ids[rid]
            entry = {
                "rubric_item_id": rid,
                "reason": item.get("reason", ""),
            }

            if rubric_type == "checklist":
                passed = item.get("passed", False)
                entry["points"] = 1 if passed else 0
                entry["passed"] = passed
            elif rubric_type == "competency":
                entry["selected_level"] = item.get("selected_level", "")
                entry["points"] = None
            else:
                points = float(item.get("points", 0) or 0)
                max_p = float(rubric_item.get("max_points", 0) or 1000)
                points = max(0, min(points, max_p))
                entry["points"] = points
                if item.get("selected_level"):
                    entry["selected_level"] = item["selected_level"]

            validated_items.append(entry)

        return {
            "items": validated_items,
            "overall_feedback": result.get("overall_feedback", ""),
            "error": False,
        }

    def _extract_file_contents(self, files: List[Dict]) -> str:
        """提取文件的文本內容 (用於 AI 批改)"""
        contents = []

        for f in files:
            file_path = UPLOAD_DIR / f.get("stored_name", "")
            original_name = f.get("original_name", "")
            ext = Path(original_name).suffix.lower()

            if ext in TEXT_READABLE_EXTENSIONS:
                # 直接讀取代碼/文本文件
                try:
                    if file_path.exists():
                        encodings = ['utf-8', 'gbk', 'gb2312', 'big5', 'utf-16']
                        text = None
                        for encoding in encodings:
                            try:
                                with open(file_path, 'r', encoding=encoding) as fh:
                                    text = fh.read()
                                break
                            except (UnicodeDecodeError, UnicodeError):
                                continue

                        if text:
                            # 限制每個文件的文本長度
                            if len(text) > 10000:
                                text = text[:10000] + "\n... (文件過長，已截斷)"
                            contents.append(
                                f"### 文件: {original_name}\n```\n{text}\n```"
                            )
                except Exception as e:
                    logger.warning("讀取文件 %s 失敗: %s", original_name, e)

            elif ext in DOCUMENT_EXTENSIONS:
                # 嘗試用 FileProcessor 提取
                try:
                    from llm.rag.file_processor import FileProcessor
                    processor = FileProcessor()
                    success, text, _ = processor.process_file(
                        str(file_path), original_name
                    )
                    if success and text:
                        if len(text) > 10000:
                            text = text[:10000] + "\n... (文件過長，已截斷)"
                        contents.append(
                            f"### 文件: {original_name}\n{text}"
                        )
                except Exception as e:
                    logger.warning("處理文件 %s 失敗: %s", original_name, e)
                    contents.append(f"### 文件: {original_name}\n（無法提取內容）")
            else:
                contents.append(f"### 文件: {original_name}\n（{f.get('file_type', '未知')} 類型，無法提取文本）")

        return "\n\n".join(contents)

    # ================================================================
    # 學生操作
    # ================================================================

    def list_student_assignments(
        self,
        username: str,
        class_name: str = "",
        status_filter: str = "",
    ) -> List[Dict[str, Any]]:
        """獲取學生可見的作業列表"""
        assignments = self._assignment_repo.find_published_for_student(
            username, class_name
        )

        # 查詢學生的用戶 ID
        user = self._user_repo.find_one(
            where="username = %s",
            params=(username,),
            columns="id",
        )
        student_id = user["id"] if user else 0

        result = []
        for a in assignments:
            # 查詢提交狀態
            submission = self._submission_repo.find_by_assignment_student(
                a["id"], student_id
            )
            submission_status = submission["status"] if submission else "not_submitted"
            score = submission["score"] if submission and submission.get("score") is not None else None

            # 篩選
            if status_filter == "not_submitted" and submission:
                continue
            if status_filter == "submitted" and (not submission or submission["status"] != "submitted"):
                continue
            if status_filter == "graded" and (not submission or submission["status"] != "graded"):
                continue

            a["submission_status"] = submission_status
            a["my_score"] = score
            a["rubric_items"] = self._rubric_repo.find_by_assignment(a["id"])
            result.append(a)

        return result

    def get_student_assignment_detail(
        self,
        assignment_id: int,
        username: str,
    ) -> Dict[str, Any]:
        """獲取學生的作業詳情 (含自己的提交)"""
        assignment = self._get_assignment_or_raise(assignment_id)

        if assignment["status"] != "published" and assignment["status"] != "closed":
            raise AssignmentNotPublishedError()

        assignment["rubric_items"] = self._rubric_repo.find_by_assignment(assignment_id)

        # 附件
        if self._attachment_repo:
            assignment["attachments"] = self._attachment_repo.find_by_assignment(assignment_id)
        else:
            assignment["attachments"] = []

        # 查詢學生的提交
        user = self._user_repo.find_one(
            where="username = %s",
            params=(username,),
            columns="id",
        )
        student_id = user["id"] if user else 0

        submission = self._submission_repo.find_by_assignment_student(
            assignment_id, student_id
        )
        if submission:
            submission["files"] = self._file_repo.find_by_submission(submission["id"])
            submission["rubric_scores"] = self._score_repo.find_by_submission(submission["id"])

        assignment["my_submission"] = submission
        return assignment

    async def submit_assignment(
        self,
        assignment_id: int,
        student: Dict,
        content: str = "",
        files: Optional[List[UploadFile]] = None,
    ) -> Dict[str, Any]:
        """學生提交作業"""
        assignment = self._get_assignment_or_raise(assignment_id)

        if assignment["status"] != "published":
            raise AssignmentNotPublishedError()

        # 檢查截止日期
        if assignment.get("deadline"):
            deadline = assignment["deadline"]
            if isinstance(deadline, str):
                deadline = datetime.fromisoformat(deadline)
            if datetime.now() > deadline and not assignment.get("allow_late"):
                raise DeadlinePassedError()

        # 檢查文件數量
        max_files = assignment.get("max_files", 5)
        if files and len(files) > max_files:
            raise TooManyFilesError(max_files)

        student_id = student["id"]
        is_late = False
        if assignment.get("deadline"):
            deadline = assignment["deadline"]
            if isinstance(deadline, str):
                deadline = datetime.fromisoformat(deadline)
            is_late = datetime.now() > deadline

        # 檢查是否已提交 (如已提交則更新)
        existing = self._submission_repo.find_by_assignment_student(
            assignment_id, student_id
        )

        if existing:
            # 更新現有提交
            submission_id = existing["id"]
            self._submission_repo.update(
                data={
                    "content": content,
                    "status": "submitted",
                    "is_late": is_late,
                    "score": None,
                    "feedback": None,
                    "graded_by": None,
                    "graded_at": None,
                    "updated_at": datetime.now(),
                },
                where="id = %s",
                params=(submission_id,),
            )
            # 刪除舊文件記錄 (物理文件暫保留)
            self._file_repo.delete_by_submission(submission_id)
            self._score_repo.delete_by_submission(submission_id)
        else:
            # 創建新提交
            submission_id = self._submission_repo.insert_get_id({
                "assignment_id": assignment_id,
                "student_id": student_id,
                "student_name": student.get("display_name", ""),
                "username": student.get("username", ""),
                "class_name": student.get("class_name", ""),
                "content": content,
                "status": "submitted",
                "is_late": is_late,
                "submitted_at": datetime.now(),
                "updated_at": datetime.now(),
            })

        # 保存文件
        if files:
            for f in files:
                await self._save_upload_file(submission_id, f)

        logger.info(
            "學生 %s 提交了作業 #%d",
            student.get("username"), assignment_id,
        )

        return self.get_submission_detail(submission_id)

    async def _save_upload_file(
        self, submission_id: int, file: UploadFile
    ) -> Dict[str, Any]:
        """保存上傳的文件"""
        original_name = file.filename or "unnamed"
        ext = Path(original_name).suffix.lower()

        # 檢查文件類型
        file_type = EXTENSION_TYPE_MAP.get(ext)
        if not file_type:
            raise InvalidFileTypeError(ext)

        # 讀取文件內容
        content = await file.read()
        file_size = len(content)

        # 檢查大小
        if file_size > MAX_FILE_SIZE:
            raise FileTooLargeError(MAX_FILE_SIZE // 1024 // 1024)

        # UUID 命名存儲
        stored_name = f"{uuid.uuid4().hex}{ext}"
        file_path = UPLOAD_DIR / stored_name

        with open(file_path, "wb") as fh:
            fh.write(content)

        # 保存數據庫記錄
        file_id = self._file_repo.insert_get_id({
            "submission_id": submission_id,
            "original_name": original_name,
            "stored_name": stored_name,
            "file_path": f"uploads/assignments/{stored_name}",
            "file_size": file_size,
            "file_type": file_type,
            "mime_type": file.content_type or "",
        })

        return {
            "id": file_id,
            "original_name": original_name,
            "stored_name": stored_name,
            "file_size": file_size,
            "file_type": file_type,
        }

    # ================================================================
    # 作業附件
    # ================================================================

    async def upload_attachment(
        self, assignment_id: int, teacher_id: int, file: UploadFile
    ) -> Dict[str, Any]:
        """上傳作業附件（教師用）"""
        assignment = self._get_assignment_or_raise(assignment_id)
        if assignment.get("created_by") != teacher_id:
            from app.core.exceptions import AuthorizationError
            raise AuthorizationError("只有作業創建者可以上傳附件")

        if not self._attachment_repo:
            raise ValidationError("附件功能未初始化")

        original_name = file.filename or "unnamed"
        ext = Path(original_name).suffix.lower()

        file_type = EXTENSION_TYPE_MAP.get(ext)
        if not file_type:
            raise InvalidFileTypeError(ext)

        content = await file.read()
        file_size = len(content)
        if file_size > MAX_FILE_SIZE:
            raise FileTooLargeError(MAX_FILE_SIZE // 1024 // 1024)

        stored_name = f"{uuid.uuid4().hex}{ext}"
        file_path = UPLOAD_DIR / stored_name

        with open(file_path, "wb") as fh:
            fh.write(content)

        file_id = self._attachment_repo.insert_get_id({
            "assignment_id": assignment_id,
            "original_name": original_name,
            "stored_name": stored_name,
            "file_path": f"uploads/assignments/{stored_name}",
            "file_size": file_size,
            "file_type": file_type,
            "mime_type": file.content_type or "",
        })

        logger.info("作業 #%d 上傳附件: %s (%d bytes)", assignment_id, original_name, file_size)
        return {
            "id": file_id,
            "original_name": original_name,
            "stored_name": stored_name,
            "file_path": f"uploads/assignments/{stored_name}",
            "file_size": file_size,
            "file_type": file_type,
        }

    def delete_attachment(self, attachment_id: int, teacher_id: int) -> bool:
        """刪除作業附件（軟刪除）"""
        if not self._attachment_repo:
            raise ValidationError("附件功能未初始化")

        attachment = self._attachment_repo.find_by_id(attachment_id)
        if not attachment:
            raise NotFoundError("附件不存在")

        # 驗證歸屬
        assignment = self._assignment_repo.find_by_id(attachment["assignment_id"])
        if not assignment or assignment.get("created_by") != teacher_id:
            from app.core.exceptions import AuthorizationError
            raise AuthorizationError("只有作業創建者可以刪除附件")

        self._attachment_repo.soft_delete_attachment(attachment_id)
        logger.info("刪除附件 #%d (作業 #%d)", attachment_id, attachment["assignment_id"])
        return True

    # ================================================================
    # Swift 運行
    # ================================================================

    @staticmethod
    def _find_swift_env():
        """查找 swiftc 可執行檔路徑及所需的環境變數"""
        import shutil
        import glob as _glob

        swift_base = os.path.join(
            os.environ.get("LOCALAPPDATA", ""), "Programs", "Swift"
        )

        # 1. 嘗試系統 PATH
        swiftc = shutil.which("swiftc")
        if swiftc:
            return swiftc, None

        # 2. Windows 默認安裝位置
        tc_pattern = os.path.join(swift_base, "Toolchains", "*", "usr", "bin", "swiftc.exe")
        matches = sorted(_glob.glob(tc_pattern), reverse=True)
        if not matches:
            return "swiftc", None

        swiftc_exe = matches[0]
        toolchain_bin = os.path.dirname(swiftc_exe)

        # 收集 DLL 路徑
        extra_paths = [toolchain_bin]
        rt_pattern = os.path.join(swift_base, "Runtimes", "*", "usr", "bin")
        for p in sorted(_glob.glob(rt_pattern), reverse=True):
            extra_paths.append(p)

        env = os.environ.copy()
        env["PATH"] = ";".join(extra_paths) + ";" + env.get("PATH", "")

        # SDKROOT
        sdk_pattern = os.path.join(swift_base, "Platforms", "*", "Windows.platform", "Developer", "SDKs", "Windows.sdk")
        sdk_matches = sorted(_glob.glob(sdk_pattern), reverse=True)
        if sdk_matches:
            env["SDKROOT"] = sdk_matches[0]

        # Windows SDK (UCRT) include / lib paths
        winsdk_base = os.path.join(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"), "Windows Kits", "10")
        sdk_versions = sorted(_glob.glob(os.path.join(winsdk_base, "Include", "*")), reverse=True)
        if sdk_versions:
            sv = os.path.basename(sdk_versions[0])
            inc = os.path.join(winsdk_base, "Include", sv)
            lib = os.path.join(winsdk_base, "Lib", sv)
            env["INCLUDE"] = ";".join([
                os.path.join(inc, "ucrt"), os.path.join(inc, "um"), os.path.join(inc, "shared"),
            ]) + ";" + env.get("INCLUDE", "")
            env["LIB"] = ";".join([
                os.path.join(lib, "ucrt", "x64"), os.path.join(lib, "um", "x64"),
            ]) + ";" + env.get("LIB", "")

        # VC Tools include / lib
        vc_pattern = os.path.join(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"),
                                  "Microsoft Visual Studio", "2022", "BuildTools", "VC", "Tools", "MSVC", "*")
        vc_matches = sorted(_glob.glob(vc_pattern), reverse=True)
        if vc_matches:
            vc = vc_matches[0]
            env["INCLUDE"] = os.path.join(vc, "include") + ";" + env.get("INCLUDE", "")
            env["LIB"] = os.path.join(vc, "lib", "x64") + ";" + env.get("LIB", "")

        return swiftc_exe, env

    def run_swift_code(self, code: str) -> Dict[str, Any]:
        """
        運行 Swift 代碼

        使用 swiftc 編譯後執行。
        """
        import subprocess
        import tempfile

        tmp_file = None
        exe_path = None
        try:
            swiftc_path, env = self._find_swift_env()

            # 寫入臨時文件
            tmp_file = tempfile.NamedTemporaryFile(
                suffix=".swift", mode="w", delete=False, encoding="utf-8"
            )
            tmp_file.write(code)
            tmp_file.close()
            exe_path = tmp_file.name.replace(".swift", ".exe")

            # 編譯
            compile_result = subprocess.run(
                [swiftc_path, "-o", exe_path, tmp_file.name],
                capture_output=True, text=True, timeout=30, env=env,
            )
            if compile_result.returncode != 0:
                return {
                    "success": False,
                    "stdout": "",
                    "stderr": compile_result.stderr,
                    "return_code": compile_result.returncode,
                }

            # 執行
            result = subprocess.run(
                [exe_path],
                capture_output=True, text=True, timeout=10, env=env,
            )

            return {
                "success": result.returncode == 0,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "return_code": result.returncode,
            }

        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "stdout": "",
                "stderr": "執行超時 (10秒限制)",
                "return_code": -1,
            }
        except FileNotFoundError:
            return {
                "success": False,
                "stdout": "",
                "stderr": "Swift 編譯器未找到，請確認已安裝 Swift",
                "return_code": -1,
            }
        except Exception as e:
            return {
                "success": False,
                "stdout": "",
                "stderr": str(e),
                "return_code": -1,
            }
        finally:
            # 清理臨時文件
            if tmp_file and os.path.exists(tmp_file.name):
                os.unlink(tmp_file.name)
            if exe_path and os.path.exists(exe_path):
                os.unlink(exe_path)
            # 清理編譯產生的 .lib / .exp 文件
            if exe_path:
                for ext in (".lib", ".exp"):
                    p = exe_path.replace(".exe", ext)
                    if os.path.exists(p):
                        os.unlink(p)

    # ================================================================
    # 輔助方法
    # ================================================================

    def _get_assignment_or_raise(self, assignment_id: int) -> Dict[str, Any]:
        """獲取作業，不存在或已刪除則拋出異常"""
        assignment = self._assignment_repo.find_one(
            where="id = %s AND is_deleted = 0",
            params=(assignment_id,),
        )
        if not assignment:
            raise AssignmentNotFoundError(assignment_id)
        return assignment
