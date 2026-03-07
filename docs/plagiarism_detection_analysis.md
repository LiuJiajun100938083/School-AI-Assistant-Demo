# 抄袭检测功能 - 可行性分析报告

## 1. 结论：完全可行

基于现有代码架构分析，在批改作业模块中加入抄袭对比功能**完全可行**，且与现有系统的集成成本较低。

---

## 2. 现有系统基础

### 2.1 已有的有利条件

| 条件 | 说明 |
|------|------|
| 文件提取能力 | `AssignmentService._extract_file_contents()` 已能提取代码文件（`.py`, `.swift`, `.js` 等）和文档文件（`.pdf`, `.docx`）的文本内容 |
| 提交数据结构 | `assignment_submissions` 表按 `assignment_id` 关联所有学生提交，可轻松获取同一作业的全部提交 |
| 文件存储 | 提交文件存储在 `uploads/assignments/` 目录，通过 `submission_files` 表关联，可直接读取 |
| AI 能力 | 已有 `_ask_ai_func` 集成本地 Ollama 模型，可用于语义级别的抄袭分析 |
| DDD 架构 | Repository → Service → Router 分层清晰，新增功能可自然融入现有结构 |

### 2.2 现有数据流

```
学生提交 → submission_files 表 → 文件存储在磁盘
                                    ↓
                            _extract_file_contents() 可提取文本
                                    ↓
                            已用于 AI 批改 (ai_grade_submission)
```

抄袭检测只需复用这条数据流，将**单份提交的文本提取**扩展为**多份提交之间的文本对比**。

---

## 3. 技术方案

### 3.1 检测算法（三层递进）

#### 第一层：文本精确匹配（最快，基础）
- **方法**: 将每份提交的文本按 N-gram（如 5-gram）分片，计算公共片段比例
- **适用**: 直接复制粘贴的情况
- **复杂度**: O(n²) 对比，n = 提交数量
- **依赖**: 纯 Python，无需额外依赖

#### 第二层：结构相似度（中等速度，代码专用）
- **方法**: 对代码文件进行 AST（抽象语法树）分析，对比代码结构
- **适用**: 变量重命名、代码重排序等伪装手段
- **工具**: Python `ast` 模块（Python 代码）、`tree-sitter`（多语言）
- **依赖**: `tree-sitter` 及对应语言语法包（可选）

#### 第三层：AI 语义分析（最深，最慢）
- **方法**: 利用现有 Ollama 模型，对比两份提交的逻辑思路是否高度相似
- **适用**: 高级伪装（改写句子、重构逻辑但思路相同）
- **依赖**: 现有 AI 基础设施，无需额外安装

### 3.2 推荐实现策略

对于学校场景，推荐 **第一层 + 第三层** 组合：
- N-gram 文本相似度作为**快速筛选**
- AI 对可疑对进行**深度分析**确认

---

## 4. 实现设计

### 4.1 新增数据库表

```sql
CREATE TABLE IF NOT EXISTS plagiarism_reports (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    assignment_id   INT NOT NULL                    COMMENT '作业ID',
    status          ENUM('pending','running','completed','failed') DEFAULT 'pending',
    total_pairs     INT DEFAULT 0                   COMMENT '对比总对数',
    flagged_pairs   INT DEFAULT 0                   COMMENT '标记可疑对数',
    created_by      INT                             COMMENT '发起教师ID',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at    DATETIME,
    INDEX idx_assignment (assignment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plagiarism_pairs (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    report_id       INT NOT NULL                    COMMENT '报告ID',
    submission_a_id INT NOT NULL                    COMMENT '提交A',
    submission_b_id INT NOT NULL                    COMMENT '提交B',
    similarity_score DECIMAL(5,2) NOT NULL          COMMENT '相似度 0-100',
    matched_fragments JSON                          COMMENT '匹配片段详情',
    ai_analysis     TEXT                            COMMENT 'AI分析说明',
    is_flagged      BOOLEAN DEFAULT FALSE           COMMENT '是否标记为可疑',
    INDEX idx_report (report_id),
    INDEX idx_flagged (report_id, is_flagged)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 4.2 后端新增文件

```
app/domains/assignment/
├── plagiarism_service.py   # 抄袭检测服务（新增）
└── (现有文件不变)

app/routers/assignment.py   # 新增 3 个端点
```

### 4.3 核心服务设计

```python
class PlagiarismService:
    """抄袭检测服务"""

    def start_check(self, assignment_id: int, teacher_id: int) -> dict:
        """启动抄袭检测（背景任务）"""
        # 1. 获取该作业所有提交
        # 2. 提取每份提交的文本内容（复用 _extract_file_contents）
        # 3. 两两对比计算相似度
        # 4. 对高相似度的对调用 AI 深度分析
        # 5. 写入 plagiarism_reports + plagiarism_pairs

    def _compute_similarity(self, text_a: str, text_b: str) -> float:
        """N-gram 文本相似度计算"""
        # Jaccard 相似系数 of N-grams

    def _ai_analyze_pair(self, text_a: str, text_b: str, similarity: float) -> str:
        """AI 深度分析两份可疑提交"""
        # 调用 Ollama 分析是否真的存在抄袭

    def get_report(self, report_id: int) -> dict:
        """获取检测报告"""

    def get_flagged_pairs(self, report_id: int) -> list:
        """获取可疑抄袭对"""
```

### 4.4 API 端点

```
POST   /api/assignments/teacher/{assignment_id}/plagiarism-check     启动检测
GET    /api/assignments/teacher/{assignment_id}/plagiarism-report     获取报告
GET    /api/assignments/teacher/{assignment_id}/plagiarism-pairs      获取可疑对详情
```

### 4.5 前端展示

在教师批改页面新增「抄袭检测」按钮：
- 点击后启动检测（背景任务，类似现有的批量 AI 批改）
- 检测完成后显示报告：
  - 热力图/矩阵展示所有学生间的相似度
  - 可疑对列表（相似度 > 阈值）
  - 点击可疑对 → 并排展示两份提交，高亮匹配片段

---

## 5. 与现有系统的集成点

| 集成点 | 说明 |
|--------|------|
| `_extract_file_contents()` | 直接复用，提取每份提交的文本 |
| `_ask_ai_func` | 直接复用，用于 AI 深度分析 |
| `_batch_jobs` 模式 | 参考批量 AI 批改的背景任务模式 |
| `SubmissionRepository` | 复用 `find_by_assignment()` 获取所有提交 |
| `SubmissionFileRepository` | 复用 `find_by_submission()` 获取文件 |
| `ServiceContainer` | 注册新的 `PlagiarismService` |

---

## 6. 性能考量

| 场景 | 对比数 | 预估时间 |
|------|--------|----------|
| 30 人班级 | C(30,2) = 435 对 | 文本对比 < 10 秒，AI 分析可疑对 1-2 分钟 |
| 50 人班级 | C(50,2) = 1225 对 | 文本对比 < 30 秒，AI 分析可疑对 2-5 分钟 |
| 100 人年级 | C(100,2) = 4950 对 | 文本对比 < 2 分钟，AI 分析可疑对 5-10 分钟 |

**优化策略**:
- 文本对比先用 MinHash/LSH 快速预筛选，再对候选对精确计算
- AI 分析只对相似度 > 60% 的对执行，大幅减少 AI 调用次数
- 背景线程执行，不阻塞教师操作

---

## 7. 额外依赖

| 依赖 | 用途 | 是否必需 |
|------|------|----------|
| `difflib` (内置) | 序列匹配、diff 生成 | 是（Python 内置） |
| `datasketch` | MinHash/LSH 加速大规模对比 | 否（优化用，可后续添加） |
| `tree-sitter` | 代码 AST 结构对比 | 否（第二层，可选） |
| 无新增 AI 依赖 | 复用现有 Ollama | - |

---

## 8. 实施计划

| 阶段 | 内容 | 预估工作量 |
|------|------|-----------|
| Phase 1 | 数据库表 + Repository + 基础 N-gram 对比 | 1 天 |
| Phase 2 | AI 深度分析 + 背景任务 + API 端点 | 1-2 天 |
| Phase 3 | 前端展示（报告页 + 并排对比 + 高亮） | 1-2 天 |
| Phase 4 | 性能优化（MinHash）+ 代码 AST 对比（可选） | 1 天 |

**总计: 4-6 天**

---

## 9. 风险与注意事项

1. **隐私保护**: 检测结果仅教师可见，学生间不可相互查看
2. **误判处理**: 相似度阈值应可配置（默认 70%），并提供 AI 分析辅助判断
3. **合法引用**: 作业描述/题目本身可能导致部分文本相同，应支持排除公共模板文本
4. **文件类型限制**: 图片/视频类提交无法进行文本对比，需在界面提示
5. **大文件性能**: 每个文件已有 10000 字符截断限制（`_extract_file_contents`），可复用
