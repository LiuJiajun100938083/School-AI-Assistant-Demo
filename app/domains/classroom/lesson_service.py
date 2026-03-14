"""
课案计划 — Service 层

薄编排层：协调 Repository、SlideHandler、异常处理。
所有类型专属逻辑委托给 handler，Service 不实现任何 slide_type 分支。

职责:
- Plan CRUD + 权限校验
- Slide CRUD + typed config 校验
- Session 生命周期 (start / navigate / slide-action / end)
- 学生响应提交
- 状态查询 (重连恢复)
"""

import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from pydantic import ValidationError

from app.domains.classroom.lesson_exceptions import (
    AlreadyRespondedError,
    InvalidLifecycleTransitionError,
    InvalidSlideConfigError,
    PlanAccessDeniedError,
    PlanNotFoundError,
    SessionAlreadyActiveError,
    SessionNotFoundError,
    SlideNotAcceptingResponsesError,
    SlideNotFoundError,
)
from app.domains.classroom.lesson_repository import (
    LessonPlanRepository,
    LessonResponseRepository,
    LessonSessionRepository,
    LessonSlideRepository,
)
from app.domains.classroom.slide_handlers import get_slide_handler

logger = logging.getLogger(__name__)

# action → target lifecycle state
_ACTION_TO_LIFECYCLE = {
    "activate": "activated",
    "open_responses": "responding",
    "close_responses": "closed",
    "show_results": "results_shown",
    "complete": "completed",
}

# lifecycle states where responses are accepted
_RESPONDING_STATES = {"responding"}


class LessonService:
    """课案管理服务 — 薄编排层"""

    def __init__(
        self,
        plan_repo: LessonPlanRepository,
        slide_repo: LessonSlideRepository,
        session_repo: LessonSessionRepository,
        response_repo: LessonResponseRepository,
    ):
        self._plan_repo = plan_repo
        self._slide_repo = slide_repo
        self._session_repo = session_repo
        self._response_repo = response_repo

    # ============================================================
    # Init (auto-create tables)
    # ============================================================

    def init_tables(self) -> None:
        """幂等建表 — 启动时调用，确保 4 张表存在"""
        logger.info("初始化课案系统表...")
        pool = self._plan_repo.pool

        pool.execute_write("""
            CREATE TABLE IF NOT EXISTS lesson_plans (
                id               INT AUTO_INCREMENT,
                plan_id          VARCHAR(64) NOT NULL,
                title            VARCHAR(255) NOT NULL,
                description      TEXT,
                teacher_username VARCHAR(100) NOT NULL,
                total_slides     INT DEFAULT 0,
                status           ENUM('draft','ready','archived') DEFAULT 'draft',
                created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                is_deleted       BOOLEAN DEFAULT FALSE,
                PRIMARY KEY (id),
                UNIQUE KEY uk_plan_id (plan_id),
                INDEX idx_teacher (teacher_username),
                INDEX idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        pool.execute_write("""
            CREATE TABLE IF NOT EXISTS lesson_slides (
                id               INT AUTO_INCREMENT,
                slide_id         VARCHAR(64) NOT NULL,
                plan_id          VARCHAR(64) NOT NULL,
                slide_order      INT NOT NULL,
                slide_type       ENUM('ppt','game','quiz','quick_answer','raise_hand','poll','link') NOT NULL,
                title            VARCHAR(255) DEFAULT '',
                config           JSON NOT NULL,
                config_version   INT DEFAULT 1,
                duration_seconds INT DEFAULT 0,
                created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uk_slide_id (slide_id),
                UNIQUE KEY uk_plan_order (plan_id, slide_order),
                FOREIGN KEY (plan_id) REFERENCES lesson_plans(plan_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        pool.execute_write("""
            CREATE TABLE IF NOT EXISTS lesson_sessions (
                id                  INT AUTO_INCREMENT,
                session_id          VARCHAR(64) NOT NULL,
                room_id             VARCHAR(64) NOT NULL,
                plan_id             VARCHAR(64) NOT NULL,
                status              ENUM('pending','live','paused','ended') DEFAULT 'pending',
                current_slide_id    VARCHAR(64) DEFAULT NULL,
                current_slide_order INT DEFAULT -1,
                slide_lifecycle     ENUM('prepared','activated','responding','closed',
                                         'results_shown','completed') DEFAULT 'prepared',
                slide_started_at    DATETIME DEFAULT NULL,
                slide_ends_at       DATETIME DEFAULT NULL,
                accepting_responses BOOLEAN DEFAULT FALSE,
                annotations_json    LONGTEXT DEFAULT NULL,
                runtime_meta        JSON DEFAULT NULL,
                started_at          DATETIME DEFAULT NULL,
                ended_at            DATETIME DEFAULT NULL,
                PRIMARY KEY (id),
                UNIQUE KEY uk_session_id (session_id),
                INDEX idx_room (room_id),
                INDEX idx_room_status (room_id, status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        pool.execute_write("""
            CREATE TABLE IF NOT EXISTS lesson_slide_responses (
                id               INT AUTO_INCREMENT,
                response_id      VARCHAR(64) NOT NULL,
                session_id       VARCHAR(64) NOT NULL,
                slide_id         VARCHAR(64) NOT NULL,
                student_username VARCHAR(100) NOT NULL,
                response_type    ENUM('quiz_answer','quick_answer','raise_hand',
                                     'poll_vote','game_score') NOT NULL,
                response_data    JSON NOT NULL,
                is_correct       TINYINT(1) DEFAULT NULL,
                score            DECIMAL(8,2) DEFAULT NULL,
                responded_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uk_response_id (response_id),
                UNIQUE KEY uk_one_response (session_id, slide_id, student_username, response_type),
                INDEX idx_session_slide (session_id, slide_id),
                INDEX idx_student (student_username, session_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        # Add lesson_session_id column to classroom_rooms if not exists
        try:
            pool.execute_write(
                "ALTER TABLE classroom_rooms ADD COLUMN lesson_session_id VARCHAR(64) DEFAULT NULL"
            )
        except Exception:
            pass  # Column already exists

        # Make ppt_files.room_id nullable (for room-independent lesson plan uploads)
        try:
            pool.execute_write(
                "ALTER TABLE ppt_files MODIFY room_id VARCHAR(64) DEFAULT NULL "
                "COMMENT '→ classroom_rooms.room_id (NULL=课案直传)'"
            )
        except Exception:
            pass  # Already nullable or table doesn't exist yet

        # Add room_id to lesson_plans (each plan belongs to a specific classroom)
        try:
            pool.execute_write(
                "ALTER TABLE lesson_plans ADD COLUMN room_id VARCHAR(64) DEFAULT NULL "
                "COMMENT '→ classroom_rooms.room_id (NULL=旧数据/全局)'"
            )
        except Exception:
            pass  # Column already exists
        try:
            pool.execute_write(
                "ALTER TABLE lesson_plans ADD INDEX idx_room_id (room_id)"
            )
        except Exception:
            pass  # Index already exists

        # Add 'link' to lesson_slides.slide_type ENUM (for existing databases)
        try:
            pool.execute_write(
                "ALTER TABLE lesson_slides MODIFY slide_type "
                "ENUM('ppt','game','quiz','quick_answer','raise_hand','poll','link') NOT NULL"
            )
        except Exception:
            pass  # Already updated

        logger.info("课案系统表初始化完成")

    # ================================================================
    # Plan CRUD
    # ================================================================

    def create_plan(
        self,
        teacher_username: str,
        title: str,
        description: str = "",
        room_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        plan_id = str(uuid.uuid4())
        now = datetime.now()
        data = {
            "plan_id": plan_id,
            "title": title.strip(),
            "description": description.strip(),
            "teacher_username": teacher_username,
            "total_slides": 0,
            "status": "draft",
            "created_at": now,
            "updated_at": now,
        }
        if room_id:
            data["room_id"] = room_id
        self._plan_repo.create_plan(data)
        logger.info("教师 %s 创建课案 %s (room=%s)", teacher_username, plan_id, room_id)
        data_out = dict(data)
        data_out["room_id"] = room_id
        return data_out

    def get_plan(self, plan_id: str, teacher_username: str) -> Dict[str, Any]:
        plan = self._plan_repo.get_by_plan_id(plan_id)
        if not plan:
            raise PlanNotFoundError(plan_id)
        if plan["teacher_username"] != teacher_username:
            raise PlanAccessDeniedError()
        return plan

    def get_plan_with_slides(self, plan_id: str, teacher_username: str) -> Dict[str, Any]:
        plan = self.get_plan(plan_id, teacher_username)
        slides = self._slide_repo.list_by_plan(plan_id)
        plan["slides"] = slides
        return plan

    def list_plans(
        self,
        teacher_username: str,
        status: Optional[str] = None,
        room_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        plans = self._plan_repo.list_by_teacher(
            teacher_username, status=status, room_id=room_id,
        )
        if room_id and not plans:
            # No room-specific plans found. Auto-claim orphaned global plans
            # (room_id IS NULL) that were used in this room via lesson sessions.
            orphans = self._plan_repo.list_by_teacher(teacher_username, status=status)
            orphans = [p for p in orphans if not p.get("room_id")]
            for orphan in orphans:
                # Check if this plan was ever used in the requested room
                sessions = self._session_repo.list_by_room(room_id, limit=100)
                if any(s["plan_id"] == orphan["plan_id"] for s in sessions):
                    # Claim this orphan for the room
                    self._plan_repo.update_plan(
                        orphan["plan_id"], {"room_id": room_id}
                    )
                    orphan["room_id"] = room_id
                    plans.append(orphan)
            if plans:
                logger.info(
                    "已将 %d 个无归属课案绑定到房间 %s", len(plans), room_id
                )
        return plans

    def update_plan(self, plan_id: str, teacher_username: str, data: Dict[str, Any]) -> Dict[str, Any]:
        plan = self.get_plan(plan_id, teacher_username)
        update = {}
        if "title" in data and data["title"] is not None:
            update["title"] = data["title"].strip()
        if "description" in data and data["description"] is not None:
            update["description"] = data["description"].strip()
        if "status" in data and data["status"] is not None:
            update["status"] = data["status"]
        if update:
            update["updated_at"] = datetime.now()
            self._plan_repo.update_plan(plan_id, update)
        plan.update(update)
        return plan

    def delete_plan(self, plan_id: str, teacher_username: str) -> None:
        self.get_plan(plan_id, teacher_username)
        self._plan_repo.soft_delete_plan(plan_id)
        logger.info("教师 %s 删除课案 %s", teacher_username, plan_id)

    # ================================================================
    # Slide CRUD
    # ================================================================

    def add_slide(
        self,
        plan_id: str,
        teacher_username: str,
        slide_type: str,
        config: dict,
        title: str = "",
        duration_seconds: int = 0,
        insert_at: Optional[int] = None,
    ) -> Dict[str, Any]:
        self.get_plan(plan_id, teacher_username)

        # typed validation via handler
        handler = get_slide_handler(slide_type)
        try:
            handler.validate_config(config)
        except ValidationError as e:
            raise InvalidSlideConfigError(str(e))

        slide_id = str(uuid.uuid4())

        if insert_at is not None:
            self._slide_repo.shift_orders_up(plan_id, insert_at)
            order = insert_at
        else:
            order = self._slide_repo.get_max_order(plan_id) + 1

        now = datetime.now()
        self._slide_repo.create_slide({
            "slide_id": slide_id,
            "plan_id": plan_id,
            "slide_order": order,
            "slide_type": slide_type,
            "title": title.strip(),
            "config": config,
            "config_version": 1,
            "duration_seconds": duration_seconds,
            "created_at": now,
            "updated_at": now,
        })

        total = self._slide_repo.count_by_plan(plan_id)
        self._plan_repo.update_total_slides(plan_id, total)

        return {
            "slide_id": slide_id,
            "plan_id": plan_id,
            "slide_order": order,
            "slide_type": slide_type,
            "title": title.strip(),
            "config": config,
            "config_version": 1,
            "duration_seconds": duration_seconds,
        }

    def update_slide(
        self,
        plan_id: str,
        slide_id: str,
        teacher_username: str,
        data: Dict[str, Any],
    ) -> Dict[str, Any]:
        self.get_plan(plan_id, teacher_username)
        slide = self._slide_repo.get_by_slide_id(slide_id)
        if not slide or slide["plan_id"] != plan_id:
            raise SlideNotFoundError(slide_id)

        update = {}
        if "title" in data and data["title"] is not None:
            update["title"] = data["title"].strip()
        if "duration_seconds" in data and data["duration_seconds"] is not None:
            update["duration_seconds"] = data["duration_seconds"]
        if "config" in data and data["config"] is not None:
            handler = get_slide_handler(slide["slide_type"])
            try:
                handler.validate_config(data["config"])
            except ValidationError as e:
                raise InvalidSlideConfigError(str(e))
            update["config"] = data["config"]

        if update:
            update["updated_at"] = datetime.now()
            self._slide_repo.update_slide(slide_id, update)
        slide.update(update)
        return slide

    def delete_slide(self, plan_id: str, slide_id: str, teacher_username: str) -> None:
        self.get_plan(plan_id, teacher_username)
        slide = self._slide_repo.get_by_slide_id(slide_id)
        if not slide or slide["plan_id"] != plan_id:
            raise SlideNotFoundError(slide_id)

        self._slide_repo.delete_slide(slide_id)
        self._slide_repo.shift_orders_down(plan_id, slide["slide_order"])

        total = self._slide_repo.count_by_plan(plan_id)
        self._plan_repo.update_total_slides(plan_id, total)

    def reorder_slides(self, plan_id: str, teacher_username: str, slide_ids: List[str]) -> int:
        self.get_plan(plan_id, teacher_username)
        return self._slide_repo.reorder_slides(plan_id, slide_ids)

    # ================================================================
    # Session — Start / End
    # ================================================================

    def start_session(self, room_id: str, plan_id: str, teacher_username: str) -> Dict[str, Any]:
        """
        创建课案 session 并绑定到房间。
        Application-layer uniqueness check — 一个房间同时只能有一个 active session.
        """
        plan = self._plan_repo.get_by_plan_id(plan_id)
        if not plan:
            raise PlanNotFoundError(plan_id)
        if plan["teacher_username"] != teacher_username:
            raise PlanAccessDeniedError()

        existing = self._session_repo.get_active_session(room_id)
        if existing:
            raise SessionAlreadyActiveError()

        session_id = str(uuid.uuid4())
        now = datetime.now()

        self._session_repo.create_session({
            "session_id": session_id,
            "room_id": room_id,
            "plan_id": plan_id,
            "status": "live",
            "current_slide_id": None,
            "current_slide_order": -1,
            "slide_lifecycle": "prepared",
            "accepting_responses": False,
            "runtime_meta": None,
            "started_at": now,
        })

        logger.info(
            "教师 %s 在房间 %s 启动课案 %s (session=%s)",
            teacher_username, room_id, plan_id, session_id,
        )

        return {
            "session_id": session_id,
            "room_id": room_id,
            "plan_id": plan_id,
            "status": "live",
            "current_slide_id": None,
            "current_slide_order": -1,
            "slide_lifecycle": "prepared",
            "accepting_responses": False,
            "started_at": now,
        }

    def end_session(self, room_id: str, session_id: str) -> None:
        session = self._session_repo.get_by_session_id(session_id)
        if not session or session["room_id"] != room_id:
            raise SessionNotFoundError()
        self._session_repo.update_session(session_id, {
            "status": "ended",
            "ended_at": datetime.now(),
        })
        logger.info("课案 session %s 已结束 (room=%s)", session_id, room_id)

    # ================================================================
    # Session — Navigate
    # ================================================================

    def navigate(
        self,
        room_id: str,
        session_id: str,
        action: str,
        slide_id: Optional[str] = None,
        annotations_json: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        导航到指定 slide。返回 slide 数据 + session 状态。
        """
        session = self._get_active_session(room_id, session_id)
        plan_id = session["plan_id"]

        if action == "goto":
            if not slide_id:
                raise SlideNotFoundError()
            slide = self._slide_repo.get_by_slide_id(slide_id)
            if not slide or slide["plan_id"] != plan_id:
                raise SlideNotFoundError(slide_id)
        elif action == "next":
            slide = self._slide_repo.get_adjacent_slide(
                plan_id, session["current_slide_order"], "next"
            )
            if not slide:
                # first slide if no current
                if session["current_slide_order"] < 0:
                    slide = self._slide_repo.get_slide_at_order(plan_id, 0)
                if not slide:
                    raise SlideNotFoundError()
        elif action == "prev":
            slide = self._slide_repo.get_adjacent_slide(
                plan_id, session["current_slide_order"], "prev"
            )
            if not slide:
                raise SlideNotFoundError()
        else:
            raise SlideNotFoundError()

        # Save current slide's annotations before switching (if provided)
        current_slide_id = session.get("current_slide_id")
        if annotations_json is not None and current_slide_id:
            self.save_slide_annotations(session_id, current_slide_id, annotations_json)

        # get handler for initial runtime_meta
        handler = get_slide_handler(slide["slide_type"])
        initial_meta = handler.get_initial_runtime_meta()

        now = datetime.now()
        update = {
            "current_slide_id": slide["slide_id"],
            "current_slide_order": slide["slide_order"],
            "slide_lifecycle": "prepared",
            "slide_started_at": now,
            "slide_ends_at": None,
            "accepting_responses": False,
            "runtime_meta": initial_meta,
        }
        # Don't overwrite the annotations_json map with raw annotations —
        # already saved above per-slide.

        self._session_repo.update_session(session_id, update)

        session.update(update)

        # Load target slide's saved annotations (if any)
        target_annotations = self.get_slide_annotations(session_id, slide["slide_id"])

        return {
            "session": session,
            "slide": slide,
            "slide_annotations": target_annotations,
        }

    # ================================================================
    # Session — Slide Lifecycle Actions
    # ================================================================

    def slide_action(
        self,
        room_id: str,
        session_id: str,
        action: str,
        annotations_json: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        执行 slide lifecycle action (activate / open_responses / close_responses / show_results / complete)。
        Handler 声明允许的转换，Service 只做校验和状态写入。
        返回更新后的 session + slide + auto_transition info.
        """
        session = self._get_active_session(room_id, session_id)

        slide_id = session.get("current_slide_id")
        if not slide_id:
            raise SlideNotFoundError()
        slide = self._slide_repo.get_by_slide_id(slide_id)
        if not slide:
            raise SlideNotFoundError(slide_id)

        handler = get_slide_handler(slide["slide_type"])
        current_lifecycle = session.get("slide_lifecycle", "prepared")

        # check if this action is allowed in current lifecycle
        allowed = handler.get_allowed_transitions()
        required_states = allowed.get(action)
        if required_states is None or current_lifecycle not in required_states:
            raise InvalidLifecycleTransitionError(current_lifecycle, action)

        # determine new lifecycle state
        new_lifecycle = _ACTION_TO_LIFECYCLE.get(action)
        if not new_lifecycle:
            raise InvalidLifecycleTransitionError(current_lifecycle, action)

        accepting = new_lifecycle in _RESPONDING_STATES
        now = datetime.now()

        update: Dict[str, Any] = {
            "slide_lifecycle": new_lifecycle,
            "accepting_responses": accepting,
        }

        # set timer if slide has duration and entering responding
        if accepting and slide.get("duration_seconds", 0) > 0:
            update["slide_ends_at"] = now + timedelta(seconds=slide["duration_seconds"])
        elif not accepting:
            update["slide_ends_at"] = None

        # Save annotations per-slide (not on session level)
        if annotations_json is not None and slide_id:
            self.save_slide_annotations(session_id, slide_id, annotations_json)

        self._session_repo.update_session(session_id, update)
        session.update(update)

        # check for auto-transition
        auto = handler.get_auto_transitions()
        auto_next = auto.get(new_lifecycle)

        result = {
            "session": session,
            "slide": slide,
            "new_lifecycle": new_lifecycle,
            "accepting_responses": accepting,
            "auto_transition": auto_next,
        }

        # apply auto-transition immediately
        if auto_next:
            auto_accepting = auto_next in _RESPONDING_STATES
            auto_update = {
                "slide_lifecycle": auto_next,
                "accepting_responses": auto_accepting,
            }
            self._session_repo.update_session(session_id, auto_update)
            session.update(auto_update)
            result["new_lifecycle"] = auto_next
            result["accepting_responses"] = auto_accepting

        return result

    # ================================================================
    # Session — State Query (reconnection)
    # ================================================================

    def get_session_state(self, room_id: str) -> Optional[Dict[str, Any]]:
        """获取房间当前 session 状态，用于重连恢复。"""
        session = self._session_repo.get_active_session(room_id)
        if not session:
            return None

        slide = None
        slide_annotations = None
        current_slide_id = session.get("current_slide_id")
        if current_slide_id:
            slide = self._slide_repo.get_by_slide_id(current_slide_id)
            slide_annotations = self.get_slide_annotations(
                session["session_id"], current_slide_id
            )

        return {
            "session": session,
            "slide": slide,
            "slide_annotations": slide_annotations,
        }

    # ================================================================
    # Student Responses
    # ================================================================

    def submit_response(
        self,
        room_id: str,
        session_id: str,
        slide_id: str,
        student_username: str,
        response_type: str,
        response_data: dict,
    ) -> Dict[str, Any]:
        """
        学生提交响应。
        Handler 处理类型专属逻辑 (评分、正确性)。
        """
        session = self._get_active_session(room_id, session_id)

        if session.get("current_slide_id") != slide_id:
            raise SlideNotFoundError(slide_id)
        if not session.get("accepting_responses"):
            raise SlideNotAcceptingResponsesError()

        # check for duplicate
        existing = self._response_repo.get_student_response(
            session_id, slide_id, student_username, response_type
        )
        if existing:
            raise AlreadyRespondedError()

        slide = self._slide_repo.get_by_slide_id(slide_id)
        if not slide:
            raise SlideNotFoundError(slide_id)

        handler = get_slide_handler(slide["slide_type"])
        result = handler.handle_response(slide, student_username, response_data, session)

        response_id = str(uuid.uuid4())
        self._response_repo.create_response({
            "response_id": response_id,
            "session_id": session_id,
            "slide_id": slide_id,
            "student_username": student_username,
            "response_type": response_type,
            "response_data": response_data,
            "is_correct": result.get("is_correct"),
            "score": result.get("score"),
            "responded_at": datetime.now(),
        })

        total = self._response_repo.count_by_slide(session_id, slide_id)

        return {
            "response_id": response_id,
            "is_correct": result.get("is_correct"),
            "score": result.get("score"),
            "total_responses": total,
        }

    def get_slide_results(
        self,
        session_id: str,
        slide_id: str,
    ) -> Dict[str, Any]:
        """获取 slide 的聚合结果 (teacher only)。"""
        slide = self._slide_repo.get_by_slide_id(slide_id)
        if not slide:
            raise SlideNotFoundError(slide_id)

        responses = self._response_repo.list_by_slide(session_id, slide_id)
        handler = get_slide_handler(slide["slide_type"])
        aggregated = handler.aggregate_results(responses)

        return {
            "slide_id": slide_id,
            "slide_type": slide["slide_type"],
            "total_responses": len(responses),
            "results": aggregated,
        }

    def get_my_response(
        self,
        session_id: str,
        slide_id: str,
        student_username: str,
        response_type: str,
    ) -> Optional[Dict[str, Any]]:
        return self._response_repo.get_student_response(
            session_id, slide_id, student_username, response_type,
        )

    # ================================================================
    # Teacher View Model
    # ================================================================

    def build_teacher_view(
        self,
        session_id: str,
        slide_id: str,
    ) -> Dict[str, Any]:
        """构建教师实时视图数据。"""
        slide = self._slide_repo.get_by_slide_id(slide_id)
        if not slide:
            raise SlideNotFoundError(slide_id)
        session = self._session_repo.get_by_session_id(session_id)
        if not session:
            raise SessionNotFoundError()

        responses = self._response_repo.list_by_slide(session_id, slide_id)
        handler = get_slide_handler(slide["slide_type"])
        return handler.build_teacher_view_model(slide, session, responses)

    # ================================================================
    # Student Payload
    # ================================================================

    def build_student_payload(self, slide_id: str, session_id: str) -> Dict[str, Any]:
        """构建推送给学生的 slide payload。"""
        slide = self._slide_repo.get_by_slide_id(slide_id)
        if not slide:
            raise SlideNotFoundError(slide_id)
        session = self._session_repo.get_by_session_id(session_id)
        if not session:
            raise SessionNotFoundError()

        handler = get_slide_handler(slide["slide_type"])
        payload = handler.build_student_payload(slide, session)

        # For PPT slides, inject per-slide annotations from the map
        if slide["slide_type"] == "ppt":
            ann = self.get_slide_annotations(session_id, slide_id)
            payload["annotations_json"] = ann

        return payload

    # ================================================================
    # PPT Import Helper
    # ================================================================

    def import_ppt_slides(
        self,
        plan_id: str,
        teacher_username: str,
        file_id: str,
        pages: List[Dict[str, Any]],
        insert_at: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        从已上传的 PPT 批量创建 ppt slides。
        pages: [{"page_id": "...", "page_number": 1}, ...]
        insert_at: 插入位置 (None=末尾)，每页递增
        """
        self.get_plan(plan_id, teacher_username)

        created = []
        for i, page in enumerate(pages):
            pos = (insert_at + i) if insert_at is not None else None
            slide = self.add_slide(
                plan_id=plan_id,
                teacher_username=teacher_username,
                slide_type="ppt",
                config={
                    "file_id": file_id,
                    "page_number": page["page_number"],
                    "page_id": page.get("page_id"),
                },
                title=f"Page {page['page_number']}",
                insert_at=pos,
            )
            created.append(slide)

        return created

    # ================================================================
    # Per-Slide Annotations
    # ================================================================
    # annotations_json 列的语义 (过渡架构):
    #   {slide_id: fabric_json_object, slide_id2: ...}
    # 每个 value 是完整 Fabric JSON (含 _canvasRef)。
    # 未来可拆成独立表。

    def _read_annotations_map(self, session: Dict[str, Any]) -> Dict[str, Any]:
        """Parse session's annotations_json as {slide_id: object} map."""
        raw = session.get("annotations_json")
        if not raw:
            return {}
        try:
            parsed = json.loads(raw) if isinstance(raw, str) else raw
            # Backward compat: if it looks like a Fabric JSON (has "objects" key),
            # it's old single-slide format — return empty map (discard stale data)
            if isinstance(parsed, dict) and "objects" in parsed:
                return {}
            return parsed if isinstance(parsed, dict) else {}
        except (json.JSONDecodeError, TypeError):
            return {}

    def _write_annotations_map(self, session_id: str, ann_map: Dict[str, Any]) -> None:
        """Serialize per-slide annotation map back to the column."""
        self._session_repo.update_session(session_id, {
            "annotations_json": json.dumps(ann_map, ensure_ascii=False),
        })

    def save_slide_annotations(
        self, session_id: str, slide_id: str, annotations_json_str: str,
    ) -> None:
        """Save annotations for a specific slide within the session."""
        session = self._session_repo.get_by_session_id(session_id)
        if not session:
            raise SessionNotFoundError()
        ann_map = self._read_annotations_map(session)
        try:
            ann_map[slide_id] = json.loads(annotations_json_str) if isinstance(
                annotations_json_str, str
            ) else annotations_json_str
        except (json.JSONDecodeError, TypeError):
            ann_map[slide_id] = annotations_json_str
        self._write_annotations_map(session_id, ann_map)

    def get_slide_annotations(self, session_id: str, slide_id: str) -> Optional[str]:
        """Get annotations for a specific slide, stringified for frontend."""
        session = self._session_repo.get_by_session_id(session_id)
        if not session:
            return None
        ann_map = self._read_annotations_map(session)
        ann = ann_map.get(slide_id)
        if ann is None:
            return None
        return json.dumps(ann, ensure_ascii=False) if isinstance(ann, dict) else str(ann)

    def push_annotations(
        self,
        room_id: str,
        session_id: str,
        slide_id: str,
        annotations_json: str,
    ) -> Dict[str, Any]:
        """
        Push updated annotations for the current PPT slide.
        Validates: session active, slide_id == current, slide type == ppt.
        Returns: {slide_id, annotations_json, updated_at}
        """
        session = self._get_active_session(room_id, session_id)

        if session.get("current_slide_id") != slide_id:
            raise SlideNotFoundError(slide_id)

        slide = self._slide_repo.get_by_slide_id(slide_id)
        if not slide:
            raise SlideNotFoundError(slide_id)
        if slide["slide_type"] != "ppt":
            raise InvalidLifecycleTransitionError(
                slide["slide_type"], "push_annotations (only ppt allowed)"
            )

        self.save_slide_annotations(session_id, slide_id, annotations_json)
        now = datetime.now()

        return {
            "slide_id": slide_id,
            "annotations_json": annotations_json,
            "updated_at": now.isoformat(),
        }

    # ================================================================
    # Quiz — Per-Question Flow
    # ================================================================

    def quiz_record_answer(
        self,
        room_id: str,
        session_id: str,
        slide_id: str,
        username: str,
        question_id: str,
        answer: str,
    ) -> Dict[str, Any]:
        """记录逐题答案到 runtime_meta（含并发重试）。幂等：重复提交直接返回。"""
        from app.domains.classroom.slide_configs import QuizSlideConfig

        MAX_RETRIES = 3
        for _attempt in range(MAX_RETRIES):
            session = self._get_active_session(room_id, session_id)
            if session.get("current_slide_id") != slide_id:
                raise SlideNotFoundError(slide_id)
            if not session.get("accepting_responses"):
                raise SlideNotAcceptingResponsesError()

            slide = self._slide_repo.get_by_slide_id(slide_id)
            if not slide or slide["slide_type"] != "quiz":
                raise SlideNotFoundError(slide_id)

            handler = get_slide_handler("quiz")
            runtime = handler.parse_runtime_meta(session.get("runtime_meta"))
            if not runtime:
                raise ValueError("Quiz runtime not initialized")
            if runtime.phase != "answering":
                raise SlideNotAcceptingResponsesError()

            config = QuizSlideConfig(**slide["config"])
            current_q = config.questions[runtime.current_question_index]
            if question_id != current_q.id:
                raise ValueError(f"Question ID mismatch: expected {current_q.id}")

            # 幂等：已答过直接返回
            if username in runtime.answers and question_id in runtime.answers[username]:
                return {
                    "recorded": True,
                    "answer_count": runtime.answer_counts.get(question_id, 0),
                }

            handler.record_answer(runtime, username, question_id, answer)
            rows = self._session_repo.update_session(session_id, {
                "runtime_meta": runtime.model_dump(),
            })
            if rows:
                return {
                    "recorded": True,
                    "answer_count": runtime.answer_counts.get(question_id, 0),
                }

        raise ValueError("Failed to record answer after retries")

    def quiz_reveal(self, room_id: str, session_id: str) -> Dict[str, Any]:
        """揭示当前题目答案，将 phase 改为 reveal。"""
        from app.domains.classroom.slide_configs import QuizSlideConfig

        session = self._get_active_session(room_id, session_id)
        slide_id = session.get("current_slide_id")
        slide = self._slide_repo.get_by_slide_id(slide_id) if slide_id else None
        if not slide or slide["slide_type"] != "quiz":
            raise SlideNotFoundError(slide_id or "")

        handler = get_slide_handler("quiz")
        config = QuizSlideConfig(**slide["config"])
        runtime = handler.parse_runtime_meta(session.get("runtime_meta"))
        if not runtime:
            raise ValueError("Quiz runtime not initialized")

        reveal_data = handler.get_reveal_data(config, runtime)
        runtime.phase = "reveal"
        self._session_repo.update_session(session_id, {
            "runtime_meta": runtime.model_dump(),
        })
        return reveal_data

    def quiz_next_question(self, room_id: str, session_id: str) -> Dict[str, Any]:
        """前进到下一题，重置 phase 为 answering。"""
        from app.domains.classroom.slide_configs import QuizSlideConfig

        session = self._get_active_session(room_id, session_id)
        slide_id = session.get("current_slide_id")
        slide = self._slide_repo.get_by_slide_id(slide_id) if slide_id else None
        if not slide or slide["slide_type"] != "quiz":
            raise SlideNotFoundError(slide_id or "")

        handler = get_slide_handler("quiz")
        config = QuizSlideConfig(**slide["config"])
        runtime = handler.parse_runtime_meta(session.get("runtime_meta"))
        if not runtime:
            raise ValueError("Quiz runtime not initialized")

        next_idx = runtime.current_question_index + 1
        if next_idx >= len(config.questions):
            raise ValueError("Already at last question")

        runtime.current_question_index = next_idx
        runtime.phase = "answering"
        self._session_repo.update_session(session_id, {
            "runtime_meta": runtime.model_dump(),
        })

        q = config.questions[next_idx]
        return {
            "question_index": next_idx,
            "total_questions": len(config.questions),
            "question": {
                "id": q.id,
                "type": q.type,
                "text": q.text,
                "options": q.options,
                "image_url": q.image_url,
                "points": q.points,
                "time_limit": config.time_limit,
            },
        }

    def quiz_finalize(self, room_id: str, session_id: str) -> Dict[str, Any]:
        """最终计分：从 runtime_meta 计算成绩并持久化到 response 表。幂等。"""
        from app.domains.classroom.slide_configs import QuizSlideConfig

        session = self._get_active_session(room_id, session_id)
        slide_id = session.get("current_slide_id")
        slide = self._slide_repo.get_by_slide_id(slide_id) if slide_id else None
        if not slide or slide["slide_type"] != "quiz":
            raise SlideNotFoundError(slide_id or "")

        handler = get_slide_handler("quiz")
        config = QuizSlideConfig(**slide["config"])

        # 幂等检查：已有 response 则直接返回已有结果
        existing = self._response_repo.list_by_slide(session_id, slide["slide_id"])
        if existing:
            return {
                "slide_id": slide["slide_id"],
                "slide_type": "quiz",
                "total_responses": len(existing),
                "results": handler.aggregate_results(existing),
            }

        runtime = handler.parse_runtime_meta(session.get("runtime_meta"))
        if not runtime:
            raise ValueError("Quiz runtime not initialized")

        final = handler.aggregate_final_results(config, runtime)

        # 持久化每位学生的成绩
        for entry in final["leaderboard"]:
            try:
                response_id = str(uuid.uuid4())
                self._response_repo.create_response({
                    "response_id": response_id,
                    "session_id": session_id,
                    "slide_id": slide["slide_id"],
                    "student_username": entry["username"],
                    "response_type": "quiz_answer",
                    "response_data": {
                        "answers": runtime.answers.get(entry["username"], {}),
                        "_result_extra": {
                            "correct_count": entry["correct_count"],
                            "total_questions": entry["total_questions"],
                        },
                    },
                    "is_correct": entry["correct_count"] == entry["total_questions"],
                    "score": float(entry["score"]),
                    "responded_at": datetime.now(),
                })
            except Exception:
                logger.warning("Failed to persist quiz response for %s", entry["username"])

        return {
            "slide_id": slide["slide_id"],
            "slide_type": "quiz",
            "total_responses": final["total_participants"],
            "results": final,
        }

    # ================================================================
    # Internal Helpers
    # ================================================================

    def _get_active_session(self, room_id: str, session_id: str) -> Dict[str, Any]:
        session = self._session_repo.get_by_session_id(session_id)
        if not session or session["room_id"] != room_id:
            raise SessionNotFoundError()
        if session["status"] not in ("live", "paused"):
            raise SessionNotFoundError()
        return session
