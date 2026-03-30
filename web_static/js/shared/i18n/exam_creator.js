// i18n/exam_creator.js — AI Exam Creator translations
// Keys: ec.*
i18n.addMessages({
    zh: {
        // ── HTML static text ──────────────────────────────────
        'ec.pageTitle':          'AI 考卷出題',
        'ec.backTitle':          '返回首頁',
        'ec.headerTitle':        'AI 考卷出題',

        // Mode tabs
        'ec.modeAI':             'AI 出題',
        'ec.modeSimilar':        '相似題生成',
        'ec.modeDescribe':       '描述出題',

        // Panel
        'ec.panelTitle':         '出題設定',

        // Labels
        'ec.labelSubject':       '科目',
        'ec.labelKnowledge':     '知識點',
        'ec.labelCount':         '題目數量',
        'ec.labelDifficulty':    '難度',
        'ec.labelType':          '題型',
        'ec.labelTotalMarks':    '總分',
        'ec.labelScenario':      '考試場景',
        'ec.labelProvider':      '生成方式',
        'ec.labelInputMethod':   '輸入方式',
        'ec.labelDescription':   '題目描述',
        'ec.labelGenCount':      '生成數量',

        // Optional hints
        'ec.hintOptional':       '(選填)',
        'ec.hintLoading':        '(載入中...)',
        'ec.hintLatex':          '(支援 LaTeX)',

        // Placeholders
        'ec.phAutoAllocate':     '自動分配',
        'ec.phScenario':         '如：期中考試、單元測驗',
        'ec.phSimilarInput':     '輸入或貼上原始題目文字...\n數學公式用 $...$ 或 $$...$$ 包裹',
        'ec.phDescribeInput':    '描述你想要的題目，例如：\n• 圓O半徑5，弦AB長8，求弦心距\n• 直角三角形ABC，斜邊c=10，一直角邊a=6\n• 平行四邊形面積相關，難度3',

        // Question types
        'ec.typeChoice':         '選擇題',
        'ec.typeShort':          '簡答題',
        'ec.typeLong':           '解答題',
        'ec.typeFill':           '填空題',

        // Provider buttons
        'ec.providerLocal':      '本地生成',
        'ec.providerCloud':      '雲端生成',
        'ec.providerLocalHint':  '速度穩定，校內可控',
        'ec.providerCloudHint':  '質量更高，需聯網',

        // Buttons
        'ec.btnGenerate':        'AI 生成試卷',
        'ec.btnHistory':         '出題歷史',
        'ec.btnSimilar':         '生成相似題',
        'ec.btnDescribe':        '描述生成題目',
        'ec.btnPreviewGeo':      '預覽幾何圖形',
        'ec.btnPrint':           '打印試卷',

        // Upload zone
        'ec.uploadDrag':         '拖曳圖片至此處或',
        'ec.uploadClick':        '點擊上傳',
        'ec.uploadFormats':      '支援 JPG, PNG, HEIC（最大 10MB）',
        'ec.uploadAutoOCR':      '點擊「生成相似題」後將自動識別圖片文字並生成',
        'ec.uploadRemove':       '✕ 移除',

        // Empty states
        'ec.emptyTitle':         '選擇知識點開始出題',
        'ec.emptyDesc':          '在左側配置出題參數，AI 將自動生成符合 DSE 風格的試卷',
        'ec.historyEmptyTitle':  '還沒有出過題目',
        'ec.historyEmptyDesc':   '點擊左側「AI 生成試卷」開始第一份試卷',

        // Generating state
        'ec.generating':         'AI 正在逐題出題...',
        'ec.generatingDesc':     '正在生成 {count} 道題目，每題獨立生成以確保品質',
        'ec.generatingReady':    '準備中...',
        'ec.generatingTime':     '每題約 10-20 秒',

        // Error state
        'ec.errorTitle':         '生成失敗',
        'ec.errorRetry':         '重新嘗試',

        // Results
        'ec.resultsTitle':       '生成結果',

        // History
        'ec.historyTitle':       '出題歷史',
        'ec.historyBack':        '返回歷史',

        // Edit modal
        'ec.editTitle':          '編輯題目',
        'ec.editQuestion':       '題目',
        'ec.editAnswer':         '答案',
        'ec.editRubric':         '評分準則',
        'ec.editMarks':          '配分',
        'ec.editType':           '題型',
        'ec.editCancel':         '取消',
        'ec.editSave':           '保存',

        // ── JS dynamic text ──────────────────────────────────
        'ec.noKnowledge':        '暫無知識點數據',
        'ec.loadingKnowledge':   '載入知識點...',
        'ec.loadKnowledgeFail':  '載入失敗',
        'ec.pointsCount':        '{{count}} 個',
        'ec.noQuestion':         '無題目',
        'ec.typeFallback':       '題目',
        'ec.rubricLabel':        '評分準則：',
        'ec.marksBadge':         '{{points}} 分',
        'ec.toggleAnswer':       '顯示/隱藏答案',

        // Mode & source labels
        'ec.modeLabelAI':        'AI 出題',
        'ec.modeLabelSimilar':   '相似題',
        'ec.sourceText':         '文字輸入',
        'ec.sourceImage':        '圖片 OCR',

        // Status labels
        'ec.statusGenerating':   '生成中',
        'ec.statusDone':         '已完成',
        'ec.statusFailed':       '失敗',

        // History loading
        'ec.loadingHistory':     '載入歷史...',
        'ec.loadHistoryFail':    '載入失敗',
        'ec.questionsCount':     '{{count}} 題',
        'ec.difficultyLabel':    '難度 {{diff}}',

        // Toast messages
        'ec.toastGenDone':       '試卷生成完成！',
        'ec.toastGenFail':       '試卷生成失敗',
        'ec.toastLoadingQ':      '載入題目...',
        'ec.toastLoadQFail':     '無法載入題目',
        'ec.toastLoadFail':      '載入失敗',
        'ec.totalMarks':         '總分 {{marks}} 分',

        // Image upload
        'ec.imageTooLarge':      '圖片大小超過 10MB 限制',

        // OCR
        'ec.ocrProcessing':      '正在識別圖片文字...',
        'ec.ocrFail':            'OCR 識別失敗，請手動輸入題目文字',

        // Validation
        'ec.validMinTextQ':      '請輸入至少 5 個字的題目文字',
        'ec.validMinTextD':      '請輸入至少 5 個字的題目描述',

        // Task started
        'ec.similarStarted':     '相似題生成任務已啟動',
        'ec.describeStarted':    '描述出題任務已啟動',

        // Processing
        'ec.processing':         '正在處理...',
        'ec.submitting':         '正在提交...',
        'ec.examStarted':        '試卷已開始生成',
        'ec.progressDone':       '已完成 {{done}} / {{total}} 題',
        'ec.allDone':            '題目生成完成！',
        'ec.genError':           '生成過程出錯',

        // Delete
        'ec.confirmDelete':      '確定要刪除這份試卷嗎？',
        'ec.deleted':            '已刪除',
        'ec.deleteFail':         '刪除失敗',

        // Save / regenerate
        'ec.saveFail':           '保存失敗',
        'ec.regenFail':          '重新生成失敗',

        // Request errors
        'ec.startFail':          '啟動失敗：',
        'ec.requestFail':        '請求失敗',
        'ec.networkError':       '請求失敗，請檢查網路連線',
        'ec.noApiKey':           '未配置 API Key（請聯繫管理員）',
        'ec.cloudUnavailable':   '雲端不可用',

        // Geometry preview
        'ec.geoPlease':          '請輸入幾何描述',
        'ec.geoGenerating':      '生成中...',
        'ec.geoDone':            '幾何圖形已生成',

        // Export
        'ec.exportFail':         'DOCX 導出失敗',
        'ec.exportError':        '導出失敗',
        'ec.exportFilename':     '題目{{index}}.docx',

        // Tooltips
        'ec.tipEdit':            '編輯',
        'ec.tipRegen':           '重新生成',
        'ec.tipExport':          '導出 Word',
        'ec.tipDelete':          '刪除',

        // Fallbacks
        'ec.categoryOther':      '其他',
        'ec.subjectUnknown':     '未知',
    },
    en: {
        // ── HTML static text ──────────────────────────────────
        'ec.pageTitle':          'AI Exam Creator',
        'ec.backTitle':          'Back to Home',
        'ec.headerTitle':        'AI Exam Creator',

        // Mode tabs
        'ec.modeAI':             'AI Generate',
        'ec.modeSimilar':        'Similar Questions',
        'ec.modeDescribe':       'Describe to Generate',

        // Panel
        'ec.panelTitle':         'Generation Settings',

        // Labels
        'ec.labelSubject':       'Subject',
        'ec.labelKnowledge':     'Knowledge Points',
        'ec.labelCount':         'Number of Questions',
        'ec.labelDifficulty':    'Difficulty',
        'ec.labelType':          'Question Type',
        'ec.labelTotalMarks':    'Total Marks',
        'ec.labelScenario':      'Exam Scenario',
        'ec.labelProvider':      'Generation Method',
        'ec.labelInputMethod':   'Input Method',
        'ec.labelDescription':   'Question Description',
        'ec.labelGenCount':      'Generate Count',

        // Optional hints
        'ec.hintOptional':       '(Optional)',
        'ec.hintLoading':        '(Loading...)',
        'ec.hintLatex':          '(LaTeX supported)',

        // Placeholders
        'ec.phAutoAllocate':     'Auto allocate',
        'ec.phScenario':         'e.g. Midterm exam, Unit test',
        'ec.phSimilarInput':     'Enter or paste the original question text...\nWrap math formulas with $...$ or $$...$$',
        'ec.phDescribeInput':    'Describe the questions you want, e.g.:\n• Circle O radius 5, chord AB length 8, find chord-center distance\n• Right triangle ABC, hypotenuse c=10, leg a=6\n• Parallelogram area related, difficulty 3',

        // Question types
        'ec.typeChoice':         'Multiple Choice',
        'ec.typeShort':          'Short Answer',
        'ec.typeLong':           'Long Answer',
        'ec.typeFill':           'Fill in the Blank',

        // Provider buttons
        'ec.providerLocal':      'Local Generation',
        'ec.providerCloud':      'Cloud Generation',
        'ec.providerLocalHint':  'Stable speed, school-controlled',
        'ec.providerCloudHint':  'Higher quality, requires internet',

        // Buttons
        'ec.btnGenerate':        'AI Generate Exam',
        'ec.btnHistory':         'Generation History',
        'ec.btnSimilar':         'Generate Similar',
        'ec.btnDescribe':        'Generate from Description',
        'ec.btnPreviewGeo':      'Preview Geometry',
        'ec.btnPrint':           'Print Exam',

        // Upload zone
        'ec.uploadDrag':         'Drag image here or',
        'ec.uploadClick':        'Click to upload',
        'ec.uploadFormats':      'Supports JPG, PNG, HEIC (max 10 MB)',
        'ec.uploadAutoOCR':      'Click "Generate Similar" to auto-recognize image text and generate',
        'ec.uploadRemove':       '✕ Remove',

        // Empty states
        'ec.emptyTitle':         'Select knowledge points to start',
        'ec.emptyDesc':          'Configure parameters on the left and AI will auto-generate a DSE-style exam paper',
        'ec.historyEmptyTitle':  'No exams generated yet',
        'ec.historyEmptyDesc':   'Click "AI Generate Exam" on the left to create your first exam',

        // Generating state
        'ec.generating':         'AI is generating questions...',
        'ec.generatingDesc':     'Generating {count} questions, each generated independently for quality',
        'ec.generatingReady':    'Preparing...',
        'ec.generatingTime':     'About 10-20 seconds per question',

        // Error state
        'ec.errorTitle':         'Generation Failed',
        'ec.errorRetry':         'Retry',

        // Results
        'ec.resultsTitle':       'Results',

        // History
        'ec.historyTitle':       'Generation History',
        'ec.historyBack':        'Back to History',

        // Edit modal
        'ec.editTitle':          'Edit Question',
        'ec.editQuestion':       'Question',
        'ec.editAnswer':         'Answer',
        'ec.editRubric':         'Marking Criteria',
        'ec.editMarks':          'Marks',
        'ec.editType':           'Type',
        'ec.editCancel':         'Cancel',
        'ec.editSave':           'Save',

        // ── JS dynamic text ──────────────────────────────────
        'ec.noKnowledge':        'No knowledge point data',
        'ec.loadingKnowledge':   'Loading knowledge points...',
        'ec.loadKnowledgeFail':  'Failed to load',
        'ec.pointsCount':        '{{count}} items',
        'ec.noQuestion':         'No question',
        'ec.typeFallback':       'Question',
        'ec.rubricLabel':        'Marking Criteria:',
        'ec.marksBadge':         '{{points}} pts',
        'ec.toggleAnswer':       'Show/Hide Answer',

        // Mode & source labels
        'ec.modeLabelAI':        'AI Generate',
        'ec.modeLabelSimilar':   'Similar',
        'ec.sourceText':         'Text Input',
        'ec.sourceImage':        'Image OCR',

        // Status labels
        'ec.statusGenerating':   'Generating',
        'ec.statusDone':         'Completed',
        'ec.statusFailed':       'Failed',

        // History loading
        'ec.loadingHistory':     'Loading history...',
        'ec.loadHistoryFail':    'Failed to load',
        'ec.questionsCount':     '{{count}} questions',
        'ec.difficultyLabel':    'Difficulty {{diff}}',

        // Toast messages
        'ec.toastGenDone':       'Exam generated successfully!',
        'ec.toastGenFail':       'Exam generation failed',
        'ec.toastLoadingQ':      'Loading questions...',
        'ec.toastLoadQFail':     'Unable to load questions',
        'ec.toastLoadFail':      'Failed to load',
        'ec.totalMarks':         'Total {{marks}} marks',

        // Image upload
        'ec.imageTooLarge':      'Image exceeds 10 MB limit',

        // OCR
        'ec.ocrProcessing':      'Recognizing image text...',
        'ec.ocrFail':            'OCR failed, please enter question text manually',

        // Validation
        'ec.validMinTextQ':      'Please enter at least 5 characters of question text',
        'ec.validMinTextD':      'Please enter at least 5 characters of question description',

        // Task started
        'ec.similarStarted':     'Similar question generation started',
        'ec.describeStarted':    'Description-based generation started',

        // Processing
        'ec.processing':         'Processing...',
        'ec.submitting':         'Submitting...',
        'ec.examStarted':        'Exam generation started',
        'ec.progressDone':       'Completed {{done}} / {{total}} questions',
        'ec.allDone':            'All questions generated!',
        'ec.genError':           'Error during generation',

        // Delete
        'ec.confirmDelete':      'Are you sure you want to delete this exam?',
        'ec.deleted':            'Deleted',
        'ec.deleteFail':         'Delete failed',

        // Save / regenerate
        'ec.saveFail':           'Save failed',
        'ec.regenFail':          'Regeneration failed',

        // Request errors
        'ec.startFail':          'Failed to start: ',
        'ec.requestFail':        'Request failed',
        'ec.networkError':       'Request failed, please check your network connection',
        'ec.noApiKey':           'API Key not configured (please contact admin)',
        'ec.cloudUnavailable':   'Cloud unavailable',

        // Geometry preview
        'ec.geoPlease':          'Please enter a geometry description',
        'ec.geoGenerating':      'Generating...',
        'ec.geoDone':            'Geometry figure generated',

        // Export
        'ec.exportFail':         'DOCX export failed',
        'ec.exportError':        'Export failed',
        'ec.exportFilename':     'Question{{index}}.docx',

        // Tooltips
        'ec.tipEdit':            'Edit',
        'ec.tipRegen':           'Regenerate',
        'ec.tipExport':          'Export Word',
        'ec.tipDelete':          'Delete',

        // Fallbacks
        'ec.categoryOther':      'Other',
        'ec.subjectUnknown':     'Unknown',
    }
});
