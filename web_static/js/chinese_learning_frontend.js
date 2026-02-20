// learning_modes_frontend.js - 学习模式前端模块（整合版）
/**
 * AI学习伙伴 - 学习模式管理
 *
 * 包含:
 * 1. AI 問答
 * 2. 英文寫作（三阶段）
 * 3. 中文訓練（15个游戏）
 */

class LearningModeManager {
    constructor() {
        this.currentMode = 'qa';
        this.modes = [];
        this.token = localStorage.getItem('auth_token');
        this.initialized = false;

        // 英文写作会话状态
        this.writingSession = {
            taskId: null,
            task: null,
            level: null,
            studentText: '',
            phase: 'start'
        };

        // 中文训练会话状态
        this.chineseSession = {
            gameId: null,
            game: null,
            task: null,
            level: null,
            studentText: '',
            phase: 'select', // select, task, writing, scaffold, feedback
            taskMaterials: {}
        };

        // 中文游戏数据
        this.chineseGames = [];
        this.chineseCategories = [];
    }

    async init() {
        if (this.initialized) return;

        try {
            await this.fetchModes();
            await this.fetchChineseGames();
            this.renderModeSelector();
            this.bindEvents();
            this.initialized = true;
            console.log('✅ LearningModeManager initialized with Chinese Training');
        } catch (error) {
            console.error('Failed to initialize:', error);
        }
    }

    async fetchModes() {
        // 默认模式（确保总是有内容显示）
        const defaultModes = [
            { mode_id: 'qa', name: 'AI 問答', icon: '💬', enabled: true, order: 1 },
            { mode_id: 'english_writing', name: '英文寫作', icon: '✏️', enabled: true, order: 2 },
            { mode_id: 'chinese_training', name: '中文訓練', icon: '📚', enabled: true, order: 3 }
        ];

        try {
            const response = await fetch('/api/learning/modes', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (response.ok) {
                const data = await response.json();
                // 确保返回的是数组且有内容
                if (Array.isArray(data) && data.length > 0) {
                    // 确保每个mode都有enabled字段
                    this.modes = data.map(m => ({
                        ...m,
                        enabled: m.enabled !== false  // 默认启用
                    }));
                } else {
                    console.warn('API returned empty modes, using defaults');
                    this.modes = defaultModes;
                }
            } else {
                console.warn('API request failed, using defaults');
                this.modes = defaultModes;
            }
        } catch (error) {
            console.error('Error fetching modes:', error);
            this.modes = defaultModes;
        }

        console.log('📚 Loaded modes:', this.modes);
    }

    async fetchChineseGames() {
        try {
            const [gamesRes, catsRes] = await Promise.all([
                fetch('/api/learning/chinese/games', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                }),
                fetch('/api/learning/chinese/categories', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                })
            ]);

            if (gamesRes.ok) {
                const data = await gamesRes.json();
                this.chineseGames = data.games || [];
            }
            if (catsRes.ok) {
                const data = await catsRes.json();
                this.chineseCategories = data.categories || [];
            }
        } catch (error) {
            console.error('Error fetching Chinese games:', error);
            // 使用默认数据
            this.chineseGames = this.getDefaultChineseGames();
            this.chineseCategories = this.getDefaultCategories();
        }
    }

    getDefaultChineseGames() {
        return [
            { game_id: "MEANING_BUILDER", name_zh: "意思重建器", name_en: "Meaning Builder", category: "理解", target_skill: "理解", icon: "🔄", description_zh: "用自己的话重述段落的主要意思" },
            { game_id: "WHATS_MISSING", name_zh: "关键信息消失挑战", name_en: "What's Missing", category: "理解", target_skill: "理解", icon: "🔍", description_zh: "找出摘要中遗漏的关键信息" },
            { game_id: "ONE_SENTENCE_CAPTURE", name_zh: "一句话抓重点", name_en: "One Sentence Capture", category: "理解", target_skill: "理解", icon: "🎯", description_zh: "用一句话概括段落核心要点" },
            { game_id: "CLARITY_REPAIR", name_zh: "模糊句修复", name_en: "Clarity Repair", category: "表达", target_skill: "表达", icon: "🔧", description_zh: "修改模糊句子使其更清晰" },
            { game_id: "ONE_LINE_OPINION", name_zh: "一句话立场", name_en: "One Line Opinion", category: "表达", target_skill: "表达", icon: "💬", description_zh: "用一句话表达清晰立场和理由" },
            { game_id: "SAY_MORE_WITH_LESS", name_zh: "删词挑战", name_en: "Say More With Less", category: "表达", target_skill: "表达", icon: "✂️", description_zh: "删除冗余词句，保持原意" },
            { game_id: "LOGIC_SEQUENCER", name_zh: "句子排序师", name_en: "Logic Sequencer", category: "结构", target_skill: "结构", icon: "🔢", description_zh: "将打乱的句子排成连贯段落" },
            { game_id: "PARAGRAPH_ROLE", name_zh: "段落功能判断", name_en: "Paragraph Role", category: "结构", target_skill: "结构", icon: "📊", description_zh: "判断段落的主要功能" },
            { game_id: "OUTLINE_FIRST", name_zh: "作文骨架搭建", name_en: "Outline First", category: "结构", target_skill: "结构", icon: "🏗️", description_zh: "为作文题目搭建大纲框架" },
            { game_id: "PERSPECTIVE_SWITCH", name_zh: "换位思考机", name_en: "Perspective Switch", category: "思维", target_skill: "思维", icon: "🔀", description_zh: "从另一角度重新描述事件" },
            { game_id: "CHOOSE_AND_DEFEND", name_zh: "观点对决", name_en: "Choose and Defend", category: "思维", target_skill: "思维", icon: "⚔️", description_zh: "选择观点并用理由辩护" },
            { game_id: "WHAT_IF", name_zh: "如果……会怎样", name_en: "What If", category: "思维", target_skill: "思维", icon: "🤔", description_zh: "预测条件改变后的结果" },
            { game_id: "DIFFICULTY_SPOT", name_zh: "难点定位", name_en: "Difficulty Spot", category: "元认知", target_skill: "元认知", icon: "🎯", description_zh: "反思哪个部分最难及原因" },
            { game_id: "CONFIDENCE_TAG", name_zh: "信心标注", name_en: "Confidence Tag", category: "元认知", target_skill: "元认知", icon: "📊", description_zh: "训练信心校准能力" },
            { game_id: "NEXT_TIME_PLAN", name_zh: "我会怎么改", name_en: "Next Time Plan", category: "元认知", target_skill: "元认知", icon: "📝", description_zh: "计划下次的改进步骤" },
        ];
    }

    getDefaultCategories() {
        return [
            { id: "理解", name_zh: "理解类", name_en: "Comprehension", icon: "📖" },
            { id: "表达", name_zh: "表达类", name_en: "Expression", icon: "💬" },
            { id: "结构", name_zh: "结构类", name_en: "Structure", icon: "🏗️" },
            { id: "思维", name_zh: "思维类", name_en: "Thinking", icon: "🧠" },
            { id: "元认知", name_zh: "元认知类", name_en: "Metacognition", icon: "🔍" },
        ];
    }

    renderModeSelector() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) {
            console.warn('Sidebar not found');
            return;
        }

        let modeSelector = document.getElementById('learningModeSelector');
        if (modeSelector) modeSelector.remove();

        // 确保有模式可显示
        const modesToShow = this.modes.filter(m => m.enabled !== false);
        console.log('📚 Rendering modes:', modesToShow);

        if (modesToShow.length === 0) {
            console.warn('No modes to display');
            return;
        }

        modeSelector = document.createElement('div');
        modeSelector.id = 'learningModeSelector';
        modeSelector.className = 'learning-mode-selector';
        modeSelector.innerHTML = `
            <div class="mode-selector-header"><h4>📚 學習模式</h4></div>
            <div class="modes-container">
                ${modesToShow.map(mode => `
                    <button class="mode-btn ${mode.mode_id === this.currentMode ? 'active' : ''}" 
                            data-mode-id="${mode.mode_id}" title="${mode.description || ''}">
                        <span class="mode-icon">${mode.icon}</span>
                        <span class="mode-name">${mode.name}</span>
                    </button>
                `).join('')}
            </div>
        `;

        const sidebarHeader = sidebar.querySelector('.sidebar-header');
        if (sidebarHeader) {
            sidebarHeader.after(modeSelector);
        } else {
            sidebar.insertBefore(modeSelector, sidebar.firstChild);
        }

        // 绑定模式切换事件
        modeSelector.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchMode(btn.dataset.modeId));
        });
    }

    switchMode(modeId) {
        if (this.currentMode === modeId) return;

        this.currentMode = modeId;
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.modeId === modeId);
        });

        this.updateMainInterface(modeId);
        console.log(`Switched to mode: ${modeId}`);
    }

    updateMainInterface(modeId) {
        const messagesContainer = document.getElementById('messagesContainer');
        const inputContainer = document.getElementById('inputContainer');

        if (modeId === 'english_writing') {
            if (inputContainer) inputContainer.style.display = 'none';
            this.showWritingInterface();
        } else if (modeId === 'chinese_training') {
            if (inputContainer) inputContainer.style.display = 'none';
            this.showChineseInterface();
        } else {
            if (inputContainer) inputContainer.style.display = '';
            this.showQAInterface();
        }
    }

    showQAInterface() {
        const messagesContainer = document.getElementById('messagesContainer');
        const headerTitle = document.getElementById('headerTitle');

        if (headerTitle) headerTitle.innerHTML = '💬 AI 學習伙伴';

        if (messagesContainer && !messagesContainer.querySelector('.message-bubble')) {
            messagesContainer.innerHTML = `
                <div class="welcome-message">
                    <div class="welcome-title">歡迎使用 AI 學習伙伴！</div>
                    <div class="welcome-subtitle">選擇科目並開始提問吧</div>
                </div>
            `;
        }
    }

    // ==================== 英文写作界面（整合三阶段）====================

    showWritingInterface() {
        const messagesContainer = document.getElementById('messagesContainer');
        const headerTitle = document.getElementById('headerTitle');

        if (headerTitle) headerTitle.innerHTML = '✏️ 英文寫作';

        if (!messagesContainer) return;

        // 重置会话
        this.writingSession = { taskId: null, task: null, level: null, studentText: '', phase: 'start' };

        messagesContainer.innerHTML = `
            <div class="writing-studio">
                <!-- 顶部说明 -->
                <div class="studio-header">
                    <h2>✏️ 英文寫作學習 English Writing Studio</h2>
                    <p>完整的寫作學習流程：獲取題目 → 寫作引導 → 反饋評語</p>
                </div>
                
                <!-- 阶段1: 获取任务 -->
                <div id="phase1" class="phase-section phase-active">
                    <div class="phase-header">
                        <span class="phase-number">1</span>
                        <span class="phase-title">📝 獲取寫作任務 Get Your Task</span>
                    </div>
                    <div class="phase-content">
                        <div class="task-controls">
                            <div class="control-row">
                                <div class="control-group">
                                    <label>年級 Level</label>
                                    <select id="writingLevel" class="writing-select">
                                        <option value="">-- 請選擇 --</option>
                                        <option value="S1">S1 中一</option>
                                        <option value="S2">S2 中二</option>
                                        <option value="S3">S3 中三</option>
                                        <option value="S4">S4 中四</option>
                                        <option value="S5">S5 中五</option>
                                        <option value="S6">S6 中六</option>
                                    </select>
                                </div>
                                <div class="control-group">
                                    <label>類型 Type (可選)</label>
                                    <select id="writingType" class="writing-select">
                                        <option value="">隨機 Random</option>
                                        <option value="descriptive">描述性 Descriptive</option>
                                        <option value="narrative">敘事性 Narrative</option>
                                        <option value="expository">說明性 Expository</option>
                                        <option value="argumentative">議論性 Argumentative</option>
                                        <option value="reflective">反思性 Reflective</option>
                                    </select>
                                </div>
                            </div>
                            <button id="generateTaskBtn" class="action-btn primary-btn">
                                <span>📝</span> 生成任務 Generate Task
                            </button>
                        </div>
                        <div id="taskDisplay" class="task-display" style="display: none;"></div>
                    </div>
                </div>
                
                <!-- 阶段2: 写作与引导 -->
                <div id="phase2" class="phase-section phase-locked">
                    <div class="phase-header">
                        <span class="phase-number">2</span>
                        <span class="phase-title">✍️ 寫作與引導 Write & Get Guidance</span>
                    </div>
                    <div class="phase-content">
                        <div class="writing-area">
                            <textarea id="studentWriting" class="student-textarea" 
                                placeholder="Start writing here... 在這裡開始寫作..."
                                rows="10"></textarea>
                            <div class="writing-stats">
                                <span id="wordCount">字數: 0</span>
                                <span id="targetRange"></span>
                            </div>
                        </div>
                        <div class="guidance-controls">
                            <button id="getGuidanceBtn" class="action-btn secondary-btn">
                                <span>💡</span> 獲取引導 Get Guidance
                            </button>
                            <button id="submitWritingBtn" class="action-btn primary-btn">
                                <span>✅</span> 完成寫作 Submit
                            </button>
                        </div>
                        <div id="guidanceDisplay" class="guidance-display" style="display: none;"></div>
                    </div>
                </div>
                
                <!-- 阶段3: 反馈 -->
                <div id="phase3" class="phase-section phase-locked">
                    <div class="phase-header">
                        <span class="phase-number">3</span>
                        <span class="phase-title">🌟 反饋評語 Feedback</span>
                    </div>
                    <div class="phase-content">
                        <div id="feedbackDisplay" class="feedback-display" style="display: none;"></div>
                        <div class="restart-controls" style="display: none;">
                            <button id="newTaskBtn" class="action-btn primary-btn">
                                <span>🔄</span> 開始新任務 New Task
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.bindWritingEvents();
    }

    bindWritingEvents() {
        // 生成任务按钮
        const generateBtn = document.getElementById('generateTaskBtn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateWritingTask());
        }

        // 学生写作区
        const writingArea = document.getElementById('studentWriting');
        if (writingArea) {
            writingArea.addEventListener('input', () => this.updateWordCount());
        }

        // 获取引导按钮
        const guidanceBtn = document.getElementById('getGuidanceBtn');
        if (guidanceBtn) {
            guidanceBtn.addEventListener('click', () => this.getWritingGuidance());
        }

        // 提交按钮
        const submitBtn = document.getElementById('submitWritingBtn');
        if (submitBtn) {
            submitBtn.addEventListener('click', () => this.submitWriting());
        }

        // 新任务按钮
        const newTaskBtn = document.getElementById('newTaskBtn');
        if (newTaskBtn) {
            newTaskBtn.addEventListener('click', () => this.showWritingInterface());
        }
    }

    async generateWritingTask() {
        const levelSelect = document.getElementById('writingLevel');
        const typeSelect = document.getElementById('writingType');
        const taskDisplay = document.getElementById('taskDisplay');

        if (!levelSelect.value) {
            this.showNotification('請先選擇年級', 'warning');
            return;
        }

        const btn = document.getElementById('generateTaskBtn');
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> 生成中...';

        try {
            const response = await fetch('/api/learning/writing/task', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    level: levelSelect.value,
                    task_type: typeSelect.value || null
                })
            });

            const result = await response.json();

            if (result.success) {
                this.writingSession.taskId = result.task_id;
                this.writingSession.task = result.task;
                this.writingSession.level = levelSelect.value;
                this.writingSession.phase = 'writing';

                this.displayWritingTask(result.task);
                this.unlockPhase(2);
            } else {
                throw new Error(result.detail || '生成失敗');
            }
        } catch (error) {
            console.error('Failed to generate task:', error);
            this.showNotification('生成任務失敗: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span>📝</span> 生成任務 Generate Task';
        }
    }

    displayWritingTask(task) {
        const taskDisplay = document.getElementById('taskDisplay');
        const targetRange = document.getElementById('targetRange');

        taskDisplay.innerHTML = `
            <div class="task-card">
                <div class="task-header">
                    <span class="task-type-badge">${task.type || 'writing'}</span>
                    <span class="task-level-badge">${task.level}</span>
                </div>
                <h3 class="task-topic">${task.topic}</h3>
                <p class="task-instructions">${task.instructions}</p>
                ${task.guiding_questions ? `
                    <div class="task-questions">
                        <strong>💡 思考問題:</strong>
                        <ul>${task.guiding_questions.map(q => `<li>${q}</li>`).join('')}</ul>
                    </div>
                ` : ''}
            </div>
        `;
        taskDisplay.style.display = 'block';

        if (targetRange && task.word_range) {
            targetRange.textContent = `目標: ${task.word_range.min}-${task.word_range.max} words`;
        }
    }

    updateWordCount() {
        const textarea = document.getElementById('studentWriting');
        const countDisplay = document.getElementById('wordCount');
        if (textarea && countDisplay) {
            const words = textarea.value.trim().split(/\s+/).filter(w => w).length;
            countDisplay.textContent = `字數: ${words}`;
            this.writingSession.studentText = textarea.value;
        }
    }

    async getWritingGuidance() {
        const textarea = document.getElementById('studentWriting');
        const guidanceDisplay = document.getElementById('guidanceDisplay');

        if (!textarea.value.trim()) {
            this.showNotification('請先寫一些內容', 'warning');
            return;
        }

        const btn = document.getElementById('getGuidanceBtn');
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> 獲取中...';

        try {
            const response = await fetch('/api/learning/writing/guidance', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    student_text: textarea.value,
                    level: this.writingSession.level,
                    guidance_type: 'general',
                    task_context: this.writingSession.task?.instructions
                })
            });

            const result = await response.json();

            if (result.success && result.requires_ai_call) {
                // 需要调用AI
                const aiResponse = await this.callAI(result.system_prompt, result.user_message);
                this.displayGuidance(guidanceDisplay, aiResponse);
            }
        } catch (error) {
            console.error('Failed to get guidance:', error);
            this.showFallbackGuidance(guidanceDisplay);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span>💡</span> 獲取引導 Get Guidance';
        }
    }

    async submitWriting() {
        const textarea = document.getElementById('studentWriting');
        const feedbackDisplay = document.getElementById('feedbackDisplay');

        if (!textarea.value.trim() || textarea.value.trim().split(/\s+/).length < 10) {
            this.showNotification('請寫至少10個字再提交', 'warning');
            return;
        }

        const btn = document.getElementById('submitWritingBtn');
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> 提交中...';

        try {
            const response = await fetch('/api/learning/writing/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    student_text: textarea.value,
                    level: this.writingSession.level,
                    task_topic: this.writingSession.task?.topic,
                    task_instructions: this.writingSession.task?.instructions
                })
            });

            const result = await response.json();

            if (result.success && result.requires_ai_call) {
                const aiResponse = await this.callAI(result.system_prompt, result.user_message);
                this.unlockPhase(3);
                this.displayFeedback(feedbackDisplay, aiResponse);
                this.writingSession.phase = 'completed';
            }
        } catch (error) {
            console.error('Failed to get feedback:', error);
            this.unlockPhase(3);
            this.showFallbackFeedback(feedbackDisplay);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span>✅</span> 完成寫作 Submit';
        }
    }

    // ==================== 中文训练界面 ====================

    showChineseInterface() {
        const messagesContainer = document.getElementById('messagesContainer');
        const headerTitle = document.getElementById('headerTitle');

        if (headerTitle) headerTitle.innerHTML = '📚 中文訓練';

        if (!messagesContainer) return;

        // 重置会话
        this.chineseSession = {
            gameId: null,
            game: null,
            task: null,
            level: null,
            studentText: '',
            phase: 'select',
            taskMaterials: {}
        };

        messagesContainer.innerHTML = `
            <div class="chinese-training-container">
                <!-- 顶部说明 -->
                <div class="chinese-header">
                    <h2>📚 中文語文訓練</h2>
                    <p>15個互動遊戲 | 理解 • 表達 • 結構 • 思維 • 元認知</p>
                    <div class="chinese-features">
                        <span class="feature-tag">🎯 不打分</span>
                        <span class="feature-tag">📝 不提供範文</span>
                        <span class="feature-tag">🤔 蘇格拉底引導</span>
                        <span class="feature-tag">💪 鼓勵式反饋</span>
                    </div>
                </div>
                
                <!-- 年级选择 -->
                <div class="chinese-level-selector">
                    <label>選擇年級:</label>
                    <select id="chineseLevelSelect" class="chinese-select">
                        <option value="">-- 請選擇 --</option>
                        <option value="S1">中一 S1</option>
                        <option value="S2">中二 S2</option>
                        <option value="S3">中三 S3</option>
                        <option value="S4">中四 S4</option>
                        <option value="S5">中五 S5</option>
                        <option value="S6">中六 S6</option>
                    </select>
                </div>
                
                <!-- 类别标签 -->
                <div class="chinese-categories" id="chineseCategories">
                    <div class="category-tabs">
                        <button class="cat-tab active" data-category="all">🎯 全部</button>
                        ${this.chineseCategories.map(cat => `
                            <button class="cat-tab" data-category="${cat.id}">
                                ${cat.icon} ${cat.name_zh}
                            </button>
                        `).join('')}
                    </div>
                </div>
                
                <!-- 游戏网格 -->
                <div class="chinese-games-grid" id="chineseGamesGrid">
                    ${this.renderChineseGames()}
                </div>
            </div>
        `;

        this.bindChineseEvents();
    }

    renderChineseGames(filterCategory = null) {
        const games = filterCategory && filterCategory !== 'all'
            ? this.chineseGames.filter(g => g.category === filterCategory)
            : this.chineseGames;

        return games.map(game => `
            <div class="chinese-game-card" data-game-id="${game.game_id}">
                <div class="game-icon">${game.icon}</div>
                <div class="game-info">
                    <h3>${game.name_zh}</h3>
                    <p class="game-en">${game.name_en}</p>
                    <p class="game-desc">${game.description_zh}</p>
                    <div class="game-tags">
                        <span class="game-category">${game.category}</span>
                        <span class="game-skill">${game.target_skill}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    bindChineseEvents() {
        // 类别筛选
        document.querySelectorAll('.cat-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');

                const category = e.target.dataset.category;
                const grid = document.getElementById('chineseGamesGrid');
                if (grid) {
                    grid.innerHTML = this.renderChineseGames(category);
                    this.bindGameCardEvents();
                }
            });
        });

        this.bindGameCardEvents();
    }

    bindGameCardEvents() {
        document.querySelectorAll('.chinese-game-card').forEach(card => {
            card.addEventListener('click', () => {
                const gameId = card.dataset.gameId;
                const level = document.getElementById('chineseLevelSelect')?.value;

                if (!level) {
                    this.showNotification('請先選擇年級', 'warning');
                    return;
                }

                this.startChineseGame(gameId, level);
            });
        });
    }

    async startChineseGame(gameId, level) {
        const game = this.chineseGames.find(g => g.game_id === gameId);
        if (!game) return;

        this.chineseSession.gameId = gameId;
        this.chineseSession.game = game;
        this.chineseSession.level = level;
        this.chineseSession.phase = 'task';

        this.showChineseLoading('正在生成任務...');

        try {
            const response = await fetch('/api/learning/chinese/task', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    game_id: gameId,
                    level: level,
                    difficulty: 1,
                    topic_domain: 'daily_life'
                })
            });

            const result = await response.json();

            if (result.success && result.requires_ai_call) {
                // 调用AI生成任务
                const aiResponse = await this.callAI(result.system_prompt, result.user_prompt);
                let taskData;
                try {
                    taskData = this.parseAIResponse(aiResponse);
                } catch (e) {
                    taskData = this.getMockChineseTask(gameId, level);
                }

                this.chineseSession.task = taskData;
                this.chineseSession.taskMaterials = taskData.materials || {};
                this.showChineseTaskInterface(taskData);
            }
        } catch (error) {
            console.error('Failed to generate Chinese task:', error);
            const mockTask = this.getMockChineseTask(gameId, level);
            this.chineseSession.task = mockTask;
            this.chineseSession.taskMaterials = mockTask.materials || {};
            this.showChineseTaskInterface(mockTask);
        }
    }

    getMockChineseTask(gameId, level) {
        // 根据游戏类型返回不同的mock数据
        const mockTasks = {
            'MEANING_BUILDER': {
                game_id: gameId,
                title_zh: '用自己的話復述段落',
                target_skill: '理解',
                level: level,
                instructions_zh: '閱讀以下段落，然後用自己的話重新表達它的主要意思。',
                materials: {
                    passage_zh: '春天來了，校園裡的櫻花樹開滿了粉色的花朵。每天放學後，同學們都喜歡在樹下聊天、看書。微風吹過，花瓣輕輕飄落，就像下著粉色的雪。這是我最喜歡的季節。'
                },
                student_response_format: {
                    type: 'text',
                    rules_zh: ['用自己的話簡潔地表達段落的主要意思。', '避免逐句改寫或直接翻譯原文。', '保持回答通順易懂。']
                }
            },
            'LOGIC_SEQUENCER': {
                game_id: gameId,
                title_zh: '句子排序挑戰',
                target_skill: '結構',
                level: level,
                instructions_zh: '以下句子的順序被打亂了，請將它們排列成一個連貫的段落，並說明你的理由。',
                materials: {
                    sentences: [
                        '他決定每天早起半小時練習。',
                        '小明一直想學會游泳。',
                        '經過三個月的努力，他終於學會了。',
                        '於是他報名參加了游泳班。'
                    ]
                },
                student_response_format: {
                    type: 'text',
                    rules_zh: ['寫出正確的順序（如：B-D-A-C）', '簡單說明排序的理由']
                }
            },
            'ONE_LINE_OPINION': {
                game_id: gameId,
                title_zh: '一句話表達立場',
                target_skill: '表達',
                level: level,
                instructions_zh: '用一句話清晰地表達你對以下問題的立場和理由。',
                materials: {
                    question_zh: '學生應該在課堂上使用手機嗎？'
                },
                student_response_format: {
                    type: 'text',
                    rules_zh: ['用一句話表達', '包含立場和至少一個理由']
                }
            }
        };

        // 返回对应游戏的mock数据，或默认数据
        return mockTasks[gameId] || {
            game_id: gameId,
            title_zh: '學習任務',
            target_skill: this.chineseSession.game?.target_skill || '理解',
            level: level,
            instructions_zh: '請根據材料完成任務。',
            materials: {
                passage_zh: '這是一段示例文字。請仔細閱讀並完成相關任務。'
            },
            student_response_format: {
                type: 'text',
                rules_zh: ['認真思考', '用自己的話回答']
            }
        };
    }

    showChineseTaskInterface(task) {
        this.hideChineseLoading();

        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;

        messagesContainer.innerHTML = `
            <div class="chinese-task-container">
                <!-- 任务头部 -->
                <div class="chinese-task-header">
                    <div class="task-meta">
                        <span class="game-badge">${this.chineseSession.game?.icon || '📝'} ${this.chineseSession.game?.name_zh || task.game_id}</span>
                        <span class="level-badge">${this.chineseSession.level}</span>
                        <span class="skill-badge">${task.target_skill || '綜合'}</span>
                    </div>
                    <h2 class="task-title">${task.title_zh}</h2>
                </div>
                
                <!-- 任务说明 -->
                <div class="chinese-task-instructions">
                    <h3>📋 任務說明</h3>
                    <p>${task.instructions_zh}</p>
                    ${task.student_response_format?.rules_zh ? `
                        <ul class="rules-list">
                            ${task.student_response_format.rules_zh.map(rule => `<li>${rule}</li>`).join('')}
                        </ul>
                    ` : ''}
                </div>
                
                <!-- 材料区域 -->
                <div class="chinese-task-materials">
                    <h3>📖 閱讀材料</h3>
                    ${this.renderChineseMaterials(task.materials)}
                </div>
                
                <!-- 学生输入区域 -->
                <div class="chinese-response-area">
                    <h3>✏️ 你的答案</h3>
                    <textarea 
                        id="chineseStudentResponse" 
                        class="chinese-textarea"
                        placeholder="在這裡輸入你的答案..."
                        rows="6"
                    ></textarea>
                    <div class="char-count">
                        <span id="chineseCharCount">0</span> 字
                    </div>
                </div>
                
                <!-- 操作按钮 -->
                <div class="chinese-action-buttons">
                    <button class="chinese-btn secondary" id="chineseHelpBtn">
                        🆘 我需要幫助
                    </button>
                    <button class="chinese-btn primary" id="chineseSubmitBtn">
                        ✅ 提交答案
                    </button>
                </div>
                
                <!-- 引导显示区域 -->
                <div id="chineseScaffoldDisplay" class="scaffold-display" style="display: none;"></div>
                
                <!-- 返回按钮 -->
                <div class="chinese-back-area">
                    <button class="chinese-btn link" id="chineseBackBtn">
                        ← 返回遊戲列表
                    </button>
                </div>
            </div>
        `;

        this.bindChineseTaskEvents();
    }

    renderChineseMaterials(materials) {
        if (!materials) return '<p class="no-material">無材料</p>';

        let html = '';

        // 渲染段落
        if (materials.passage_zh) {
            html += `<div class="passage-box">${materials.passage_zh}</div>`;
        }

        // 渲染句子列表（用于排序游戏等）
        if (materials.sentences && Array.isArray(materials.sentences)) {
            html += '<div class="sentences-list">';
            materials.sentences.forEach((sentence, index) => {
                const label = String.fromCharCode(65 + index); // A, B, C...
                html += `<div class="sentence-item"><span class="sentence-label">${label}.</span> ${sentence}</div>`;
            });
            html += '</div>';
        }

        // 渲染选项（用于选择游戏）
        if (materials.options && Array.isArray(materials.options)) {
            html += '<div class="options-list">';
            materials.options.forEach((opt, index) => {
                const optText = typeof opt === 'string' ? opt : (opt.text || opt.content || JSON.stringify(opt));
                html += `<div class="option-item"><span class="option-label">${index + 1}.</span> ${optText}</div>`;
            });
            html += '</div>';
        }

        // 渲染items（通用格式）
        if (materials.items && Array.isArray(materials.items)) {
            html += '<div class="materials-items">';
            materials.items.forEach((item, index) => {
                // 处理不同的item格式
                let label, content;
                if (typeof item === 'string') {
                    label = `項目${index + 1}`;
                    content = item;
                } else if (typeof item === 'object' && item !== null) {
                    label = item.label || item.title || `項目${index + 1}`;
                    content = item.content || item.text || item.value || JSON.stringify(item);
                } else {
                    label = `項目${index + 1}`;
                    content = String(item);
                }

                if (content && content !== 'undefined' && content !== 'null') {
                    // 为摘要类型添加特殊样式
                    const isSummary = label.toLowerCase().includes('summary') ||
                                     label.includes('摘要') ||
                                     label.includes('incomplete');
                    const labelDisplay = isSummary ? '📋 摘要（可能不完整）' : label;
                    const itemClass = isSummary ? 'material-item summary-item' : 'material-item';

                    html += `
                        <div class="${itemClass}">
                            <span class="item-label">${labelDisplay}</span>
                            <span class="item-content">${content}</span>
                        </div>
                    `;
                }
            });
            html += '</div>';
        }

        // 渲染问题（用于反思类游戏）
        if (materials.question_zh) {
            html += `<div class="question-box">❓ ${materials.question_zh}</div>`;
        }

        // 渲染提示
        if (materials.hint_zh) {
            html += `<div class="hint-box">💡 ${materials.hint_zh}</div>`;
        }

        return html || '<p class="no-material">無材料</p>';
    }

    bindChineseTaskEvents() {
        // 字数统计
        const textarea = document.getElementById('chineseStudentResponse');
        const charCount = document.getElementById('chineseCharCount');
        if (textarea && charCount) {
            textarea.addEventListener('input', () => {
                charCount.textContent = textarea.value.length;
                this.chineseSession.studentText = textarea.value;
            });
        }

        // 帮助按钮
        const helpBtn = document.getElementById('chineseHelpBtn');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => this.getChineseScaffold());
        }

        // 提交按钮
        const submitBtn = document.getElementById('chineseSubmitBtn');
        if (submitBtn) {
            submitBtn.addEventListener('click', () => this.submitChineseResponse());
        }

        // 返回按钮
        const backBtn = document.getElementById('chineseBackBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => this.showChineseInterface());
        }
    }

    async getChineseScaffold() {
        const textarea = document.getElementById('chineseStudentResponse');
        const scaffoldDisplay = document.getElementById('chineseScaffoldDisplay');

        if (!textarea.value || textarea.value.length < 2) {
            this.showNotification('請先嘗試寫一些內容', 'info');
            return;
        }

        const btn = document.getElementById('chineseHelpBtn');
        btn.disabled = true;
        btn.innerHTML = '⏳ 生成中...';

        try {
            const response = await fetch('/api/learning/chinese/scaffold', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    game_id: this.chineseSession.gameId,
                    level: this.chineseSession.level,
                    student_text: textarea.value,
                    task_materials: this.chineseSession.taskMaterials
                })
            });

            const result = await response.json();

            if (result.success && result.requires_ai_call) {
                const aiResponse = await this.callAI(result.system_prompt, result.user_prompt);
                let scaffoldData;
                try {
                    scaffoldData = this.parseAIResponse(aiResponse);
                } catch (e) {
                    scaffoldData = this.getMockScaffold();
                }
                this.showChineseScaffold(scaffoldDisplay, scaffoldData);
            }
        } catch (error) {
            console.error('Failed to get scaffold:', error);
            this.showChineseScaffold(scaffoldDisplay, this.getMockScaffold());
        } finally {
            btn.disabled = false;
            btn.innerHTML = '🆘 我需要幫助';
        }
    }

    getMockScaffold() {
        return {
            type: 'scaffold_questions',
            questions_zh: [
                '這段話主要在講什麼主題？',
                '作者表達了什麼樣的感受或態度？',
                '你覺得最重要的信息是什麼？'
            ]
        };
    }

    showChineseScaffold(element, data) {
        // 确保有默认问题
        let questions = data.questions_zh || data.questions || [];

        // 如果问题为空，提供默认引导问题
        if (!questions || questions.length === 0) {
            questions = this.getDefaultGuidingQuestions();
        }

        // 过滤空问题
        questions = questions.filter(q => q && q.trim());

        element.innerHTML = `
            <div class="scaffold-box">
                <h4>💡 引導問題</h4>
                <p>試著思考這些問題，可能會幫助你：</p>
                <ul class="scaffold-questions">
                    ${questions.map(q => `<li>${q}</li>`).join('')}
                </ul>
                <button class="dismiss-btn" onclick="this.parentElement.parentElement.style.display='none'">
                    知道了
                </button>
            </div>
        `;
        element.style.display = 'block';
    }

    getDefaultGuidingQuestions() {
        // 根据游戏类型返回不同的默认问题
        const gameId = this.chineseSession.gameId;
        const defaultQuestions = {
            'MEANING_BUILDER': [
                '這段話的主要內容是什麼？',
                '作者想表達什麼意思或感受？',
                '你能用自己的話簡單說明嗎？'
            ],
            'WHATS_MISSING': [
                '這個摘要包含了原文的所有重點嗎？',
                '有什麼重要信息被遺漏了？',
                '遺漏的信息為什麼重要？'
            ],
            'ONE_SENTENCE_CAPTURE': [
                '這段話最核心的一點是什麼？',
                '如果只能說一句話，你會怎麼概括？',
                '什麼是最重要的信息？'
            ],
            'LOGIC_SEQUENCER': [
                '這些句子之間有什麼邏輯關係？',
                '哪個句子應該放在最前面？為什麼？',
                '有沒有時間順序或因果關係的線索？'
            ],
            'ONE_LINE_OPINION': [
                '你對這個問題的立場是什麼？',
                '你能找到支持你立場的理由嗎？',
                '怎樣把立場和理由都放進一句話？'
            ]
        };

        return defaultQuestions[gameId] || [
            '這個任務的關鍵要求是什麼？',
            '你的回答需要包含哪些要素？',
            '怎樣能讓你的答案更清晰？'
        ];
    }

    async submitChineseResponse() {
        const textarea = document.getElementById('chineseStudentResponse');

        if (!textarea.value || textarea.value.length < 5) {
            this.showNotification('請寫更多內容再提交', 'warning');
            return;
        }

        const btn = document.getElementById('chineseSubmitBtn');
        btn.disabled = true;
        btn.innerHTML = '⏳ 提交中...';

        try {
            const response = await fetch('/api/learning/chinese/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    game_id: this.chineseSession.gameId,
                    level: this.chineseSession.level,
                    student_text: textarea.value,
                    task_materials: this.chineseSession.taskMaterials
                })
            });

            const result = await response.json();

            if (result.success && result.requires_ai_call) {
                const aiResponse = await this.callAI(result.system_prompt, result.user_prompt);
                let feedbackData;
                try {
                    feedbackData = this.parseAIResponse(aiResponse);
                } catch (e) {
                    feedbackData = this.getMockChineseFeedback();
                }
                this.showChineseFeedback(feedbackData, textarea.value);
            }
        } catch (error) {
            console.error('Failed to get feedback:', error);
            this.showChineseFeedback(this.getMockChineseFeedback(), textarea.value);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '✅ 提交答案';
        }
    }

    getMockChineseFeedback() {
        return {
            type: 'reflective_feedback',
            strength_zh: '你能夠用自己的語言重新組織內容，這說明你理解了段落的基本意思。',
            one_improvement_zh: '可以嘗試加入更多關於「感受」的描述，讓內容更豐富。',
            reflection_question_zh: '如果讓你再寫一次，你會怎樣讓表達更生動？'
        };
    }

    showChineseFeedback(feedback, studentText) {
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;

        messagesContainer.innerHTML = `
            <div class="chinese-feedback-container">
                <div class="feedback-header">
                    <h2>✨ 學習反饋</h2>
                    <p>${this.chineseSession.game?.name_zh || '中文學習'} | ${this.chineseSession.level}</p>
                </div>
                
                <!-- 学生答案回顾 -->
                <div class="student-answer-review">
                    <h3>📝 你的答案</h3>
                    <div class="answer-text">${this.escapeHtml(studentText)}</div>
                    <div class="char-info">${studentText.length} 字</div>
                </div>
                
                <!-- 反馈内容 -->
                <div class="feedback-content">
                    <div class="feedback-section strength">
                        <div class="feedback-icon">💪</div>
                        <div class="feedback-text">
                            <h4>做得好的地方</h4>
                            <p>${feedback.strength_zh}</p>
                        </div>
                    </div>
                    
                    <div class="feedback-section improvement">
                        <div class="feedback-icon">🤔</div>
                        <div class="feedback-text">
                            <h4>可以思考的方向</h4>
                            <p>${feedback.one_improvement_zh}</p>
                        </div>
                    </div>
                    
                    <div class="feedback-section reflection">
                        <div class="feedback-icon">❓</div>
                        <div class="feedback-text">
                            <h4>反思問題</h4>
                            <p>${feedback.reflection_question_zh}</p>
                        </div>
                    </div>
                </div>
                
                <!-- 操作按钮 -->
                <div class="feedback-actions">
                    <button class="chinese-btn secondary" id="tryAgainBtn">
                        🔄 再試一次
                    </button>
                    <button class="chinese-btn primary" id="backToGamesBtn">
                        📚 選擇其他遊戲
                    </button>
                </div>
            </div>
        `;

        // 绑定按钮事件
        document.getElementById('tryAgainBtn')?.addEventListener('click', () => {
            this.startChineseGame(this.chineseSession.gameId, this.chineseSession.level);
        });
        document.getElementById('backToGamesBtn')?.addEventListener('click', () => {
            this.showChineseInterface();
        });
    }

    // ==================== 通用辅助方法 ====================

    async callAI(systemPrompt, userMessage) {
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    question: userMessage,
                    subject: 'chinese',
                    system_prompt: systemPrompt,
                    use_api: false
                })
            });

            const result = await response.json();
            return result.answer || result.content || '';
        } catch (error) {
            console.error('AI call failed:', error);
            return '';
        }
    }

    parseAIResponse(text) {
        if (!text) throw new Error('Empty response');

        let clean = text.trim();
        if (clean.startsWith('```json')) clean = clean.slice(7);
        if (clean.startsWith('```')) clean = clean.slice(3);
        if (clean.endsWith('```')) clean = clean.slice(0, -3);

        return JSON.parse(clean.trim());
    }

    unlockPhase(phaseNumber) {
        const phase = document.getElementById(`phase${phaseNumber}`);
        if (phase) {
            phase.classList.remove('phase-locked');
            phase.classList.add('phase-active');
            phase.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    displayGuidance(element, response) {
        element.innerHTML = `
            <div class="ai-response guidance-response">
                <div class="response-header">
                    <span class="response-icon">💡</span>
                    <span class="response-title">寫作引導 Writing Guidance</span>
                </div>
                <div class="response-content">${this.formatResponse(response)}</div>
            </div>
        `;
        element.style.display = 'block';
    }

    displayFeedback(element, response) {
        const wordCount = this.writingSession.studentText.trim().split(/\s+/).filter(w => w).length;

        element.innerHTML = `
            <div class="ai-response feedback-response">
                <div class="response-header">
                    <span class="response-icon">🌟</span>
                    <span class="response-title">寫作反饋 Writing Feedback</span>
                </div>
                <div class="completion-stats">
                    <span>✅ 完成字數: ${wordCount} words</span>
                    <span>📝 題目: ${this.writingSession.task?.topic || '--'}</span>
                </div>
                <div class="response-content">${this.formatResponse(response)}</div>
                <div class="response-note success-note">
                    <p>🎉 恭喜完成這次寫作練習！記住，寫作是一個不斷進步的過程。</p>
                </div>
            </div>
        `;
        element.style.display = 'block';
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // 显示重新开始按钮
        const restartControls = document.querySelector('.restart-controls');
        if (restartControls) restartControls.style.display = 'block';
    }

    showFallbackGuidance(element) {
        const questions = [
            "What is the main point you want to make?",
            "Can you add more specific details?",
            "How would you explain this to a friend?"
        ];

        element.innerHTML = `
            <div class="ai-response guidance-response fallback">
                <div class="response-header">
                    <span class="response-icon">💡</span>
                    <span class="response-title">思考這些問題 Think About These</span>
                </div>
                <div class="response-content">
                    <ul>${questions.map(q => `<li>${q}</li>`).join('')}</ul>
                </div>
            </div>
        `;
        element.style.display = 'block';
    }

    showFallbackFeedback(element) {
        element.innerHTML = `
            <div class="ai-response feedback-response fallback">
                <div class="response-header">
                    <span class="response-icon">🌟</span>
                    <span class="response-title">反饋 Feedback</span>
                </div>
                <div class="response-content">
                    <p><strong>💪 Strength:</strong> You made an effort to complete this writing task. That's a great start!</p>
                    <p><strong>🤔 Think about:</strong> Try to add more specific details to make your writing more vivid.</p>
                    <p><strong>❓ Question:</strong> If you could add one more paragraph, what would you write about?</p>
                </div>
            </div>
        `;
        element.style.display = 'block';
    }

    formatResponse(text) {
        if (!text) return '';

        const lines = text.split('\n');
        let html = '';
        let inList = false;
        let listType = null;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];

            if (line.startsWith('### ')) {
                if (inList) { html += `</${listType}>`; inList = false; }
                html += `<h4 class="response-h4">${this.formatInline(line.slice(4))}</h4>`;
                continue;
            }
            if (line.startsWith('## ')) {
                if (inList) { html += `</${listType}>`; inList = false; }
                html += `<h3 class="response-h3">${this.formatInline(line.slice(3))}</h3>`;
                continue;
            }
            if (line.startsWith('# ')) {
                if (inList) { html += `</${listType}>`; inList = false; }
                html += `<h3 class="response-h3">${this.formatInline(line.slice(2))}</h3>`;
                continue;
            }

            if (/^[\-\*]\s+/.test(line)) {
                if (!inList || listType !== 'ul') {
                    if (inList) html += `</${listType}>`;
                    html += '<ul class="response-list">';
                    inList = true;
                    listType = 'ul';
                }
                html += `<li>${this.formatInline(line.replace(/^[\-\*]\s+/, ''))}</li>`;
                continue;
            }

            if (/^\d+\.\s+/.test(line)) {
                if (!inList || listType !== 'ol') {
                    if (inList) html += `</${listType}>`;
                    html += '<ol class="response-list">';
                    inList = true;
                    listType = 'ol';
                }
                html += `<li>${this.formatInline(line.replace(/^\d+\.\s+/, ''))}</li>`;
                continue;
            }

            if (inList && line.trim() !== '') {
                html += `</${listType}>`;
                inList = false;
                listType = null;
            }

            if (line.trim() === '') {
                if (inList) {
                    html += `</${listType}>`;
                    inList = false;
                    listType = null;
                }
                continue;
            }

            html += `<p>${this.formatInline(line)}</p>`;
        }

        if (inList) {
            html += `</${listType}>`;
        }

        return html;
    }

    formatInline(text) {
        if (!text) return '';

        return text
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/__(.+?)__/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/_(.+?)_/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code class="inline-code">$1</code>');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showChineseLoading(message = '加載中...') {
        let loadingEl = document.getElementById('chineseLoading');
        if (!loadingEl) {
            loadingEl = document.createElement('div');
            loadingEl.id = 'chineseLoading';
            loadingEl.className = 'chinese-loading-overlay';
            document.body.appendChild(loadingEl);
        }

        loadingEl.innerHTML = `
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <p>${message}</p>
            </div>
        `;
        loadingEl.style.display = 'flex';
    }

    hideChineseLoading() {
        const loadingEl = document.getElementById('chineseLoading');
        if (loadingEl) {
            loadingEl.style.display = 'none';
        }
    }

    bindEvents() {
        window.addEventListener('userLoggedIn', () => {
            this.token = localStorage.getItem('auth_token');
            this.init();
        });
    }

    showNotification(message, type = 'info') {
        const colors = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed; top: 20px; right: 20px; padding: 12px 24px;
            border-radius: 8px; color: white; font-size: 14px; z-index: 10000;
            background: ${colors[type] || colors.info}; animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    getCurrentMode() { return this.currentMode; }
    getModes() { return this.modes; }
}

// 创建全局实例
const learningModeManager = new LearningModeManager();

// 页面加载后初始化
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('auth_token')) {
        setTimeout(() => learningModeManager.init(), 500);
    }
});

window.addEventListener('loginSuccess', () => {
    setTimeout(() => learningModeManager.init(), 500);
});

window.learningModeManager = learningModeManager;