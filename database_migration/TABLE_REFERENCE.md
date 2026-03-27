# 数据库表结构参考（100 张表）

> 新部署时执行 `full_schema.sql` 一次性创建所有表。
> 此文档为每张表的用途说明。

---

## 1. 用户与认证（3 张）

| 表名 | 用途 |
|------|------|
| `users` | 用户主表（学生/教师/管理员），含用户名、密码哈希、角色、班级等 |
| `password_history` | 密码修改历史（防止重复使用旧密码） |
| `token_blacklist` | JWT Token 黑名单（登出/撤销后的 token） |

## 2. 安全与审计（3 张）

| 表名 | 用途 |
|------|------|
| `security_audit_log` | 安全审计日志（登录、权限变更、API Key 修改等） |
| `audit_logs` | 通用操作审计日志 |
| `data_access_logs` | 数据访问日志（敏感数据查看记录） |

## 3. 基础配置（4 张）

| 表名 | 用途 |
|------|------|
| `subjects` | 科目定义表（ICT、数学、英文等科目代码和名称） |
| `classes` | 班级定义表（班级代码、班级名称、年级） |
| `teacher_assignments` | 教师-班级-科目分配（哪位老师教哪个班的哪门课） |
| `sessions` | 用户会话记录 |

## 4. AI 对话（2 张）

| 表名 | 用途 |
|------|------|
| `conversations` | 对话会话记录（每个学生每个科目的对话） |
| `messages` | 对话消息（用户提问 + AI 回答 + 思考过程） |

## 5. AI 学习中心 — lc_*（8 张）

| 表名 | 用途 |
|------|------|
| `lc_categories` | 学习内容分类（支持层级、科目过滤） |
| `lc_contents` | 学习内容/资源（PDF/DOCX/视频/文章，含 AI 分析状态和 PDF 预览路径） |
| `lc_content_categories` | 内容-分类多对多关联 |
| `lc_knowledge_nodes` | 知识图谱节点（概念/主题，含位置、颜色、图标） |
| `lc_knowledge_edges` | 知识图谱边（节点间关系：包含/前置/关联） |
| `lc_node_contents` | 节点-内容关联（含页码锚点，支持点击跳转） |
| `lc_learning_paths` | 学习路径定义（标题、难度、预计时长） |
| `lc_path_steps` | 学习路径步骤（有序步骤，关联内容和知识节点） |

## 6. 学校学习中心 — slc_*（6 张）

| 表名 | 用途 |
|------|------|
| `slc_contents` | 学校学习中心内容（按科目/年级组织，独立于 AI 学习中心） |
| `slc_knowledge_nodes` | 学校知识图谱节点 |
| `slc_knowledge_edges` | 学校知识图谱边 |
| `slc_node_contents` | 学校节点-内容关联 |
| `slc_learning_paths` | 学校学习路径 |
| `slc_path_steps` | 学校学习路径步骤 |

## 7. 作业管理（11 张）

| 表名 | 用途 |
|------|------|
| `assignments` | 作业定义（标题、类型、截止日期、评分标准） |
| `assignment_submissions` | 学生提交记录（提交时间、状态、总分） |
| `submission_files` | 提交的文件附件 |
| `assignment_rubric_items` | 评分标准项（每项的名称、分值、权重） |
| `submission_rubric_scores` | 各评分项的实际得分（教师/AI 评分） |
| `assignment_attachments` | 作业附件（教师上传的参考资料） |
| `assignment_questions` | 作业题目（选择题/简答题/开放题） |
| `submission_answers` | 学生答案（对应每道题） |
| `submission_answer_files` | 答案附件文件 |
| `exam_upload_batches` | 试卷上传批次（OCR 批量处理） |
| `exam_upload_files` | 上传的试卷图片/PDF（含 OCR 状态和结果） |

## 8. 抄袭检测（2 张）

| 表名 | 用途 |
|------|------|
| `plagiarism_reports` | 抄袭检测报告（整体检测结果） |
| `plagiarism_pairs` | 抄袭配对（两份作业之间的相似度对比详情） |

## 9. 考勤系统（9 张）

| 表名 | 用途 |
|------|------|
| `attendance_sessions` | 考勤会话（早读/留堂点名的一次点名活动） |
| `attendance_records` | 考勤记录（每个学生的出勤状态） |
| `attendance_session_students` | 考勤会话-学生关联 |
| `attendance_fixed_lists` | 固定名单（如留堂名单） |
| `attendance_fixed_list_students` | 固定名单中的学生 |
| `attendance_exports` | 考勤数据导出记录 |
| `detention_history` | 留堂历史记录 |
| `activity_groups` | 活动小组定义（课外活动分组） |
| `activity_group_students` | 活动小组成员 |

## 10. 活动管理（2 张）

| 表名 | 用途 |
|------|------|
| `activity_sessions` | 活动会话（一次课外活动的签到） |
| `activity_records` | 活动签到记录 |

## 11. 课室日誌（6 张）

| 表名 | 用途 |
|------|------|
| `class_diary_entries` | 课室日志条目（每节课的评级记录） |
| `class_diary_reviewers` | 日志审核人 |
| `class_diary_audit_log` | 日志操作审计 |
| `class_diary_permissions` | 日志权限控制 |
| `class_diary_daily_reports` | 每日课室报告（自动生成） |
| `class_diary_range_reports` | 区间课室报告 |
| `class_diary_report_recipients` | 报告接收人 |

## 12. 课堂教学（8 张）

| 表名 | 用途 |
|------|------|
| `classroom_rooms` | 课室定义 |
| `classroom_enrollments` | 学生课室注册 |
| `classroom_pushes` | 课堂推送消息 |
| `ppt_files` | PPT 文件记录 |
| `ppt_pages` | PPT 每页内容（转换后的图片路径、文字） |
| `lesson_plans` | 课件/教案定义 |
| `lesson_slides` | 课件幻灯片（含互动类型：问答/投票/游戏等） |
| `lesson_sessions` | 授课会话（一次实际上课） |
| `lesson_slide_responses` | 学生对课件互动的响应 |

## 13. 错题本（7 张）

| 表名 | 用途 |
|------|------|
| `knowledge_points` | 知识点定义（按科目分类的知识点树） |
| `student_mistakes` | 学生错题记录（题目图片、AI 分析结果、科目） |
| `mistake_knowledge_links` | 错题-知识点关联（一道错题对应多个薄弱知识点） |
| `student_knowledge_mastery` | 学生知识点掌握度（每个知识点的正确率） |
| `practice_sessions` | 练习会话（AI 智能出题的练习记录） |
| `mistake_review_log` | 错题复习日志（学生复习行为追踪） |
| `mastery_snapshots` | 掌握度快照（定期记录掌握度变化趋势） |

## 14. 学习任务（3 张）

| 表名 | 用途 |
|------|------|
| `learning_tasks` | 学习任务定义（教师创建的任务） |
| `learning_task_items` | 任务子项（每个任务的具体步骤） |
| `learning_task_completions` | 学生完成记录 |

## 15. 学习分析（2 张）

| 表名 | 用途 |
|------|------|
| `student_analysis_reports` | 学生综合分析报告（AI 生成的学习评估） |
| `learning_analytics` | 学习行为分析数据 |

## 16. 教育游戏（5 张）

| 表名 | 用途 |
|------|------|
| `chem2048_scores` | 化学 2048 游戏分数 |
| `farm_game_scores` | 农场经营游戏分数 |
| `trade_game_scores` | 贸易模拟游戏分数 |
| `uploaded_games` | 教师上传的自定义 HTML 游戏 |
| `game_share_tokens` | 游戏分享 Token（生成分享链接） |

## 17. 讨论区 / 论坛（8 张）

| 表名 | 用途 |
|------|------|
| `forum_posts` | 论坛帖子（主题讨论） |
| `forum_replies` | 帖子回复 |
| `forum_votes` | 投票（赞/踩） |
| `forum_notifications` | 论坛通知 |
| `forum_attachments` | 帖子/回复附件 |
| `forum_tags` | 标签定义 |
| `forum_subscriptions` | 用户订阅（关注帖子/标签） |
| `forum_user_preferences` | 用户论坛偏好设置 |

## 18. 资源库（4 张）

| 表名 | 用途 |
|------|------|
| `resource_groups` | 资源组定义（教师创建的资源合集） |
| `resource_group_members` | 资源组成员（哪些学生可以访问） |
| `shared_resources` | 共享资源条目 |
| `shared_resource_slides` | 资源幻灯片内容 |

## 19. AI 出题（1 张）

| 表名 | 用途 |
|------|------|
| `exam_generation_sessions` | AI 出题会话（生成的试卷记录） |

## 20. 知识库 / 缓存（3 张）

| 表名 | 用途 |
|------|------|
| `knowledge_index` | 知识库索引（RAG 检索相关） |
| `query_cache` | 查询缓存（减少重复 AI 调用） |
| `deletion_requests` | 数据删除请求（GDPR 合规） |

---

## 快速统计

| 模块 | 表数 |
|------|------|
| 用户与认证 | 3 |
| 安全与审计 | 3 |
| 基础配置 | 4 |
| AI 对话 | 2 |
| AI 学习中心 | 8 |
| 学校学习中心 | 6 |
| 作业管理 | 11 |
| 抄袭检测 | 2 |
| 考勤系统 | 9 |
| 活动管理 | 2 |
| 课室日誌 | 6 |
| 课堂教学 | 9 |
| 错题本 | 7 |
| 学习任务 | 3 |
| 学习分析 | 2 |
| 教育游戏 | 5 |
| 论坛 | 8 |
| 资源库 | 4 |
| AI 出题 | 1 |
| 知识库/缓存 | 3 |
| **合计** | **100** |
