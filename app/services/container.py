"""
服务容器 - ServiceContainer
=============================
集中管理所有 Service 实例的创建和生命周期。

设计原则:
1. 单例模式 - 每个 Service 在整个应用生命周期中只创建一次
2. 延迟初始化 - Service 在首次访问时才创建
3. 依赖注入 - Service 间的依赖通过容器解决
4. 可测试性 - 支持注入 Mock 对象

用法:
    # 应用启动时初始化
    container = init_services(settings)

    # 在路由中使用
    services = get_services()
    user = services.user.get_user("admin")
    services.auth.login("user", "pass", "127.0.0.1")

    # 作为 FastAPI 依赖
    def get_user_service() -> UserService:
        return get_services().user
"""

import logging
from functools import lru_cache
from typing import Optional

from app.config.settings import Settings, get_settings
from app.core.security import JWTManager

# Repository imports
from app.domains.classroom.repository import (
    ClassroomEnrollmentRepository,
    ClassroomPushRepository,
    ClassroomRoomRepository,
    PPTFileRepository,
    PPTPageRepository,
)
from app.domains.analytics.repository import AnalyticsRepository
from app.domains.attendance.repository import (
    ActivityGroupRepository,
    ActivitySessionRepository,
    AttendanceExportRepository,
    AttendanceRecordRepository,
    AttendanceSessionRepository,
    AttendanceStudentRepository,
    DetentionHistoryRepository,
    FixedListRepository,
)
from app.domains.chat.repository import ConversationRepository, MessageRepository
from app.domains.learning_task.repository import (
    LearningTaskRepository,
    TaskCompletionRepository,
    TaskItemRepository,
)
from app.domains.subject.repository import SubjectRepository
from app.domains.user.repository import UserRepository
from app.domains.mistake_book.repository import (
    KnowledgePointRepository,
    MistakeKnowledgeLinkRepository,
    MistakeRepository,
    PracticeSessionRepository,
    ReviewLogRepository,
    StudentMasteryRepository,
)
from app.domains.assignment.repository import (
    AssignmentAttachmentRepository,
    AssignmentQuestionRepository,
    AssignmentRepository,
    ExamUploadBatchRepository,
    ExamUploadFileRepository,
    RubricItemRepository,
    RubricScoreRepository,
    SubmissionAnswerFileRepository,
    SubmissionAnswerRepository,
    SubmissionFileRepository,
    SubmissionRepository,
)
from app.domains.assignment.plagiarism_repository import (
    PlagiarismPairRepository,
    PlagiarismReportRepository,
)
from app.domains.classroom.lesson_repository import (
    LessonPlanRepository,
    LessonResponseRepository,
    LessonSessionRepository,
    LessonSlideRepository,
)
from app.domains.resource_library.repository import (
    ResourceGroupMemberRepository,
    ResourceGroupRepository,
    SharedResourceRepository,
    SharedResourceSlideRepository,
)
from app.domains.game_upload.repository import GameUploadRepository
from app.domains.trade_game.repository import TradeGameRepository
from app.domains.farm_game.repository import FarmGameRepository
from app.domains.chem2048.repository import Chem2048Repository
from app.domains.class_diary.repository import (
    ClassDiaryEntryRepository,
    ClassDiaryReviewerRepository,
)
from app.domains.ai_learning_center.repository import (
    LCCategoryRepository,
    LCContentRepository,
    LCContentCategoryRepository,
    LCKnowledgeNodeRepository,
    LCKnowledgeEdgeRepository,
    LCNodeContentRepository,
    LCLearningPathRepository,
    LCPathStepRepository,
)
from app.domains.school_learning_center.repository import (
    SLCContentRepository,
    SLCKnowledgeNodeRepository,
    SLCKnowledgeEdgeRepository,
    SLCNodeContentRepository,
    SLCLearningPathRepository,
    SLCPathStepRepository,
)

# Service imports
from app.domains.classroom.service import ClassroomService
from app.domains.classroom.lesson_service import LessonService
from app.domains.analytics.service import AnalyticsService
from app.domains.attendance.service import AttendanceService
from app.domains.auth.service import AuthService
from app.domains.chat.service import ChatService
from app.domains.learning_task.service import LearningTaskService
from app.domains.mistake_book.service import MistakeBookService
from app.domains.notice.service import NoticeService
from app.domains.subject.service import SubjectService
from app.domains.user.service import UserService
from app.domains.vision.service import VisionService
from app.domains.ai_learning_center.service import LearningCenterService
from app.domains.school_learning_center.service import SchoolLearningCenterService
from app.domains.game_upload.service import GameUploadService
from app.domains.trade_game.service import TradeGameService
from app.domains.farm_game.service import FarmGameService
from app.domains.chem2048.service import Chem2048Service
from app.domains.assignment.service import AssignmentService
from app.domains.assignment.plagiarism_service import PlagiarismService
from app.domains.class_diary.service import ClassDiaryService
from app.domains.image_gen.service import ImageGenService
from app.domains.resource_library.service import ResourceLibraryService
from app.domains.exam_creator.repository import ExamGenerationSessionRepository
from app.domains.exam_creator.service import ExamCreatorService

logger = logging.getLogger(__name__)


class ServiceContainer:
    """
    服务容器 - 管理所有 Service 的生命周期

    属性:
        auth: AuthService - 认证服务
        user: UserService - 用户管理
        chat: ChatService - AI 对话
        classroom: ClassroomService - 课堂教学
        attendance: AttendanceService - 考勤管理
        analytics: AnalyticsService - 学习分析
        subject: SubjectService - 学科管理
        notice: NoticeService - 通知生成
        learning_task: LearningTaskService - 学习任务
    """

    def __init__(
        self,
        settings: Optional[Settings] = None,
        jwt_manager: Optional[JWTManager] = None,
    ):
        self._settings = settings or get_settings()
        self._jwt_manager = jwt_manager

        # Repository 实例（延迟创建）
        self._repos = {}

        # Service 实例（延迟创建）
        self._auth: Optional[AuthService] = None
        self._user: Optional[UserService] = None
        self._chat: Optional[ChatService] = None
        self._classroom: Optional[ClassroomService] = None
        self._attendance: Optional[AttendanceService] = None
        self._analytics: Optional[AnalyticsService] = None
        self._subject: Optional[SubjectService] = None
        self._notice: Optional[NoticeService] = None
        self._learning_task: Optional[LearningTaskService] = None
        self._mistake_book: Optional[MistakeBookService] = None
        self._vision: Optional[VisionService] = None
        self._learning_center: Optional[LearningCenterService] = None
        self._school_learning_center: Optional[SchoolLearningCenterService] = None
        self._game_upload: Optional[GameUploadService] = None
        self._trade_game: Optional[TradeGameService] = None
        self._farm_game: Optional[FarmGameService] = None
        self._chem2048: Optional[Chem2048Service] = None
        self._assignment: Optional[AssignmentService] = None
        self._plagiarism: Optional[PlagiarismService] = None
        self._class_diary: Optional[ClassDiaryService] = None
        self._image_gen: Optional[ImageGenService] = None
        self._lesson: Optional[LessonService] = None
        self._resource_library: Optional[ResourceLibraryService] = None
        self._exam_creator: Optional[ExamCreatorService] = None

    # ================================================================== #
    #  Service 属性（延迟初始化）                                           #
    # ================================================================== #

    @property
    def auth(self) -> AuthService:
        """认证服务"""
        if self._auth is None:
            self._auth = AuthService(
                user_repo=self._get_repo(UserRepository),
                jwt_manager=self._jwt_manager,
                settings=self._settings,
            )
        return self._auth

    @property
    def user(self) -> UserService:
        """用户管理服务"""
        if self._user is None:
            self._user = UserService(
                user_repo=self._get_repo(UserRepository),
                settings=self._settings,
            )
        return self._user

    @property
    def chat(self) -> ChatService:
        """AI 对话服务"""
        if self._chat is None:
            self._chat = ChatService(
                conversation_repo=self._get_repo(ConversationRepository),
                message_repo=self._get_repo(MessageRepository),
                settings=self._settings,
            )
        return self._chat

    @property
    def classroom(self) -> ClassroomService:
        """课堂教学服务"""
        if self._classroom is None:
            self._classroom = ClassroomService(
                room_repo=self._get_repo(ClassroomRoomRepository),
                enrollment_repo=self._get_repo(ClassroomEnrollmentRepository),
                ppt_repo=self._get_repo(PPTFileRepository),
                page_repo=self._get_repo(PPTPageRepository),
                push_repo=self._get_repo(ClassroomPushRepository),
                user_repo=self._get_repo(UserRepository),
                settings=self._settings,
            )
        return self._classroom

    @property
    def lesson(self) -> LessonService:
        """课案计划服务"""
        if self._lesson is None:
            self._lesson = LessonService(
                plan_repo=self._get_repo(LessonPlanRepository),
                slide_repo=self._get_repo(LessonSlideRepository),
                session_repo=self._get_repo(LessonSessionRepository),
                response_repo=self._get_repo(LessonResponseRepository),
            )
        return self._lesson

    @property
    def resource_library(self) -> ResourceLibraryService:
        """共享资源库服务"""
        if self._resource_library is None:
            self._resource_library = ResourceLibraryService(
                group_repo=self._get_repo(ResourceGroupRepository),
                member_repo=self._get_repo(ResourceGroupMemberRepository),
                share_repo=self._get_repo(SharedResourceRepository),
                share_slide_repo=self._get_repo(SharedResourceSlideRepository),
                plan_repo=self._get_repo(LessonPlanRepository),
                slide_repo=self._get_repo(LessonSlideRepository),
                room_repo=self._get_repo(ClassroomRoomRepository),
            )
        return self._resource_library

    @property
    def attendance(self) -> AttendanceService:
        """考勤管理服务"""
        if self._attendance is None:
            self._attendance = AttendanceService(
                student_repo=self._get_repo(AttendanceStudentRepository),
                session_repo=self._get_repo(AttendanceSessionRepository),
                record_repo=self._get_repo(AttendanceRecordRepository),
                detention_repo=self._get_repo(DetentionHistoryRepository),
                fixed_list_repo=self._get_repo(FixedListRepository),
                activity_group_repo=self._get_repo(ActivityGroupRepository),
                activity_session_repo=self._get_repo(ActivitySessionRepository),
                export_repo=self._get_repo(AttendanceExportRepository),
                settings=self._settings,
            )
        return self._attendance

    @property
    def analytics(self) -> AnalyticsService:
        """学习分析服务"""
        if self._analytics is None:
            self._analytics = AnalyticsService(
                analytics_repo=self._get_repo(AnalyticsRepository),
                user_repo=self._get_repo(UserRepository),
                conv_repo=self._get_repo(ConversationRepository),
                msg_repo=self._get_repo(MessageRepository),
                settings=self._settings,
            )
        return self._analytics

    @property
    def subject(self) -> SubjectService:
        """学科管理服务"""
        if self._subject is None:
            self._subject = SubjectService(
                subject_repo=self._get_repo(SubjectRepository),
                settings=self._settings,
            )
        return self._subject

    @property
    def notice(self) -> NoticeService:
        """通知生成服务"""
        if self._notice is None:
            self._notice = NoticeService(settings=self._settings)
        return self._notice

    @property
    def learning_task(self) -> LearningTaskService:
        """学习任务服务"""
        if self._learning_task is None:
            self._learning_task = LearningTaskService(
                task_repo=self._get_repo(LearningTaskRepository),
                item_repo=self._get_repo(TaskItemRepository),
                completion_repo=self._get_repo(TaskCompletionRepository),
                user_repo=self._get_repo(UserRepository),
                settings=self._settings,
            )
        return self._learning_task

    @property
    def mistake_book(self) -> MistakeBookService:
        """錯題本服務"""
        if self._mistake_book is None:
            self._mistake_book = MistakeBookService(
                mistake_repo=self._get_repo(MistakeRepository),
                knowledge_repo=self._get_repo(KnowledgePointRepository),
                link_repo=self._get_repo(MistakeKnowledgeLinkRepository),
                mastery_repo=self._get_repo(StudentMasteryRepository),
                practice_repo=self._get_repo(PracticeSessionRepository),
                review_repo=self._get_repo(ReviewLogRepository),
                settings=self._settings,
            )
        return self._mistake_book

    @property
    def learning_center(self) -> LearningCenterService:
        """AI 學習中心服務"""
        if self._learning_center is None:
            self._learning_center = LearningCenterService(
                category_repo=self._get_repo(LCCategoryRepository),
                content_repo=self._get_repo(LCContentRepository),
                content_category_repo=self._get_repo(LCContentCategoryRepository),
                node_repo=self._get_repo(LCKnowledgeNodeRepository),
                edge_repo=self._get_repo(LCKnowledgeEdgeRepository),
                node_content_repo=self._get_repo(LCNodeContentRepository),
                path_repo=self._get_repo(LCLearningPathRepository),
                step_repo=self._get_repo(LCPathStepRepository),
                settings=self._settings,
            )
        return self._learning_center

    @property
    def school_learning_center(self) -> SchoolLearningCenterService:
        """学校学习中心服务（独立于 AI 学习中心）"""
        if self._school_learning_center is None:
            self._school_learning_center = SchoolLearningCenterService(
                content_repo=self._get_repo(SLCContentRepository),
                node_repo=self._get_repo(SLCKnowledgeNodeRepository),
                edge_repo=self._get_repo(SLCKnowledgeEdgeRepository),
                node_content_repo=self._get_repo(SLCNodeContentRepository),
                path_repo=self._get_repo(SLCLearningPathRepository),
                step_repo=self._get_repo(SLCPathStepRepository),
                settings=self._settings,
            )
        return self._school_learning_center

    @property
    def game_upload(self) -> GameUploadService:
        """游戏上传服务"""
        if self._game_upload is None:
            self._game_upload = GameUploadService(
                game_repo=self._get_repo(GameUploadRepository),
            )
        return self._game_upload

    @property
    def trade_game(self) -> TradeGameService:
        """全球貿易大亨遊戲服務"""
        if self._trade_game is None:
            self._trade_game = TradeGameService(
                score_repo=self._get_repo(TradeGameRepository),
            )
        return self._trade_game

    @property
    def farm_game(self) -> FarmGameService:
        """神州菜園經營家遊戲服務"""
        if self._farm_game is None:
            self._farm_game = FarmGameService(
                score_repo=self._get_repo(FarmGameRepository),
            )
        return self._farm_game

    @property
    def chem2048(self) -> Chem2048Service:
        """化學 2048 遊戲服務"""
        if self._chem2048 is None:
            self._chem2048 = Chem2048Service(
                score_repo=self._get_repo(Chem2048Repository),
            )
        return self._chem2048

    @property
    def assignment(self) -> AssignmentService:
        """作業管理服務"""
        if self._assignment is None:
            self._assignment = AssignmentService(
                assignment_repo=self._get_repo(AssignmentRepository),
                submission_repo=self._get_repo(SubmissionRepository),
                file_repo=self._get_repo(SubmissionFileRepository),
                rubric_repo=self._get_repo(RubricItemRepository),
                score_repo=self._get_repo(RubricScoreRepository),
                user_repo=self._get_repo(UserRepository),
                attachment_repo=self._get_repo(AssignmentAttachmentRepository),
                conversation_repo=self._get_repo(ConversationRepository),
                settings=self._settings,
                question_repo=self._get_repo(AssignmentQuestionRepository),
                batch_repo=self._get_repo(ExamUploadBatchRepository),
                upload_file_repo=self._get_repo(ExamUploadFileRepository),
                answer_repo=self._get_repo(SubmissionAnswerRepository),
                answer_file_repo=self._get_repo(SubmissionAnswerFileRepository),
            )
        return self._assignment

    @property
    def plagiarism(self) -> PlagiarismService:
        """抄袭检测服务"""
        if self._plagiarism is None:
            self._plagiarism = PlagiarismService(
                report_repo=self._get_repo(PlagiarismReportRepository),
                pair_repo=self._get_repo(PlagiarismPairRepository),
                assignment_repo=self._get_repo(AssignmentRepository),
                submission_repo=self._get_repo(SubmissionRepository),
                file_repo=self._get_repo(SubmissionFileRepository),
                settings=self._settings,
            )
        return self._plagiarism

    @property
    def class_diary(self) -> ClassDiaryService:
        """課室日誌服務"""
        if self._class_diary is None:
            self._class_diary = ClassDiaryService(
                entry_repo=self._get_repo(ClassDiaryEntryRepository),
                reviewer_repo=self._get_repo(ClassDiaryReviewerRepository),
                user_repo=self._get_repo(UserRepository),
            )
        return self._class_diary

    @property
    def image_gen(self) -> ImageGenService:
        """AI 圖片生成服務"""
        if self._image_gen is None:
            self._image_gen = ImageGenService(settings=self._settings)
        return self._image_gen

    @property
    def exam_creator(self) -> ExamCreatorService:
        """AI 考卷出題服務"""
        if self._exam_creator is None:
            self._exam_creator = ExamCreatorService(
                session_repo=self._get_repo(ExamGenerationSessionRepository),
                knowledge_repo=self._get_repo(KnowledgePointRepository),
            )
        return self._exam_creator

    @property
    def vision(self) -> VisionService:
        """視覺識別服務"""
        if self._vision is None:
            self._vision = VisionService()
        return self._vision

    # ================================================================== #
    #  外部依赖注入                                                        #
    # ================================================================== #

    def inject_ai_functions(
        self,
        ask_ai=None,
        ask_ai_stream=None,
        vector_search=None,
        file_processor=None,
        add_to_vector_store=None,
        get_vector_docs=None,
        search_templates=None,
        build_document=None,
    ):
        """
        注入外部 AI / 文件处理依赖

        在应用启动时调用:
            services = get_services()
            services.inject_ai_functions(
                ask_ai=rag_chain.ask_ai_subject,
                ask_ai_stream=rag_chain.ask_ai_subject_stream,
                ...
            )
        """
        # ChatService
        if ask_ai or ask_ai_stream or vector_search:
            self.chat.set_ai_functions(
                ask_ai=ask_ai,
                ask_ai_stream=ask_ai_stream,
                vector_search=vector_search,
            )

        # AnalyticsService
        if ask_ai:
            self.analytics.set_ai_function(ask_ai)

        # SubjectService
        if file_processor or add_to_vector_store or vector_search or get_vector_docs:
            self.subject.set_external_functions(
                file_processor=file_processor,
                add_to_vector_store=add_to_vector_store,
                search_vector_store=vector_search,
                get_vector_docs=get_vector_docs,
            )

        # NoticeService
        if ask_ai or search_templates or build_document:
            self.notice.set_external_functions(
                ask_ai=ask_ai,
                search_templates=search_templates,
                build_document=build_document,
            )

        # MistakeBookService
        if ask_ai:
            self.mistake_book.set_ai_function(ask_ai)
            self.mistake_book.set_vision_service(self.vision)

        # LearningCenterService
        if ask_ai:
            self.learning_center.set_ai_function(ask_ai)

        # AssignmentService
        if ask_ai:
            self.assignment.set_ai_function(ask_ai)

        # PlagiarismService
        if ask_ai:
            self.plagiarism.set_ai_function(ask_ai)

        logger.info("外部依赖注入完成")

    # ================================================================== #
    #  内部方法                                                            #
    # ================================================================== #

    def _get_repo(self, repo_class):
        """获取或创建 Repository 实例（单例）"""
        key = repo_class.__name__
        if key not in self._repos:
            self._repos[key] = repo_class()
        return self._repos[key]


# ====================================================================== #
#  全局容器管理                                                            #
# ====================================================================== #

_container: Optional[ServiceContainer] = None


def init_services(
    settings: Optional[Settings] = None,
    jwt_manager: Optional[JWTManager] = None,
) -> ServiceContainer:
    """
    初始化全局服务容器

    在应用启动时调用一次:
        container = init_services(settings, jwt_manager)
    """
    global _container
    _container = ServiceContainer(settings=settings, jwt_manager=jwt_manager)
    logger.info("ServiceContainer 已初始化")
    return _container


def get_services() -> ServiceContainer:
    """
    获取全局服务容器实例

    用法:
        services = get_services()
        services.auth.login(...)
        services.user.create_user(...)
    """
    global _container
    if _container is None:
        # 自动初始化（开发环境友好）
        _container = ServiceContainer()
        logger.warning("ServiceContainer 自动初始化（建议在启动时显式调用 init_services）")
    return _container
