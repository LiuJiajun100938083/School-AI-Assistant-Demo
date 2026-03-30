// i18n/class_diary_rate.js — Class Diary Rating translations
// Keys: cdr.*
i18n.addMessages({
    zh: {
        // ── HTML static text ──────────────────────────────────
        'cdr.pageTitle':             '課堂評級',

        // No permission
        'cdr.noPermTitle':           '僅限教師使用',
        'cdr.noPermDesc':            '課堂評級表單僅供教師及管理員填寫。<br>如有疑問，請聯繫管理員。',

        // Header
        'cdr.loading':               '載入中...',

        // Mode toggle
        'cdr.quickMode':             '快速模式',
        'cdr.fullMode':              '完整模式',
        'cdr.modeHint':              '需要記錄考勤或行為？切換至完整模式',
        'cdr.modeHintFull':          '只需評分？切換至快速模式',

        // Edit mode bar
        'cdr.editingRecord':         '正在編輯記錄',
        'cdr.cancelEdit':            '取消編輯',
        'cdr.editingPeriod':         '正在編輯 {{period}} - {{subject}}',

        // Card titles
        'cdr.classInfo':             '課堂信息',
        'cdr.classRating':           '課堂評級',
        'cdr.attendance':            '考勤記錄',
        'cdr.behaviorTitle':         '嘉許與違規',

        // Form labels
        'cdr.class':                 '班級',
        'cdr.periodType':            '節數類型',
        'cdr.period':                '節數',
        'cdr.subject':               '科目',
        'cdr.discipline':            '紀律',
        'cdr.cleanliness':           '整潔',

        // Period type
        'cdr.onePeriod':             '一節課',
        'cdr.twoPeriods':            '兩節課',

        // Period select
        'cdr.selectClass':           '選擇班級',
        'cdr.selectPeriod':          '選擇節數',
        'cdr.endPeriod':             '結束節數',
        'cdr.selectSubject':         '請選擇科目',

        // Period labels
        'cdr.period0':               '早會',
        'cdr.period1':               '第一節',
        'cdr.period2':               '第二節',
        'cdr.period3':               '第三節',
        'cdr.period4':               '第四節',
        'cdr.period5':               '第五節',
        'cdr.period6':               '第六節',
        'cdr.period7':               '第七節',
        'cdr.period8':               '第八節',
        'cdr.period9':               '第九節',

        // Subjects
        'cdr.subjectChinese':        '中文',
        'cdr.subjectEnglish':        '英文',
        'cdr.subjectMath':           '數學',
        'cdr.subjectCivics':         '公民與社會發展',
        'cdr.subjectHistory':        '歷史',
        'cdr.subjectChiHistory':     '中史',
        'cdr.subjectGeography':      '地理',
        'cdr.subjectEconomics':      '經濟',
        'cdr.subjectPhysics':        '物理',
        'cdr.subjectChemistry':      '化學',
        'cdr.subjectBiology':        '生物',
        'cdr.subjectICT':            'ICT',
        'cdr.subjectB1':             'B1',
        'cdr.subjectB2':             'B2',

        // Rating
        'cdr.notRated':              '未評分',
        'cdr.rating1':               '1 - 很差',
        'cdr.rating2':               '2 - 較差',
        'cdr.rating3':               '3 - 一般',
        'cdr.rating4':               '4 - 良好',
        'cdr.rating5':               '5 - 優秀',

        // Attendance
        'cdr.absentStudents':        '缺席學生',
        'cdr.lateStudents':          '遲到學生',
        'cdr.thisClass':             '本班',
        'cdr.clickToSelect':         '點擊選擇學生',
        'cdr.studentPickerPh':       '已選學生會顯示在此，也可手動輸入',

        // Student picker
        'cdr.selectedCount':         '已選 {{count}} 位學生',
        'cdr.selectFromCount':       '從 {{count}} 位學生中選擇',

        // Behavior tabs
        'cdr.praise':                '表揚',
        'cdr.violation':             '課堂違規',
        'cdr.appearance':            '儀表',
        'cdr.medical':               '醫務室',

        // Behavior hints
        'cdr.behaviorHint':          '請先選擇原因，再點選學生姓名',
        'cdr.behaviorHintSelected':  '已選原因「{{reason}}」，請點選相關學生',
        'cdr.selectedReason':        '已選原因',
        'cdr.cancel':                '取消',
        'cdr.selectStudent':         '選擇學生',

        // Behavior category labels (for summary)
        'cdr.categoryPraise':        '表揚',
        'cdr.categoryClassroom':     '課堂違規',
        'cdr.categoryAppearance':    '儀表違規',
        'cdr.categoryMedical':       '醫務室',

        // Behavior summary
        'cdr.summaryDelete':         '[刪除]',

        // Existing records
        'cdr.existingRecords':       '今日已提交記錄',
        'cdr.editBtn':               '編輯',
        'cdr.deleteBtn':             '刪除',

        // Submit
        'cdr.submit':                '提交評級',
        'cdr.updateRecord':          '更新記錄',

        // Success toast
        'cdr.submitSuccess':         '提交成功！',
        'cdr.submitSaved':           '評級記錄已保存',
        'cdr.continueNext':          '繼續填寫下一節',
        'cdr.done':                  '完成',

        // ── JS dynamic text ──────────────────────────────────

        // Weekdays (for header date)
        'cdr.weekdays':              '日,一,二,三,四,五,六',

        // Header info
        'cdr.classDateHeader':       '{{classCode}} 班 ─ {{dateStr}}',
        'cdr.dateFormat':            '{{year}}年{{month}}月{{day}}日 星期{{weekday}}',

        // Validation errors
        'cdr.validSelectClass':      '請選擇班級',
        'cdr.validSelectPeriod':     '請選擇節數',
        'cdr.validSelectSubject':    '請選擇科目',
        'cdr.validRateDiscipline':   '請評選紀律評級',
        'cdr.validRateCleanliness':  '請評選整潔評級',
        'cdr.validSelectEndPeriod':  '請選擇結束節數',
        'cdr.submitTimeout':         '提交逾時，請重試',

        // Submit errors
        'cdr.periodOverlapLoaded':   '該時段已有記錄',
        'cdr.recordNotExist':        '此記錄已不存在，請重新提交',
        'cdr.submitFail':            '提交失敗：{{msg}}',
        'cdr.networkError':          '網絡錯誤：{{msg}}',
        'cdr.unknownError':          '未知錯誤',

        // Overlap auto-edit toast
        'cdr.overlapToast':          '已載入 {{period}}「{{subject}}」的記錄，可直接修改後提交',

        // Delete confirmation
        'cdr.confirmDelete':         '確定要刪除此記錄嗎？此操作無法撤銷。',
        'cdr.deleteFail':            '刪除失敗：{{msg}}',

        // Console warnings
        'cdr.loadClassFail':         '載入班級列表失敗',
        'cdr.loadStudentFail':       '載入學生列表失敗',
        'cdr.loadFieldStudentFail':  '載入 {{fieldId}} 班級學生失敗',
        'cdr.loadRecordFail':        '載入記錄失敗',
        'cdr.loadReasonFail':        '載入 reason codes 失敗，使用內建預設',
        'cdr.loadBehaviorStudentFail': '載入行為學生列表失敗',
    },
    en: {
        // ── HTML static text ──────────────────────────────────
        'cdr.pageTitle':             'Class Rating',

        // No permission
        'cdr.noPermTitle':           'Teachers Only',
        'cdr.noPermDesc':            'This form is only for teachers and administrators.<br>Please contact the admin if you have questions.',

        // Header
        'cdr.loading':               'Loading...',

        // Mode toggle
        'cdr.quickMode':             'Quick',
        'cdr.fullMode':              'Full',
        'cdr.modeHint':              'Need attendance or behavior? Switch to Full mode',
        'cdr.modeHintFull':          'Only need ratings? Switch to Quick mode',

        // Edit mode bar
        'cdr.editingRecord':         'Editing Record',
        'cdr.cancelEdit':            'Cancel Edit',
        'cdr.editingPeriod':         'Editing {{period}} - {{subject}}',

        // Card titles
        'cdr.classInfo':             'Class Info',
        'cdr.classRating':           'Class Rating',
        'cdr.attendance':            'Attendance',
        'cdr.behaviorTitle':         'Commendation & Violations',

        // Form labels
        'cdr.class':                 'Class',
        'cdr.periodType':            'Period Type',
        'cdr.period':                'Period',
        'cdr.subject':               'Subject',
        'cdr.discipline':            'Discipline',
        'cdr.cleanliness':           'Cleanliness',

        // Period type
        'cdr.onePeriod':             'Single',
        'cdr.twoPeriods':            'Double',

        // Period select
        'cdr.selectClass':           'Select Class',
        'cdr.selectPeriod':          'Select Period',
        'cdr.endPeriod':             'End Period',
        'cdr.selectSubject':         'Select Subject',

        // Period labels
        'cdr.period0':               'Assembly',
        'cdr.period1':               'Period 1',
        'cdr.period2':               'Period 2',
        'cdr.period3':               'Period 3',
        'cdr.period4':               'Period 4',
        'cdr.period5':               'Period 5',
        'cdr.period6':               'Period 6',
        'cdr.period7':               'Period 7',
        'cdr.period8':               'Period 8',
        'cdr.period9':               'Period 9',

        // Subjects
        'cdr.subjectChinese':        'Chinese',
        'cdr.subjectEnglish':        'English',
        'cdr.subjectMath':           'Mathematics',
        'cdr.subjectCivics':         'Citizenship & Social Dev.',
        'cdr.subjectHistory':        'History',
        'cdr.subjectChiHistory':     'Chinese History',
        'cdr.subjectGeography':      'Geography',
        'cdr.subjectEconomics':      'Economics',
        'cdr.subjectPhysics':        'Physics',
        'cdr.subjectChemistry':      'Chemistry',
        'cdr.subjectBiology':        'Biology',
        'cdr.subjectICT':            'ICT',
        'cdr.subjectB1':             'B1',
        'cdr.subjectB2':             'B2',

        // Rating
        'cdr.notRated':              'Not Rated',
        'cdr.rating1':               '1 - Very Poor',
        'cdr.rating2':               '2 - Poor',
        'cdr.rating3':               '3 - Average',
        'cdr.rating4':               '4 - Good',
        'cdr.rating5':               '5 - Excellent',

        // Attendance
        'cdr.absentStudents':        'Absent Students',
        'cdr.lateStudents':          'Late Students',
        'cdr.thisClass':             'This Class',
        'cdr.clickToSelect':         'Click to select students',
        'cdr.studentPickerPh':       'Selected students shown here, or type manually',

        // Student picker
        'cdr.selectedCount':         '{{count}} students selected',
        'cdr.selectFromCount':       'Select from {{count}} students',

        // Behavior tabs
        'cdr.praise':                'Praise',
        'cdr.violation':             'Classroom Violation',
        'cdr.appearance':            'Appearance',
        'cdr.medical':               'Medical Room',

        // Behavior hints
        'cdr.behaviorHint':          'Select a reason first, then tap student names',
        'cdr.behaviorHintSelected':  'Reason "{{reason}}" selected — tap students',
        'cdr.selectedReason':        'Selected Reason',
        'cdr.cancel':                'Cancel',
        'cdr.selectStudent':         'Select Student',

        // Behavior category labels (for summary)
        'cdr.categoryPraise':        'Praise',
        'cdr.categoryClassroom':     'Classroom Violation',
        'cdr.categoryAppearance':    'Appearance Violation',
        'cdr.categoryMedical':       'Medical Room',

        // Behavior summary
        'cdr.summaryDelete':         '[Delete]',

        // Existing records
        'cdr.existingRecords':       'Records Submitted Today',
        'cdr.editBtn':               'Edit',
        'cdr.deleteBtn':             'Delete',

        // Submit
        'cdr.submit':                'Submit Rating',
        'cdr.updateRecord':          'Update Record',

        // Success toast
        'cdr.submitSuccess':         'Submitted!',
        'cdr.submitSaved':           'Rating saved',
        'cdr.continueNext':          'Continue to next period',
        'cdr.done':                  'Done',

        // ── JS dynamic text ──────────────────────────────────

        // Weekdays
        'cdr.weekdays':              'Sun,Mon,Tue,Wed,Thu,Fri,Sat',

        // Header info
        'cdr.classDateHeader':       'Class {{classCode}} — {{dateStr}}',
        'cdr.dateFormat':            '{{weekday}}, {{day}}/{{month}}/{{year}}',

        // Validation errors
        'cdr.validSelectClass':      'Please select a class',
        'cdr.validSelectPeriod':     'Please select a period',
        'cdr.validSelectSubject':    'Please select a subject',
        'cdr.validRateDiscipline':   'Please rate discipline',
        'cdr.validRateCleanliness':  'Please rate cleanliness',
        'cdr.validSelectEndPeriod':  'Please select the end period',
        'cdr.submitTimeout':         'Submission timed out, please try again',

        // Submit errors
        'cdr.periodOverlapLoaded':   'A record already exists for this period',
        'cdr.recordNotExist':        'This record no longer exists, please resubmit',
        'cdr.submitFail':            'Submit failed: {{msg}}',
        'cdr.networkError':          'Network error: {{msg}}',
        'cdr.unknownError':          'Unknown error',

        // Overlap auto-edit toast
        'cdr.overlapToast':          'Loaded {{period}} "{{subject}}" record — edit and submit',

        // Delete confirmation
        'cdr.confirmDelete':         'Are you sure you want to delete this record? This cannot be undone.',
        'cdr.deleteFail':            'Delete failed: {{msg}}',

        // Console warnings
        'cdr.loadClassFail':         'Failed to load class list',
        'cdr.loadStudentFail':       'Failed to load student list',
        'cdr.loadFieldStudentFail':  'Failed to load {{fieldId}} students',
        'cdr.loadRecordFail':        'Failed to load records',
        'cdr.loadReasonFail':        'Failed to load reason codes, using defaults',
        'cdr.loadBehaviorStudentFail': 'Failed to load behavior student list',
    }
});
