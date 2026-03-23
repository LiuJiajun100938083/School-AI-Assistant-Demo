/**
 * i18n.js - 輕量國際化模組
 *
 * 用法：
 *   i18n.t('login.title')          → 根據當前語言返回對應文字
 *   i18n.t('welcome.back', {name}) → 支援插值 {{name}}
 *   i18n.setLang('en')             → 切換語言並刷新頁面
 *   i18n.lang                      → 當前語言代碼
 */

'use strict';

const i18n = (() => {
    const STORAGE_KEY = 'app-lang';
    const DEFAULT_LANG = 'zh';

    /* ========== 翻譯字典 ========== */

    const messages = {
        zh: {
            // --- 通用 ---
            'app.name': 'AI 學習夥伴',
            'app.school': '培僑中學',
            'app.schoolFull': '培僑中學AI學習系統',
            'common.cancel': '取消',
            'common.confirm': '確定',
            'common.loading': '加載中...',
            'common.networkError': '網絡錯誤，請稍後重試',
            'common.requestFailed': '請求失敗',
            'common.networkFailed': '網絡連接失敗，請檢查網絡',

            // --- 登入頁 ---
            'login.pageTitle': '登入 — 培僑中學 學習夥伴',
            'login.welcome': '歡迎回來',
            'login.title': '登入帳戶',
            'login.subtitle': '請輸入您的用戶名和密碼',
            'login.username': '用戶名',
            'login.usernamePlaceholder': '請輸入用戶名',
            'login.password': '密碼',
            'login.passwordPlaceholder': '請輸入密碼',
            'login.submit': '登入',
            'login.submitting': '驗證中',
            'login.emptyFields': '請輸入用戶名和密碼',
            'login.failed': '登入失敗，請檢查用戶名和密碼',
            'login.error': '登入錯誤',
            'login.qrLabel': '掃碼登入',

            // --- 首頁 ---
            'home.pageTitle': '培僑中學 學習夥伴',
            'home.splashTitle': 'AI 學習夥伴',
            'home.splashSubtitle': '培僑中學',
            'home.welcomeBack': '歡迎回來',
            'home.welcomeUser': '歡迎回來，{{name}}',
            'home.subtitle': '選擇下方應用開始使用',
            'home.defaultUser': '學生',
            'home.defaultClass': '未分班',
            'home.allApps': '全部應用',
            'home.all': '全部',
            'home.apps': '應用',
            'home.categories': '分類',

            // --- 首頁分類 ---
            'category.learning': '學習工具',
            'category.community': '社區',
            'category.teaching': '教學管理',
            'category.system': '系統管理',
            'category.other': '其他',

            // --- 用戶選單 ---
            'menu.changePassword': '修改密碼',
            'menu.admin': '管理後台',
            'menu.logout': '退出登入',

            // --- 修改密碼 ---
            'password.title': '修改密碼',
            'password.current': '當前密碼',
            'password.new': '新密碼（至少4位）',
            'password.confirmNew': '確認新密碼',
            'password.confirmBtn': '確認修改',
            'password.emptyFields': '請填寫所有欄位',
            'password.tooShort': '新密碼至少需要4個字符',
            'password.mismatch': '兩次輸入的新密碼不一致',
            'password.success': '密碼修改成功！',
            'password.failed': '密碼修改失敗',
            'password.error': '修改密碼錯誤',

            // --- 學科 ---
            'subject.ict': '資訊及通訊科技',
            'subject.ict.desc': '資訊與通訊科技',
            'subject.ces': '公民經濟與社會',
            'subject.ces.desc': '公民經濟與社會',
            'subject.history': '歷史',
            'subject.history.desc': '歷史學科',
            'subject.chinese': '中文',
            'subject.chinese.desc': '中文語言文學',
            'subject.english': '英文',
            'subject.english.desc': '英語語言文學',
            'subject.math': '數學',
            'subject.math.desc': '數學學科',
            'subject.physics': '物理',
            'subject.physics.desc': '物理學科',
            'subject.chemistry': '化學',
            'subject.chemistry.desc': '化學學科',
            'subject.biology': '生物',
            'subject.biology.desc': '生物學科',
            'subject.science': '科學',
            'subject.science.desc': '綜合科學',
            'subject.economics': '經濟',
            'subject.economics.desc': '經濟學科',
            'subject.geography': '地理',
            'subject.geography.desc': '地理學科',
            'subject.va': '視覺藝術',
            'subject.va.desc': '視覺藝術',

            // --- 應用卡片 ---
            'app.ai_chat': 'AI 學習對話',
            'app.ai_chat.desc': '一對一AI輔導對話',
            'app.ai_learning_center': 'AI 學習中心',
            'app.ai_learning_center.desc': '探索AI知識，多維度互動學習體驗',
            'app.school_learning_center': '學校學習中心',
            'app.school_learning_center.desc': '按科目和年級組織的學習資源',
            'app.game_center': '遊戲中心',
            'app.game_center.desc': '按學科分類的教育遊戲',
            'app.student_report': '學習分析',
            'app.student_report.desc': '查看學習數據報告',
            'app.learning_tasks': '學習任務',
            'app.learning_tasks.desc': '查看及完成學習任務',
            'app.mistake_book': 'AI 智能錯題本',
            'app.mistake_book.desc': '拍照上傳錯題、AI分析薄弱點、智能出題練習',
            'app.image_gen': 'AI 圖片生成',
            'app.image_gen.desc': '輸入文字描述，AI 幫你生成圖片',
            'app.forum': '討論區',
            'app.forum.desc': '師生互動討論平台',
            'app.classroom': '課堂教學',
            'app.classroom.desc': 'PPT授課、實時互動課堂',
            'app.attendance': '早讀/留堂點名',
            'app.attendance.desc': '學生考勤管理系統',
            'app.notice': '通告生成',
            'app.notice.desc': 'AI智能生成通告文檔',
            'app.mistake_book_teacher': '錯題分析(教師)',
            'app.mistake_book_teacher.desc': '查看班級錯題數據與薄弱知識點',
            'app.game_upload': '上傳遊戲',
            'app.game_upload.desc': '上傳自定義HTML遊戲',
            'app.class_diary_review': '課室日誌',
            'app.class_diary_review.desc': '查看每日課堂評級記錄',
            'app.assignment': '作業管理',
            'app.assignment.desc': '佈置作業、上交文件、AI 批改評分',
            'app.exam_creator': 'AI 出題輔助器',
            'app.exam_creator.desc': 'AI 智能生成考卷，支持編輯、預覽、打印',
            'app.learning_task_admin': '任務管理',
            'app.learning_task_admin.desc': '創建和管理學習任務',
            'app.admin_dashboard': '管理後台',
            'app.admin_dashboard.desc': '系統管理與配置',

            // --- Token ---
            'token.verifyFailed': 'Token驗證失敗',
            'token.verifyError': 'Token驗證錯誤',
            'subject.loadFailed': '載入學科失敗',

            // --- AI 對話頁 ---
            'chat.pageTitle': 'AI 學習對話 - 培僑中學',
            'chat.backHome': '返回首頁',
            'chat.history': '對話歷史',
            'chat.newChat': '+ 新對話',
            'chat.toggleSidebar': '收起/展開側邊欄',
            'chat.welcome': '歡迎使用 AI 學習夥伴！',
            'chat.welcomeSubtitle': '選擇科目並開始提問吧',
            'chat.inputPlaceholder': '輸入訊息或拖曳檔案到此處...',
            'chat.uploadFile': '上傳檔案到當前對話',
            'chat.attachment': '附件',
            'chat.thinkingTooltip': '開啟後 AI 會先進行深度推理再回答，適合複雜問題',
            'chat.thinkingLabel': '深度思考',
            'chat.send': '發送',
            'chat.headerTitle': 'AI 學習夥伴',
            'chat.statusOnline': '● 連接正常',
            'chat.statusOffline': '● 連接異常',
            'chat.msgCount': '條訊息 · ',
            'chat.deleteChat': '刪除對話',
            'chat.conversation': '對話',
            'chat.featureSubjects': '涵蓋 {{count}} 個學科的知識輔導',
            'chat.featureThinking': '深度思考模式 — AI 先推理再回答',
            'chat.featureMemory': '對話記憶 — 自動保存學習歷程',
            'chat.featureUpload': '文檔上傳 — 拖曳檔案即可智能問答',
            'chat.welcomeUser': '👋 歡迎，{{name}}！',
            'chat.welcomeUseSubject': '開始使用 {{subject}} AI 學習夥伴',
            'chat.featureLocal': '🖥️ 本地模式：快速響應，精準問答',
            'chat.featureUploadDetail': '📎 文檔上傳：直接拖拽文件到輸入框進行智能問答',
            'chat.processing': '正在處理 "{{name}}"...',
            'chat.processedFrontend': '(前端處理)',
            'chat.processedBackend': '(後端處理)',
            'chat.submitting': '正在提交請求...',
            'chat.thinking': '思考過程',
            'chat.thinkingNotes': '思考筆記',
            'chat.reasoning': '分析過程',
            'chat.knowledge': '參考資料',
            'chat.preview': '▶ 預覽',
            'chat.copy': '複製',
            'chat.htmlPreview': 'HTML 預覽',
            'chat.close': '✕ 關閉',
            'chat.queuePosition': '目前使用人數較多，正在排隊（第 {{pos}}/{{total}} 位）',
            'chat.aiBusy': 'AI 服務繁忙，請稍後重試',
            'chat.filesUploaded': '【用户在此對話中上傳的文件內容】',
            'chat.fileLabel': '文件 {{index}}: {{name}}',
            'chat.fileContent': '文件內容:',
            'chat.questionAboutFiles': '【用户基於以上文件內容的問題】',

            // --- 對話頁錯誤 ---
            'chat.errorAuth': '認證失效，請重新登入',
            'chat.errorCreateConv': '創建對話失敗',
            'chat.errorCreateConvRetry': '創建對話失敗，請稍後重試',
            'chat.errorDeleteConv': '刪除對話失敗',
            'chat.errorDeleteFailed': '刪除失敗',
            'chat.errorLoadConv': '加載對話失敗',
            'chat.errorUserNotSet': 'currentUser 未設置，無法加載對話',
            'chat.errorCheckSystem': '檢查系統狀態失敗',
            'chat.errorFileProcess': '檔案處理失敗',
            'chat.errorFileSize': '檔案超過100MB限制',
            'chat.errorFileFormat': '不支援的檔案格式，支援',
            'chat.errorFileDuplicate': '檔案「{{name}}」已在當前對話中',
            'chat.errorFileRead': '檔案讀取失敗',
            'chat.errorBackendProcess': '後端處理失敗',
            'chat.errorBackendUnavailable': '後端服務不可用，{{name}} 需要伺服器處理',
            'chat.errorEnterQuestion': '請輸入針對檔案的問題...',
            'chat.errorSendFailed': '發送失敗',
            'chat.fileAddedFrontend': '已添加到對話（前端處理）',
            'chat.fileAddedBackend': '已添加到對話（後端解析完成）',
            'chat.confirmDeleteMsg': '確定要刪除對話「{{title}}」嗎？此操作無法撤銷。',
            'chat.convDeleted': '對話「{{title}}」刪除成功',

            // --- 新對話模態框 ---
            'chat.newChatTitle': '開始新對話',
            'chat.selectSubject': '選擇學科',
            'chat.convName': '對話名稱',
            'chat.convNamePlaceholder': '輸入對話名稱（可留空）',
            'chat.start': '開始',

            // --- 確認刪除 ---
            'chat.confirmDeleteTitle': '⚠️ 確認刪除',
            'chat.cancelBtn': '取消',
            'chat.deleteBtn': '刪除',

            // --- 用戶選單 ---
            'chat.profile': '👤 個人資料',
            'chat.report': '📊 學習分析報告',

            // --- 個人資料 ---
            'chat.labelUsername': '用戶名',
            'chat.labelDisplayName': '顯示名稱',
            'chat.labelClass': '班級',
            'chat.labelLoginCount': '登錄次數',
            'chat.labelLastLogin': '最後登錄',
            'chat.labelPermission': '權限',
            'chat.profileTitle': '個人資料',

            // --- 學習總結 ---
            'summary.title': '學習總結',
            'summary.tabSummary': '知識點總結',
            'summary.tabMindmap': '思維導圖',
            'summary.noConversation': '請先開始一個對話後再生成學習總結',
            'summary.insufficientMsg': '當前對話訊息太少，至少需要2條訊息才能生成總結',
            'summary.generating': '正在分析對話內容，生成學習總結...',
            'summary.generationFailed': '生成總結時出錯，請稍後重試',
            'summary.generated': '總結生成成功！',
            'summary.btnTooltip': '生成學習總結和思維導圖',
            'summary.btnLabel': '總結',
            'summary.clickGenSummary': '點擊下方按鈕生成學習總結',
            'summary.clickGenMindmap': '點擊下方按鈕生成思維導圖',
            'summary.export': '導出',
            'summary.exportWord': 'Word 文檔 (.docx)',
            'summary.exportPdf': 'PDF 文件 (.pdf)',
            'summary.exportImage': '圖片 (.png)',
            'summary.generate': '生成總結',
            'summary.generatingBtn': '生成中...',
            'summary.noContent': '沒有可導出的內容，請先生成總結',
            'summary.pageNoContent': '當前頁面無內容可導出',
            'summary.generatingExport': '正在生成導出文件...',
            'summary.exportFailed': '導出失敗',
            'summary.screenshotLibFailed': '無法載入截圖庫，請檢查網絡',
            'summary.wordDownloaded': 'Word 文檔已下載',
            'summary.pdfDownloaded': 'PDF 文件已下載',
            'summary.imageDownloaded': '圖片已下載',
        },

        en: {
            // --- Common ---
            'app.name': 'AI Learning Buddy',
            'app.school': 'Pui Kiu College',
            'app.schoolFull': 'Pui Kiu College AI Learning System',
            'common.cancel': 'Cancel',
            'common.confirm': 'OK',
            'common.loading': 'Loading...',
            'common.networkError': 'Network error, please try again later',
            'common.requestFailed': 'Request failed',
            'common.networkFailed': 'Network connection failed, please check your connection',

            // --- Login ---
            'login.pageTitle': 'Login — Pui Kiu College Learning Buddy',
            'login.welcome': 'Welcome Back',
            'login.title': 'Sign In',
            'login.subtitle': 'Enter your username and password',
            'login.username': 'Username',
            'login.usernamePlaceholder': 'Enter username',
            'login.password': 'Password',
            'login.passwordPlaceholder': 'Enter password',
            'login.submit': 'Sign In',
            'login.submitting': 'Verifying',
            'login.emptyFields': 'Please enter username and password',
            'login.failed': 'Login failed, please check your credentials',
            'login.error': 'Login error',
            'login.qrLabel': 'Scan to Login',

            // --- Home ---
            'home.pageTitle': 'Pui Kiu College Learning Buddy',
            'home.splashTitle': 'AI Learning Buddy',
            'home.splashSubtitle': 'Pui Kiu College',
            'home.welcomeBack': 'Welcome Back',
            'home.welcomeUser': 'Welcome back, {{name}}',
            'home.subtitle': 'Choose an app below to get started',
            'home.defaultUser': 'Student',
            'home.defaultClass': 'Unassigned',
            'home.allApps': 'All Apps',
            'home.all': 'All',
            'home.apps': 'Apps',
            'home.categories': 'Categories',

            // --- Home categories ---
            'category.learning': 'Learning Tools',
            'category.community': 'Community',
            'category.teaching': 'Teaching Admin',
            'category.system': 'System Admin',
            'category.other': 'Other',

            // --- User menu ---
            'menu.changePassword': 'Change Password',
            'menu.admin': 'Admin Panel',
            'menu.logout': 'Sign Out',

            // --- Change password ---
            'password.title': 'Change Password',
            'password.current': 'Current password',
            'password.new': 'New password (min 4 chars)',
            'password.confirmNew': 'Confirm new password',
            'password.confirmBtn': 'Update',
            'password.emptyFields': 'Please fill in all fields',
            'password.tooShort': 'New password must be at least 4 characters',
            'password.mismatch': 'New passwords do not match',
            'password.success': 'Password changed successfully!',
            'password.failed': 'Failed to change password',
            'password.error': 'Password change error',

            // --- Subjects ---
            'subject.ict': 'ICT',
            'subject.ict.desc': 'Information & Communication Technology',
            'subject.ces': 'Citizenship & Social Development',
            'subject.ces.desc': 'Citizenship & Social Development',
            'subject.history': 'History',
            'subject.history.desc': 'History',
            'subject.chinese': 'Chinese',
            'subject.chinese.desc': 'Chinese Language & Literature',
            'subject.english': 'English',
            'subject.english.desc': 'English Language & Literature',
            'subject.math': 'Mathematics',
            'subject.math.desc': 'Mathematics',
            'subject.physics': 'Physics',
            'subject.physics.desc': 'Physics',
            'subject.chemistry': 'Chemistry',
            'subject.chemistry.desc': 'Chemistry',
            'subject.biology': 'Biology',
            'subject.biology.desc': 'Biology',
            'subject.science': 'Science',
            'subject.science.desc': 'Integrated Science',
            'subject.economics': 'Economics',
            'subject.economics.desc': 'Economics',
            'subject.geography': 'Geography',
            'subject.geography.desc': 'Geography',
            'subject.va': 'Visual Arts',
            'subject.va.desc': 'Visual Arts',

            // --- App cards ---
            'app.ai_chat': 'AI Chat',
            'app.ai_chat.desc': 'One-on-one AI tutoring',
            'app.ai_learning_center': 'AI Learning Center',
            'app.ai_learning_center.desc': 'Explore AI knowledge with interactive learning',
            'app.school_learning_center': 'School Learning Center',
            'app.school_learning_center.desc': 'Learning resources organized by subject & grade',
            'app.game_center': 'Game Center',
            'app.game_center.desc': 'Educational games by subject',
            'app.student_report': 'Learning Analytics',
            'app.student_report.desc': 'View learning data reports',
            'app.learning_tasks': 'Learning Tasks',
            'app.learning_tasks.desc': 'View and complete learning tasks',
            'app.mistake_book': 'AI Mistake Book',
            'app.mistake_book.desc': 'Photo upload, AI analysis & smart practice',
            'app.image_gen': 'AI Image Generator',
            'app.image_gen.desc': 'Describe in text, AI generates images',
            'app.forum': 'Forum',
            'app.forum.desc': 'Student-teacher discussion platform',
            'app.classroom': 'Classroom',
            'app.classroom.desc': 'PPT teaching & live interactive class',
            'app.attendance': 'Attendance',
            'app.attendance.desc': 'Student attendance management',
            'app.notice': 'Notice Generator',
            'app.notice.desc': 'AI-powered notice document generation',
            'app.mistake_book_teacher': 'Mistake Analysis (Teacher)',
            'app.mistake_book_teacher.desc': 'View class mistake data & weak points',
            'app.game_upload': 'Upload Games',
            'app.game_upload.desc': 'Upload custom HTML games',
            'app.class_diary_review': 'Class Diary',
            'app.class_diary_review.desc': 'View daily class rating records',
            'app.assignment': 'Assignments',
            'app.assignment.desc': 'Assign homework, submit files, AI grading',
            'app.exam_creator': 'AI Exam Creator',
            'app.exam_creator.desc': 'AI-generated exams with edit, preview & print',
            'app.learning_task_admin': 'Task Management',
            'app.learning_task_admin.desc': 'Create and manage learning tasks',
            'app.admin_dashboard': 'Admin Panel',
            'app.admin_dashboard.desc': 'System management & configuration',

            // --- Token ---
            'token.verifyFailed': 'Token verification failed',
            'token.verifyError': 'Token verification error',
            'subject.loadFailed': 'Failed to load subjects',

            // --- AI Chat Page ---
            'chat.pageTitle': 'AI Chat - Pui Kiu College',
            'chat.backHome': 'Home',
            'chat.history': 'Chat History',
            'chat.newChat': '+ New Chat',
            'chat.toggleSidebar': 'Toggle Sidebar',
            'chat.welcome': 'Welcome to AI Learning Buddy!',
            'chat.welcomeSubtitle': 'Select a subject and start asking',
            'chat.inputPlaceholder': 'Type a message or drag files here...',
            'chat.uploadFile': 'Upload files to conversation',
            'chat.attachment': 'Attach',
            'chat.thinkingTooltip': 'AI will reason deeply before answering — best for complex questions',
            'chat.thinkingLabel': 'Deep Think',
            'chat.send': 'Send',
            'chat.headerTitle': 'AI Learning Buddy',
            'chat.statusOnline': '● Connected',
            'chat.statusOffline': '● Disconnected',
            'chat.msgCount': ' messages · ',
            'chat.deleteChat': 'Delete Chat',
            'chat.conversation': 'Chat',
            'chat.featureSubjects': 'Tutoring across {{count}} subjects',
            'chat.featureThinking': 'Deep Thinking — AI reasons before answering',
            'chat.featureMemory': 'Memory — auto-saves learning progress',
            'chat.featureUpload': 'File Upload — drag & drop for smart Q&A',
            'chat.welcomeUser': '👋 Welcome, {{name}}!',
            'chat.welcomeUseSubject': 'Start using {{subject}} AI Learning Buddy',
            'chat.featureLocal': '🖥️ Local Mode: Fast responses, precise answers',
            'chat.featureUploadDetail': '📎 File Upload: Drag files to the input for smart Q&A',
            'chat.processing': 'Processing "{{name}}"...',
            'chat.processedFrontend': '(client-side)',
            'chat.processedBackend': '(server-side)',
            'chat.submitting': 'Submitting request...',
            'chat.thinking': 'Thinking Process',
            'chat.thinkingNotes': 'Thinking Notes',
            'chat.reasoning': 'Analysis',
            'chat.knowledge': 'References',
            'chat.preview': '▶ Preview',
            'chat.copy': 'Copy',
            'chat.htmlPreview': 'HTML Preview',
            'chat.close': '✕ Close',
            'chat.queuePosition': 'High traffic — you are #{{pos}} of {{total}} in queue',
            'chat.aiBusy': 'AI service is busy, please try again later',
            'chat.filesUploaded': '[Files uploaded in this conversation]',
            'chat.fileLabel': 'File {{index}}: {{name}}',
            'chat.fileContent': 'File content:',
            'chat.questionAboutFiles': '[Question about the files above]',

            // --- Chat Errors ---
            'chat.errorAuth': 'Session expired, please log in again',
            'chat.errorCreateConv': 'Failed to create conversation',
            'chat.errorCreateConvRetry': 'Failed to create conversation, please try again',
            'chat.errorDeleteConv': 'Failed to delete conversation',
            'chat.errorDeleteFailed': 'Delete failed',
            'chat.errorLoadConv': 'Failed to load conversations',
            'chat.errorUserNotSet': 'User not set, cannot load conversations',
            'chat.errorCheckSystem': 'Failed to check system status',
            'chat.errorFileProcess': 'File processing failed',
            'chat.errorFileSize': 'File exceeds 100MB limit',
            'chat.errorFileFormat': 'Unsupported file format. Supported:',
            'chat.errorFileDuplicate': '"{{name}}" is already in this conversation',
            'chat.errorFileRead': 'Failed to read file',
            'chat.errorBackendProcess': 'Server processing failed',
            'chat.errorBackendUnavailable': 'Server unavailable, {{name}} requires server processing',
            'chat.errorEnterQuestion': 'Please enter a question about the file...',
            'chat.errorSendFailed': 'Send failed',
            'chat.fileAddedFrontend': 'Added to conversation (client-side)',
            'chat.fileAddedBackend': 'Added to conversation (server-side)',
            'chat.confirmDeleteMsg': 'Delete "{{title}}"? This cannot be undone.',
            'chat.convDeleted': '"{{title}}" deleted successfully',

            // --- New Chat Modal ---
            'chat.newChatTitle': 'Start New Chat',
            'chat.selectSubject': 'Select Subject',
            'chat.convName': 'Conversation Name',
            'chat.convNamePlaceholder': 'Enter a name (optional)',
            'chat.start': 'Start',

            // --- Confirm Delete ---
            'chat.confirmDeleteTitle': '⚠️ Confirm Delete',
            'chat.cancelBtn': 'Cancel',
            'chat.deleteBtn': 'Delete',

            // --- User Menu ---
            'chat.profile': '👤 Profile',
            'chat.report': '📊 Learning Report',

            // --- Profile ---
            'chat.labelUsername': 'Username',
            'chat.labelDisplayName': 'Display Name',
            'chat.labelClass': 'Class',
            'chat.labelLoginCount': 'Login Count',
            'chat.labelLastLogin': 'Last Login',
            'chat.labelPermission': 'Permission',
            'chat.profileTitle': 'Profile',

            // --- Learning Summary ---
            'summary.title': 'Learning Summary',
            'summary.tabSummary': 'Knowledge Summary',
            'summary.tabMindmap': 'Mind Map',
            'summary.noConversation': 'Please start a conversation before generating a summary',
            'summary.insufficientMsg': 'Too few messages — at least 2 are needed to generate a summary',
            'summary.generating': 'Analyzing conversation, generating summary...',
            'summary.generationFailed': 'Error generating summary, please try again later',
            'summary.generated': 'Summary generated!',
            'summary.btnTooltip': 'Generate learning summary & mind map',
            'summary.btnLabel': 'Summary',
            'summary.clickGenSummary': 'Click below to generate a knowledge summary',
            'summary.clickGenMindmap': 'Click below to generate a mind map',
            'summary.export': 'Export',
            'summary.exportWord': 'Word Document (.docx)',
            'summary.exportPdf': 'PDF File (.pdf)',
            'summary.exportImage': 'Image (.png)',
            'summary.generate': 'Generate',
            'summary.generatingBtn': 'Generating...',
            'summary.noContent': 'No content to export — please generate a summary first',
            'summary.pageNoContent': 'No content on this page to export',
            'summary.generatingExport': 'Generating export file...',
            'summary.exportFailed': 'Export failed',
            'summary.screenshotLibFailed': 'Cannot load screenshot library, check network',
            'summary.wordDownloaded': 'Word document downloaded',
            'summary.pdfDownloaded': 'PDF file downloaded',
            'summary.imageDownloaded': 'Image downloaded',
        }
    };

    /* ========== 核心函數 ========== */

    let _lang = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;

    /**
     * 取得翻譯文字
     * @param {string} key - 翻譯鍵，如 'login.title'
     * @param {Object} [params] - 插值參數，如 {name: '小明'}
     * @returns {string}
     */
    function t(key, params) {
        const dict = messages[_lang] || messages[DEFAULT_LANG];
        let text = dict[key] || messages[DEFAULT_LANG][key] || key;
        if (params) {
            Object.keys(params).forEach(k => {
                text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), params[k]);
            });
        }
        return text;
    }

    /**
     * 設定語言並刷新頁面
     * @param {string} lang - 'zh' 或 'en'
     */
    function setLang(lang) {
        if (!messages[lang]) return;
        _lang = lang;
        localStorage.setItem(STORAGE_KEY, lang);
        location.reload();
    }

    /**
     * 切換語言（zh ↔ en）
     */
    function toggle() {
        setLang(_lang === 'zh' ? 'en' : 'zh');
    }

    /**
     * 自動翻譯帶有 data-i18n 屬性的 DOM 元素
     * <span data-i18n="login.title"></span>
     * <input data-i18n-placeholder="login.usernamePlaceholder">
     */
    function applyDOM(root = document) {
        root.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = t(el.dataset.i18n);
        });
        root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.placeholder = t(el.dataset.i18nPlaceholder);
        });
        root.querySelectorAll('[data-i18n-title]').forEach(el => {
            el.title = t(el.dataset.i18nTitle);
        });
    }

    return {
        t,
        setLang,
        toggle,
        applyDOM,
        get lang() { return _lang; },
        get isEn() { return _lang === 'en'; },
        get isZh() { return _lang === 'zh'; },
        messages,
    };
})();
