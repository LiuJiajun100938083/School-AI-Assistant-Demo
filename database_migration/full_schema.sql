
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `activity_group_students`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_group_students` (
  `id` int NOT NULL AUTO_INCREMENT,
  `group_id` int NOT NULL,
  `user_login` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `added_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_group_student` (`group_id`,`user_login`),
  KEY `idx_group` (`group_id`),
  CONSTRAINT `activity_group_students_ibfk_1` FOREIGN KEY (`group_id`) REFERENCES `activity_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `activity_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_groups` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_group_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `activity_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `session_id` int NOT NULL,
  `user_login` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `card_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `check_in_time` datetime DEFAULT NULL,
  `check_in_status` enum('on_time','late','not_arrived') COLLATE utf8mb4_unicode_ci DEFAULT 'not_arrived',
  `check_out_time` datetime DEFAULT NULL,
  `check_out_status` enum('normal','early','not_arrived','still_here') COLLATE utf8mb4_unicode_ci DEFAULT 'not_arrived',
  `late_minutes` int DEFAULT '0',
  `early_minutes` int DEFAULT '0',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_session_record` (`session_id`,`user_login`),
  KEY `idx_session` (`session_id`),
  KEY `idx_student` (`user_login`),
  CONSTRAINT `activity_records_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `activity_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `activity_session_students`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_session_students` (
  `id` int NOT NULL AUTO_INCREMENT,
  `session_id` int NOT NULL,
  `user_login` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `added_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_session_student` (`session_id`,`user_login`),
  KEY `idx_session` (`session_id`),
  CONSTRAINT `activity_session_students_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `activity_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `activity_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `session_date` date NOT NULL,
  `activity_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `late_threshold` int DEFAULT '10',
  `early_threshold` int DEFAULT '10',
  `status` enum('active','completed','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `created_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_date` (`session_date`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `assignment_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `assignment_attachments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `assignment_id` int NOT NULL,
  `original_name` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `stored_name` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(1000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` bigint DEFAULT '0',
  `file_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `mime_type` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `uploaded_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `is_deleted` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_attachment_assignment` (`assignment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `assignment_questions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `assignment_questions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `assignment_id` int NOT NULL COMMENT '-> assignments.id',
  `question_order` int DEFAULT '0' COMMENT '排序',
  `question_number` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT '' COMMENT '原始題號',
  `question_text` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '題目內容',
  `answer_text` text COLLATE utf8mb4_unicode_ci COMMENT '參考答案',
  `answer_source` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'missing' COMMENT 'extracted/inferred/missing/manual',
  `points` decimal(5,1) DEFAULT NULL COMMENT '分值',
  `question_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'open' COMMENT '題型',
  `question_type_confidence` float DEFAULT NULL COMMENT '題型判斷置信度',
  `is_ai_extracted` tinyint(1) DEFAULT '1' COMMENT 'AI 識別 vs 手動添加',
  `source_batch_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '來源批次',
  `source_page` int DEFAULT NULL COMMENT '來源 PDF 頁碼',
  `ocr_confidence` float DEFAULT NULL COMMENT '識別置信度',
  `metadata` json DEFAULT NULL COMMENT '擴展字段',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_aq_assignment` (`assignment_id`),
  KEY `idx_aq_order` (`assignment_id`,`question_order`),
  CONSTRAINT `assignment_questions_ibfk_1` FOREIGN KEY (`assignment_id`) REFERENCES `assignments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `assignment_rubric_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `assignment_rubric_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `assignment_id` int NOT NULL COMMENT '作業ID',
  `item_order` int DEFAULT '0' COMMENT '排序',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '評分項目名',
  `max_points` decimal(5,1) NOT NULL COMMENT '該項滿分',
  `level_definitions` json DEFAULT NULL COMMENT '等级定义 JSON',
  `weight` decimal(5,2) DEFAULT NULL COMMENT '权重百分比',
  PRIMARY KEY (`id`),
  KEY `idx_assignment` (`assignment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `assignment_submissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `assignment_submissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `assignment_id` int NOT NULL COMMENT '作業ID',
  `student_id` int NOT NULL COMMENT '學生 user id',
  `student_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '學生名',
  `username` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '用戶名',
  `class_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '班級',
  `content` text COLLATE utf8mb4_unicode_ci COMMENT '文字備註',
  `status` enum('submitted','graded','returned') COLLATE utf8mb4_unicode_ci DEFAULT 'submitted',
  `score` decimal(5,1) DEFAULT NULL COMMENT '得分',
  `feedback` text COLLATE utf8mb4_unicode_ci COMMENT '教師評語',
  `graded_by` int DEFAULT NULL COMMENT '批改教師 id',
  `graded_at` datetime DEFAULT NULL COMMENT '批改時間',
  `is_late` tinyint(1) DEFAULT '0' COMMENT '是否逾期',
  `submitted_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_assignment_student` (`assignment_id`,`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `assignments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '作業標題',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT '作業描述',
  `assignment_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'file_upload' COMMENT '作業類型: file_upload/form/exam',
  `created_by` int DEFAULT NULL COMMENT '教師 user id',
  `created_by_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '教師名',
  `target_type` enum('all','class','student') COLLATE utf8mb4_unicode_ci DEFAULT 'all' COMMENT '目標類型',
  `target_value` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '班級名 或 逗號分隔 username',
  `max_score` decimal(5,1) DEFAULT '100.0' COMMENT '滿分',
  `rubric_type` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT 'points' COMMENT '评分类型',
  `rubric_config` json DEFAULT NULL COMMENT '类型配置 JSON',
  `deadline` datetime DEFAULT NULL COMMENT '截止日期',
  `status` enum('draft','published','closed') COLLATE utf8mb4_unicode_ci DEFAULT 'draft',
  `allow_late` tinyint(1) DEFAULT '0' COMMENT '允許逾期',
  `max_files` int DEFAULT '5' COMMENT '最大文件數',
  `published_at` datetime DEFAULT NULL COMMENT '發布時間',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` tinyint(1) DEFAULT '0' COMMENT '軟刪除',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `attendance_exports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance_exports` (
  `id` int NOT NULL AUTO_INCREMENT,
  `session_id` int NOT NULL,
  `session_type` enum('morning','detention') COLLATE utf8mb4_unicode_ci NOT NULL,
  `session_date` date NOT NULL,
  `created_by` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_by_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` bigint DEFAULT '0',
  `student_count` int DEFAULT '0',
  `present_count` int DEFAULT '0',
  `late_count` int DEFAULT '0',
  `absent_count` int DEFAULT '0',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `is_deleted` tinyint(1) DEFAULT '0',
  `deleted_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_created_by` (`created_by`),
  KEY `idx_session` (`session_id`),
  KEY `idx_date` (`session_date`),
  KEY `idx_type` (`session_type`),
  KEY `idx_deleted` (`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `attendance_fixed_list_students`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance_fixed_list_students` (
  `id` int NOT NULL AUTO_INCREMENT,
  `list_id` int NOT NULL,
  `user_login` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `added_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_list_student` (`list_id`,`user_login`),
  KEY `idx_list` (`list_id`),
  CONSTRAINT `attendance_fixed_list_students_ibfk_1` FOREIGN KEY (`list_id`) REFERENCES `attendance_fixed_lists` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `attendance_fixed_lists`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance_fixed_lists` (
  `id` int NOT NULL AUTO_INCREMENT,
  `list_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `list_type` enum('morning','detention') COLLATE utf8mb4_unicode_ci DEFAULT 'morning',
  `created_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_default` tinyint(1) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_list_name` (`list_name`,`list_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `attendance_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `session_id` int NOT NULL,
  `user_login` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `card_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `scan_time` datetime NOT NULL,
  `checkout_time` datetime DEFAULT NULL,
  `status` enum('present','late','very_late','absent','detention_active','detention_completed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `late_minutes` int DEFAULT '0',
  `makeup_minutes` int DEFAULT '0',
  `is_registered` tinyint(1) DEFAULT '1',
  `planned_periods` int DEFAULT '0',
  `planned_minutes` int DEFAULT NULL,
  `planned_end_time` datetime DEFAULT NULL,
  `actual_minutes` int DEFAULT '0',
  `actual_periods` int DEFAULT '0',
  `detention_reason` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_session_record` (`session_id`,`user_login`),
  KEY `idx_session` (`session_id`),
  KEY `idx_student` (`user_login`),
  KEY `idx_scan_time` (`scan_time`),
  CONSTRAINT `attendance_records_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `attendance_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `attendance_session_students`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance_session_students` (
  `id` int NOT NULL AUTO_INCREMENT,
  `session_id` int NOT NULL,
  `user_login` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `added_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_session_student` (`session_id`,`user_login`),
  KEY `idx_session` (`session_id`),
  KEY `idx_student` (`user_login`),
  CONSTRAINT `attendance_session_students_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `attendance_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `attendance_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `session_type` enum('morning','detention') COLLATE utf8mb4_unicode_ci NOT NULL,
  `session_date` date NOT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `target_time` time NOT NULL DEFAULT '07:30:00',
  `late_threshold` time NOT NULL DEFAULT '07:40:00',
  `makeup_minutes` int DEFAULT '35',
  `status` enum('active','completed','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `created_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `open_mode` tinyint(1) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_date` (`session_date`),
  KEY `idx_type` (`session_type`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `log_id` int NOT NULL AUTO_INCREMENT,
  `event_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int DEFAULT NULL,
  `username` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `resource_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `resource_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `details` json DEFAULT NULL,
  `status` enum('success','failure','warning') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `timestamp` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `idx_audit_timestamp` (`timestamp`),
  KEY `idx_audit_user` (`user_id`),
  KEY `idx_audit_event` (`event_type`),
  CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `chem2048_scores`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chem2048_scores` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_id` int NOT NULL COMMENT '用戶ID (users.id)',
  `student_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '顯示名稱',
  `class_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT '' COMMENT '班級',
  `score` int NOT NULL COMMENT '遊戲分數',
  `highest_tile` int NOT NULL COMMENT '最高方塊值 (如 2048)',
  `highest_element` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '最高元素符號 (如 Na)',
  `highest_element_no` int NOT NULL COMMENT '最高元素序號 (如 11)',
  `total_moves` int DEFAULT '0' COMMENT '總移動次數',
  `tips_used` int DEFAULT '0' COMMENT '使用提示次數',
  `played_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_student` (`student_id`),
  KEY `idx_class` (`class_name`),
  KEY `idx_played` (`played_at`),
  KEY `idx_score` (`score` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='化學 2048 遊戲成績';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `class_diary_audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `class_diary_audit_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `action` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'CREATE|UPDATE|DELETE|GRANT_*|REVOKE_*|GENERATE_REPORT|EXPORT',
  `target_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'entry|reviewer|recipient|daily_report|range_report|class',
  `target_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '目標 ID',
  `actor` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '操作人',
  `old_value` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '修改前 JSON',
  `new_value` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '修改後 JSON',
  `metadata_json` text COLLATE utf8mb4_unicode_ci COMMENT '額外元數據',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_actor` (`actor`),
  KEY `idx_target` (`target_type`,`target_id`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `class_diary_daily_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `class_diary_daily_reports` (
  `id` int NOT NULL AUTO_INCREMENT,
  `report_date` date NOT NULL COMMENT '報告日期',
  `report_text` mediumtext COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'AI 生成的報告文本',
  `summary_text` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '摘要版報告（不含學生姓名）',
  `anomalies_json` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '異常記錄 JSON',
  `findings_json` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '結構化發現 JSON',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'pending' COMMENT 'pending/generating/done/failed',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `report_date` (`report_date`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `class_diary_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `class_diary_entries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `class_code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '班級代碼',
  `entry_date` date NOT NULL COMMENT '上課日期',
  `period_start` tinyint NOT NULL COMMENT '起始節數 0=早會,1-9',
  `period_end` tinyint NOT NULL COMMENT '結束節數',
  `subject` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '科目',
  `absent_students` text COLLATE utf8mb4_unicode_ci COMMENT '缺席學生',
  `late_students` text COLLATE utf8mb4_unicode_ci COMMENT '遲到學生',
  `discipline_rating` tinyint NOT NULL DEFAULT '0' COMMENT '紀律 1-5',
  `cleanliness_rating` tinyint NOT NULL DEFAULT '0' COMMENT '整潔 1-5',
  `commended_students` text COLLATE utf8mb4_unicode_ci COMMENT '嘉許學生',
  `appearance_issues` text COLLATE utf8mb4_unicode_ci COMMENT '儀表違規',
  `rule_violations` text COLLATE utf8mb4_unicode_ci COMMENT '課堂違規',
  `medical_room_students` text COLLATE utf8mb4_unicode_ci COMMENT '醫務室',
  `signature` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '手寫簽名 base64',
  `submitted_from` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '提交來源 UA',
  `submitted_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '提交者用戶名',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_class_date_period` (`class_code`,`entry_date`,`period_start`,`period_end`),
  KEY `idx_class_date` (`class_code`,`entry_date`),
  KEY `idx_date` (`entry_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `class_diary_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `class_diary_permissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'reviewer|class_teacher|report_recipient',
  `scope_json` text COLLATE utf8mb4_unicode_ci COMMENT '{"classes":["S1A"],"grades":["S1"]}',
  `granted_by` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_role` (`username`,`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `class_diary_range_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `class_diary_range_reports` (
  `id` int NOT NULL AUTO_INCREMENT,
  `start_date` date NOT NULL COMMENT '開始日期',
  `end_date` date NOT NULL COMMENT '結束日期',
  `report_text` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '完整版報告',
  `summary_text` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '摘要版報告',
  `anomalies_json` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '異常記錄 JSON',
  `findings_json` mediumtext COLLATE utf8mb4_unicode_ci COMMENT '結構化發現 JSON',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'pending' COMMENT 'pending/generating/done/failed',
  `requested_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '請求生成者',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_date_range` (`start_date`,`end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `class_diary_report_recipients`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `class_diary_report_recipients` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '報告接收人用戶名',
  `granted_by` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '授權管理員',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `class_diary_reviewers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `class_diary_reviewers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '被授權用戶名',
  `granted_by` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '授權管理員',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `classes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `classes` (
  `class_id` int NOT NULL AUTO_INCREMENT,
  `class_code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `class_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `grade` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `teacher_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `teacher_username` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '班主任 username',
  `vice_teacher_username` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '副班主任 username',
  PRIMARY KEY (`class_id`),
  UNIQUE KEY `class_code` (`class_code`),
  KEY `teacher_id` (`teacher_id`),
  CONSTRAINT `classes_ibfk_1` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `classroom_enrollments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `classroom_enrollments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `enrollment_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `room_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `student_id` int NOT NULL,
  `student_username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `joined_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `left_at` datetime DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `last_heartbeat` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `enrollment_id` (`enrollment_id`),
  UNIQUE KEY `uk_room_student` (`room_id`,`student_username`),
  KEY `idx_room` (`room_id`),
  KEY `idx_student` (`student_username`),
  KEY `idx_room_active` (`room_id`,`is_active`),
  KEY `student_id` (`student_id`),
  CONSTRAINT `classroom_enrollments_ibfk_1` FOREIGN KEY (`room_id`) REFERENCES `classroom_rooms` (`room_id`) ON DELETE CASCADE,
  CONSTRAINT `classroom_enrollments_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `classroom_pushes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `classroom_pushes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `push_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `room_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `page_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `page_number` int NOT NULL,
  `annotations_json` longtext COLLATE utf8mb4_unicode_ci,
  `pushed_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `push_id` (`push_id`),
  KEY `idx_room_time` (`room_id`,`pushed_at` DESC),
  CONSTRAINT `classroom_pushes_ibfk_1` FOREIGN KEY (`room_id`) REFERENCES `classroom_rooms` (`room_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `classroom_rooms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `classroom_rooms` (
  `id` int NOT NULL AUTO_INCREMENT,
  `room_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `teacher_id` int NOT NULL,
  `teacher_username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `allowed_classes` json NOT NULL,
  `current_ppt_file_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `room_status` enum('draft','active','paused','ended') COLLATE utf8mb4_unicode_ci DEFAULT 'draft',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `ended_at` datetime DEFAULT NULL,
  `is_deleted` tinyint(1) DEFAULT '0',
  `lesson_session_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `room_id` (`room_id`),
  KEY `idx_teacher` (`teacher_username`),
  KEY `idx_status` (`room_status`),
  KEY `idx_created` (`created_at` DESC),
  KEY `idx_not_deleted` (`is_deleted`,`room_status`),
  KEY `teacher_id` (`teacher_id`),
  CONSTRAINT `classroom_rooms_ibfk_1` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `conversations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conversations` (
  `conversation_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int NOT NULL,
  `username` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subject` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `messages` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `message_count` int DEFAULT '0',
  `is_archived` tinyint(1) DEFAULT '0',
  `is_deleted` tinyint(1) DEFAULT '0',
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`conversation_id`),
  UNIQUE KEY `uk_user_conv` (`username`,`conversation_id`),
  KEY `idx_user_conversations` (`user_id`,`updated_at`),
  KEY `idx_username` (`username`),
  KEY `idx_subject` (`subject`),
  CONSTRAINT `conversations_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `data_access_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `data_access_logs` (
  `access_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `accessed_user_id` int DEFAULT NULL,
  `access_type` enum('read','write','delete') COLLATE utf8mb4_unicode_ci NOT NULL,
  `data_category` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `purpose` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `legal_basis` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `timestamp` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`access_id`),
  KEY `accessed_user_id` (`accessed_user_id`),
  KEY `idx_access_user` (`user_id`),
  KEY `idx_access_timestamp` (`timestamp`),
  CONSTRAINT `data_access_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `data_access_logs_ibfk_2` FOREIGN KEY (`accessed_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `deletion_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `deletion_requests` (
  `request_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `request_date` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `reason` text COLLATE utf8mb4_unicode_ci,
  `status` enum('pending','approved','completed','rejected') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `processed_date` timestamp NULL DEFAULT NULL,
  `processed_by` int DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`request_id`),
  KEY `user_id` (`user_id`),
  KEY `processed_by` (`processed_by`),
  KEY `idx_deletion_status` (`status`),
  CONSTRAINT `deletion_requests_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `deletion_requests_ibfk_2` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `detention_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `detention_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_login` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `session_id` int DEFAULT NULL,
  `detention_date` date NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci,
  `duration_minutes` int DEFAULT '35',
  `completed` tinyint(1) DEFAULT '0',
  `completed_at` datetime DEFAULT NULL,
  `created_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_login`),
  KEY `idx_date` (`detention_date`),
  KEY `idx_completed` (`completed`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `exam_generation_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `exam_generation_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `session_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `teacher_username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `teacher_id` int NOT NULL,
  `subject` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('generating','generated','generation_failed') COLLATE utf8mb4_unicode_ci DEFAULT 'generating',
  `mode` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'generate' COMMENT '模式: generate|similar',
  `source_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '輸入來源: text|image',
  `question_count` int DEFAULT '5',
  `difficulty` int DEFAULT '3',
  `total_marks` int DEFAULT NULL,
  `target_points` json DEFAULT NULL COMMENT '目標知識點 codes',
  `question_types` json DEFAULT NULL COMMENT '指定題型列表',
  `exam_context` text COLLATE utf8mb4_unicode_ci COMMENT '考試場景(generate) / 原題文字(similar)',
  `questions` json DEFAULT NULL COMMENT '生成結果',
  `error_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `session_id` (`session_id`),
  KEY `idx_egs_teacher` (`teacher_username`),
  KEY `idx_egs_created` (`created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `exam_upload_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `exam_upload_batches` (
  `id` int NOT NULL AUTO_INCREMENT,
  `batch_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'UUID 批次號',
  `subject` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '科目',
  `status` enum('uploading','processing','completed','partial_failed','failed') COLLATE utf8mb4_unicode_ci DEFAULT 'uploading' COMMENT '批次聚合狀態',
  `total_files` int DEFAULT '0' COMMENT '文件總數',
  `completed_files` int DEFAULT '0' COMMENT '已完成文件數',
  `failed_files` int DEFAULT '0' COMMENT '失敗文件數',
  `total_questions` int DEFAULT '0' COMMENT '識別出的總題數',
  `low_confidence_count` int DEFAULT '0' COMMENT '低置信度題數',
  `created_by` int NOT NULL COMMENT '上傳教師 user.id',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `batch_id` (`batch_id`),
  KEY `idx_batch` (`batch_id`),
  KEY `idx_creator` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `exam_upload_files`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `exam_upload_files` (
  `id` int NOT NULL AUTO_INCREMENT,
  `batch_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '-> exam_upload_batches.batch_id',
  `original_filename` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `stored_filename` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'UUID 磁盤文件名',
  `file_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'image / pdf',
  `file_size` int DEFAULT '0' COMMENT '字節數',
  `total_pages` int DEFAULT '1' COMMENT 'PDF 頁數，圖片=1',
  `ocr_status` enum('pending','processing','completed','failed') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `ocr_result` json DEFAULT NULL COMMENT '識別結果',
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `processed_at` datetime DEFAULT NULL COMMENT '處理完成時間',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_euf_batch` (`batch_id`),
  KEY `idx_euf_status` (`ocr_status`),
  CONSTRAINT `exam_upload_files_ibfk_1` FOREIGN KEY (`batch_id`) REFERENCES `exam_upload_batches` (`batch_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `farm_game_scores`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `farm_game_scores` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_id` int NOT NULL COMMENT '用戶ID (users.id)',
  `student_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '顯示名稱',
  `class_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT '' COMMENT '班級',
  `result` enum('completed','bankrupt','redline') COLLATE utf8mb4_unicode_ci NOT NULL,
  `score` int NOT NULL COMMENT '總分',
  `final_money` int NOT NULL COMMENT '最終資金',
  `final_tech` int NOT NULL DEFAULT '0' COMMENT '科技等級',
  `final_land` int NOT NULL DEFAULT '6' COMMENT '剩餘耕地',
  `turns_played` int NOT NULL DEFAULT '30' COMMENT '回合數',
  `reserve_policy` tinyint(1) DEFAULT '0' COMMENT '是否啟動收儲計畫',
  `feedback_tags` json DEFAULT NULL COMMENT '學習反饋標籤',
  `played_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_student` (`student_id`),
  KEY `idx_class` (`class_name`),
  KEY `idx_played` (`played_at`),
  KEY `idx_score` (`score`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='神州菜園經營家遊戲成績';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `forum_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `forum_attachments` (
  `attachment_id` int NOT NULL AUTO_INCREMENT,
  `post_id` int DEFAULT NULL,
  `reply_id` int DEFAULT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` int unsigned NOT NULL,
  `file_type` enum('image','document','video','audio','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other',
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `upload_username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`attachment_id`),
  KEY `fk_attachment_uploader` (`upload_username`),
  KEY `idx_attachment_post` (`post_id`),
  KEY `idx_attachment_reply` (`reply_id`),
  KEY `idx_attachment_type` (`file_type`),
  CONSTRAINT `fk_attachment_post` FOREIGN KEY (`post_id`) REFERENCES `forum_posts` (`post_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_attachment_reply` FOREIGN KEY (`reply_id`) REFERENCES `forum_replies` (`reply_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_attachment_uploader` FOREIGN KEY (`upload_username`) REFERENCES `users` (`username`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `forum_notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `forum_notifications` (
  `notification_id` int NOT NULL AUTO_INCREMENT,
  `user_username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `post_id` int DEFAULT NULL,
  `reply_id` int DEFAULT NULL,
  `notification_type` enum('new_reply','new_post','mention','instructor_response','answer_accepted','upvote') COLLATE utf8mb4_unicode_ci NOT NULL,
  `related_username` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `read_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`),
  KEY `fk_notification_post` (`post_id`),
  KEY `fk_notification_reply` (`reply_id`),
  KEY `fk_notification_related` (`related_username`),
  KEY `idx_notification_user_unread` (`user_username`,`is_read`,`created_at` DESC),
  KEY `idx_notification_created` (`created_at` DESC),
  KEY `idx_notification_type` (`notification_type`),
  CONSTRAINT `fk_notification_post` FOREIGN KEY (`post_id`) REFERENCES `forum_posts` (`post_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_notification_related` FOREIGN KEY (`related_username`) REFERENCES `users` (`username`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_notification_reply` FOREIGN KEY (`reply_id`) REFERENCES `forum_replies` (`reply_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_notification_user` FOREIGN KEY (`user_username`) REFERENCES `users` (`username`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `forum_posts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `forum_posts` (
  `post_id` int NOT NULL AUTO_INCREMENT,
  `author_username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `content_html` longtext COLLATE utf8mb4_unicode_ci,
  `post_type` enum('discussion','question','announcement') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'discussion',
  `visibility` enum('public','private') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'public',
  `is_anonymous` tinyint(1) NOT NULL DEFAULT '0',
  `anonymous_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_pinned` tinyint(1) NOT NULL DEFAULT '0',
  `is_locked` tinyint(1) NOT NULL DEFAULT '0',
  `is_resolved` tinyint(1) NOT NULL DEFAULT '0',
  `view_count` int unsigned NOT NULL DEFAULT '0',
  `reply_count` int unsigned NOT NULL DEFAULT '0',
  `upvote_count` int unsigned NOT NULL DEFAULT '0',
  `tags` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  PRIMARY KEY (`post_id`),
  KEY `idx_post_author` (`author_username`),
  KEY `idx_post_visibility_deleted` (`visibility`,`is_deleted`),
  KEY `idx_post_type` (`post_type`),
  KEY `idx_post_created` (`created_at` DESC),
  KEY `idx_post_pinned` (`is_pinned` DESC,`created_at` DESC),
  KEY `idx_post_upvote` (`upvote_count` DESC),
  FULLTEXT KEY `ft_post_search` (`title`,`content`),
  CONSTRAINT `fk_post_author` FOREIGN KEY (`author_username`) REFERENCES `users` (`username`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `forum_replies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `forum_replies` (
  `reply_id` int NOT NULL AUTO_INCREMENT,
  `post_id` int NOT NULL,
  `parent_reply_id` int DEFAULT NULL,
  `author_username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `content_html` longtext COLLATE utf8mb4_unicode_ci,
  `is_anonymous` tinyint(1) NOT NULL DEFAULT '0',
  `anonymous_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_instructor_response` tinyint(1) NOT NULL DEFAULT '0',
  `is_accepted_answer` tinyint(1) NOT NULL DEFAULT '0',
  `upvote_count` int unsigned NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  PRIMARY KEY (`reply_id`),
  KEY `idx_reply_post` (`post_id`,`created_at`),
  KEY `idx_reply_author` (`author_username`),
  KEY `idx_reply_parent` (`parent_reply_id`),
  KEY `idx_reply_instructor` (`is_instructor_response`),
  KEY `idx_reply_accepted` (`is_accepted_answer`),
  CONSTRAINT `fk_reply_author` FOREIGN KEY (`author_username`) REFERENCES `users` (`username`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_reply_parent` FOREIGN KEY (`parent_reply_id`) REFERENCES `forum_replies` (`reply_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_reply_post` FOREIGN KEY (`post_id`) REFERENCES `forum_posts` (`post_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `forum_subscriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `forum_subscriptions` (
  `subscription_id` int NOT NULL AUTO_INCREMENT,
  `user_username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `post_id` int DEFAULT NULL,
  `tag_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`subscription_id`),
  UNIQUE KEY `uk_user_post` (`user_username`,`post_id`),
  UNIQUE KEY `uk_user_tag` (`user_username`,`tag_name`),
  KEY `idx_subscription_user` (`user_username`),
  KEY `idx_subscription_post` (`post_id`),
  KEY `idx_subscription_tag` (`tag_name`),
  CONSTRAINT `fk_subscription_post` FOREIGN KEY (`post_id`) REFERENCES `forum_posts` (`post_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_subscription_user` FOREIGN KEY (`user_username`) REFERENCES `users` (`username`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `forum_tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `forum_tags` (
  `tag_id` int NOT NULL AUTO_INCREMENT,
  `tag_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tag_description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tag_color` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT '#006633',
  `usage_count` int unsigned NOT NULL DEFAULT '0',
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`tag_id`),
  UNIQUE KEY `uk_tag_name` (`tag_name`),
  KEY `fk_tag_creator` (`created_by`),
  KEY `idx_tag_usage` (`usage_count` DESC),
  CONSTRAINT `fk_tag_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`username`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `forum_user_preferences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `forum_user_preferences` (
  `preference_id` int NOT NULL AUTO_INCREMENT,
  `user_username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `notify_new_reply` tinyint(1) NOT NULL DEFAULT '1',
  `notify_mention` tinyint(1) NOT NULL DEFAULT '1',
  `notify_instructor_response` tinyint(1) NOT NULL DEFAULT '1',
  `notify_upvote` tinyint(1) NOT NULL DEFAULT '0',
  `email_digest` enum('none','daily','weekly') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
  `default_sort` enum('newest','oldest','most_upvoted','most_replied') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'newest',
  `posts_per_page` int unsigned NOT NULL DEFAULT '20',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`preference_id`),
  UNIQUE KEY `user_username` (`user_username`),
  CONSTRAINT `fk_preference_user` FOREIGN KEY (`user_username`) REFERENCES `users` (`username`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `forum_votes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `forum_votes` (
  `vote_id` int NOT NULL AUTO_INCREMENT,
  `post_id` int DEFAULT NULL,
  `reply_id` int DEFAULT NULL,
  `voter_username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vote_type` enum('upvote','downvote') COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`vote_id`),
  UNIQUE KEY `uk_post_vote` (`post_id`,`voter_username`),
  UNIQUE KEY `uk_reply_vote` (`reply_id`,`voter_username`),
  KEY `idx_vote_voter` (`voter_username`),
  KEY `idx_vote_created` (`created_at` DESC),
  CONSTRAINT `fk_vote_post` FOREIGN KEY (`post_id`) REFERENCES `forum_posts` (`post_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_vote_reply` FOREIGN KEY (`reply_id`) REFERENCES `forum_replies` (`reply_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_vote_voter` FOREIGN KEY (`voter_username`) REFERENCES `users` (`username`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `game_share_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `game_share_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `token` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `game_uuid` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `creator_id` int NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`),
  KEY `idx_token` (`token`),
  KEY `idx_game` (`game_uuid`),
  KEY `idx_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='游戏分享 Token';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `knowledge_index`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knowledge_index` (
  `id` int NOT NULL AUTO_INCREMENT,
  `subject_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` text COLLATE utf8mb4_unicode_ci,
  `content_hash` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_subject_file` (`subject_code`,`file_name`),
  KEY `idx_subject` (`subject_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `knowledge_points`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `knowledge_points` (
  `id` int NOT NULL AUTO_INCREMENT,
  `subject` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `point_code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `point_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `grade_levels` json DEFAULT NULL,
  `parent_code` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `difficulty_level` int DEFAULT '1',
  `display_order` int DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `point_code` (`point_code`),
  KEY `idx_subject` (`subject`),
  KEY `idx_category` (`subject`,`category`),
  KEY `idx_parent` (`parent_code`),
  KEY `idx_active` (`is_active`,`subject`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `lc_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lc_categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `icon` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 0xF09F9381,
  `description` text COLLATE utf8mb4_unicode_ci,
  `parent_id` int DEFAULT NULL,
  `sort_order` int DEFAULT '0',
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` tinyint(1) DEFAULT '0',
  `subject_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '????',
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`),
  KEY `idx_parent` (`parent_id`),
  KEY `idx_sort` (`sort_order`),
  KEY `idx_deleted` (`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `lc_content_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lc_content_categories` (
  `content_id` int NOT NULL,
  `category_id` int NOT NULL,
  PRIMARY KEY (`content_id`,`category_id`),
  KEY `category_id` (`category_id`),
  CONSTRAINT `lc_content_categories_ibfk_1` FOREIGN KEY (`content_id`) REFERENCES `lc_contents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `lc_content_categories_ibfk_2` FOREIGN KEY (`category_id`) REFERENCES `lc_categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `lc_contents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lc_contents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `content_type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_size` bigint DEFAULT '0',
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `external_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `video_platform` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `embed_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `article_content` longtext COLLATE utf8mb4_unicode_ci,
  `thumbnail_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration` int DEFAULT '0',
  `tags` json DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'draft',
  `sort_order` int DEFAULT '0' COMMENT 'µÄÆÕ║ÅµØâÚçì´╝êÞÂèÕ░ÅÞÂèÚØáÕëì´╝ë',
  `view_count` int DEFAULT '0',
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` tinyint(1) DEFAULT '0',
  `ai_analysis_status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'AI Õêåµ×ÉþèÂµÇü: pending, processing, completed, failed',
  `ai_analysis_error` text COLLATE utf8mb4_unicode_ci COMMENT 'Õêåµ×ÉÕñ▒Þ┤ÑµùÂþÜäÚöÖÞ»»õ┐íµü»',
  `ai_analysis_at` datetime DEFAULT NULL COMMENT 'µ£ÇÕÉÄõ©Çµ¼íÕêåµ×ÉµùÂÚù┤µê│',
  `subject_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '????',
  `grade_level` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '??',
  `preview_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'PDF ÚóäÞºêµûçõ╗ÂÞÀ»Õ¥ä',
  PRIMARY KEY (`id`),
  KEY `idx_type` (`content_type`),
  KEY `idx_status` (`status`),
  KEY `idx_created` (`created_at` DESC),
  KEY `idx_deleted` (`is_deleted`),
  KEY `idx_sort_order` (`sort_order`),
  FULLTEXT KEY `idx_search` (`title`,`description`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `lc_knowledge_edges`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lc_knowledge_edges` (
  `id` int NOT NULL AUTO_INCREMENT,
  `source_node_id` int NOT NULL,
  `target_node_id` int NOT NULL,
  `relation_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'related',
  `label` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `weight` float DEFAULT '1',
  `subject_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '????',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_edge` (`source_node_id`,`target_node_id`),
  KEY `target_node_id` (`target_node_id`),
  CONSTRAINT `lc_knowledge_edges_ibfk_1` FOREIGN KEY (`source_node_id`) REFERENCES `lc_knowledge_nodes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `lc_knowledge_edges_ibfk_2` FOREIGN KEY (`target_node_id`) REFERENCES `lc_knowledge_nodes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `lc_knowledge_nodes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lc_knowledge_nodes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `icon` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 0xF09F92A1,
  `color` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT '#006633',
  `node_size` int DEFAULT '40',
  `position_x` float DEFAULT NULL,
  `position_y` float DEFAULT NULL,
  `is_pinned` tinyint(1) DEFAULT '0',
  `category_id` int DEFAULT NULL,
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` tinyint(1) DEFAULT '0',
  `subject_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '????',
  `grade_level` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '??',
  PRIMARY KEY (`id`),
  KEY `idx_category` (`category_id`),
  KEY `idx_deleted` (`is_deleted`),
  CONSTRAINT `lc_knowledge_nodes_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `lc_categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `lc_learning_paths`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lc_learning_paths` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `icon` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 0xF09F97BAEFB88F,
  `cover_image` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `difficulty` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'beginner',
  `estimated_hours` float DEFAULT '0',
  `tags` json DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'draft',
  `sort_order` int DEFAULT '0',
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` tinyint(1) DEFAULT '0',
  `subject_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '????',
  `grade_level` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '??',
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`),
  KEY `idx_difficulty` (`difficulty`),
  KEY `idx_deleted` (`is_deleted`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `lc_node_contents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lc_node_contents` (
  `node_id` int NOT NULL,
  `content_id` int NOT NULL,
  `sort_order` int DEFAULT '0',
  `anchor` json DEFAULT NULL COMMENT '定位锚点 JSON',
  PRIMARY KEY (`node_id`,`content_id`),
  KEY `content_id` (`content_id`),
  CONSTRAINT `lc_node_contents_ibfk_1` FOREIGN KEY (`node_id`) REFERENCES `lc_knowledge_nodes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `lc_node_contents_ibfk_2` FOREIGN KEY (`content_id`) REFERENCES `lc_contents` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `lc_path_steps`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lc_path_steps` (
  `id` int NOT NULL AUTO_INCREMENT,
  `path_id` int NOT NULL,
  `step_order` int NOT NULL DEFAULT '0',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `content_id` int DEFAULT NULL,
  `node_id` int DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_path_order` (`path_id`,`step_order`),
  KEY `content_id` (`content_id`),
  KEY `node_id` (`node_id`),
  CONSTRAINT `lc_path_steps_ibfk_1` FOREIGN KEY (`path_id`) REFERENCES `lc_learning_paths` (`id`) ON DELETE CASCADE,
  CONSTRAINT `lc_path_steps_ibfk_2` FOREIGN KEY (`content_id`) REFERENCES `lc_contents` (`id`) ON DELETE SET NULL,
  CONSTRAINT `lc_path_steps_ibfk_3` FOREIGN KEY (`node_id`) REFERENCES `lc_knowledge_nodes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `learning_analytics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `learning_analytics` (
  `analytics_id` int NOT NULL AUTO_INCREMENT,
  `user_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subject_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `session_date` date DEFAULT NULL,
  `metrics` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`analytics_id`),
  KEY `idx_analytics_date` (`session_date`),
  KEY `idx_analytics_subject` (`subject_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `learning_task_completions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `learning_task_completions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `task_id` int NOT NULL,
  `username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `item_id` int DEFAULT NULL,
  `is_completed` tinyint(1) DEFAULT '0',
  `completed_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_task_user_item` (`task_id`,`username`,`item_id`),
  KEY `idx_task_id` (`task_id`),
  KEY `idx_username` (`username`),
  KEY `idx_completed` (`is_completed`),
  CONSTRAINT `learning_task_completions_ibfk_1` FOREIGN KEY (`task_id`) REFERENCES `learning_tasks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `learning_task_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `learning_task_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `task_id` int NOT NULL,
  `item_order` int DEFAULT '0',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `link_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `link_label` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tag` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_task_id` (`task_id`),
  KEY `idx_task_order` (`task_id`,`item_order`),
  CONSTRAINT `learning_task_items_ibfk_1` FOREIGN KEY (`task_id`) REFERENCES `learning_tasks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `learning_tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `learning_tasks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `content` text COLLATE utf8mb4_unicode_ci,
  `category` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'general',
  `priority` int DEFAULT '1',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'draft',
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'all',
  `target_value` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `total_recipients` int DEFAULT '0',
  `completed_count` int DEFAULT '0',
  `attachments` json DEFAULT NULL,
  `deadline` datetime DEFAULT NULL,
  `published_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_by` (`created_by`),
  KEY `idx_target` (`target_type`,`target_value`),
  KEY `idx_deadline` (`deadline`),
  KEY `idx_published` (`published_at`),
  KEY `idx_deleted` (`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `lesson_plans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lesson_plans` (
  `id` int NOT NULL AUTO_INCREMENT,
  `plan_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `teacher_username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_slides` int DEFAULT '0',
  `status` enum('draft','ready','archived') COLLATE utf8mb4_unicode_ci DEFAULT 'draft',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` tinyint(1) DEFAULT '0',
  `room_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '→ classroom_rooms.room_id (NULL=旧数据/全局)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_plan_id` (`plan_id`),
  KEY `idx_teacher` (`teacher_username`),
  KEY `idx_status` (`status`),
  KEY `idx_room_id` (`room_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `lesson_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lesson_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `session_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `room_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `plan_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('pending','live','paused','ended') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `current_slide_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `current_slide_order` int DEFAULT '-1',
  `slide_lifecycle` enum('prepared','activated','responding','closed','results_shown','completed') COLLATE utf8mb4_unicode_ci DEFAULT 'prepared',
  `slide_started_at` datetime DEFAULT NULL,
  `slide_ends_at` datetime DEFAULT NULL,
  `accepting_responses` tinyint(1) DEFAULT '0',
  `annotations_json` longtext COLLATE utf8mb4_unicode_ci,
  `runtime_meta` json DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `ended_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_session_id` (`session_id`),
  KEY `idx_room` (`room_id`),
  KEY `idx_room_status` (`room_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `lesson_slide_responses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lesson_slide_responses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `response_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `session_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slide_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `student_username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `response_type` enum('quiz_answer','quick_answer','raise_hand','poll_vote','game_score','interactive_response') COLLATE utf8mb4_unicode_ci NOT NULL,
  `response_data` json NOT NULL,
  `is_correct` tinyint(1) DEFAULT NULL,
  `score` decimal(8,2) DEFAULT NULL,
  `responded_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_response_id` (`response_id`),
  UNIQUE KEY `uk_one_response` (`session_id`,`slide_id`,`student_username`,`response_type`),
  KEY `idx_session_slide` (`session_id`,`slide_id`),
  KEY `idx_student` (`student_username`,`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `lesson_slides`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lesson_slides` (
  `id` int NOT NULL AUTO_INCREMENT,
  `slide_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `plan_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slide_order` int NOT NULL,
  `slide_type` enum('ppt','game','quiz','quick_answer','raise_hand','poll','link','interactive') COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `config` json NOT NULL,
  `config_version` int DEFAULT '1',
  `duration_seconds` int DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_slide_id` (`slide_id`),
  UNIQUE KEY `uk_plan_order` (`plan_id`,`slide_order`),
  CONSTRAINT `lesson_slides_ibfk_1` FOREIGN KEY (`plan_id`) REFERENCES `lesson_plans` (`plan_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `mastery_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `mastery_snapshots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `point_code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subject` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mastery_level` int NOT NULL,
  `trigger_type` enum('mistake','practice','review') COLLATE utf8mb4_unicode_ci NOT NULL,
  `trigger_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_student_point_time` (`student_username`,`point_code`,`created_at`),
  KEY `idx_student_subject_time` (`student_username`,`subject`,`created_at` DESC),
  KEY `idx_trigger` (`trigger_type`,`trigger_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `messages` (
  `message_id` int NOT NULL AUTO_INCREMENT,
  `conversation_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('user','assistant','system') COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `content_encrypted` text COLLATE utf8mb4_unicode_ci,
  `thinking` text COLLATE utf8mb4_unicode_ci,
  `timestamp` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `token_count` int DEFAULT NULL,
  `model_used` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_flagged` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`message_id`),
  KEY `idx_conversation_messages` (`conversation_id`,`timestamp`),
  CONSTRAINT `messages_ibfk_1` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`conversation_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `mistake_knowledge_links`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `mistake_knowledge_links` (
  `id` int NOT NULL AUTO_INCREMENT,
  `mistake_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `point_code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `relevance_score` float DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_mistake_point` (`mistake_id`,`point_code`),
  KEY `idx_point` (`point_code`),
  KEY `idx_mistake` (`mistake_id`),
  CONSTRAINT `mistake_knowledge_links_ibfk_1` FOREIGN KEY (`mistake_id`) REFERENCES `student_mistakes` (`mistake_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `mistake_review_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `mistake_review_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `mistake_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `student_username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `review_type` enum('flashcard','reattempt','practice') COLLATE utf8mb4_unicode_ci DEFAULT 'flashcard',
  `result` enum('remembered','forgot','partial') COLLATE utf8mb4_unicode_ci NOT NULL,
  `time_spent_seconds` int DEFAULT NULL,
  `reviewed_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_mistake` (`mistake_id`),
  KEY `idx_student_date` (`student_username`,`reviewed_at` DESC),
  CONSTRAINT `mistake_review_log_ibfk_1` FOREIGN KEY (`mistake_id`) REFERENCES `student_mistakes` (`mistake_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `password_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `password_history` (
  `history_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `changed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `changed_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`history_id`),
  KEY `idx_password_user` (`user_id`),
  CONSTRAINT `password_history_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `plagiarism_pairs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `plagiarism_pairs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `report_id` int NOT NULL COMMENT '報告ID',
  `submission_a_id` int NOT NULL COMMENT '提交A',
  `submission_b_id` int NOT NULL COMMENT '提交B',
  `student_a_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT '' COMMENT '學生A名',
  `student_b_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT '' COMMENT '學生B名',
  `similarity_score` decimal(5,2) NOT NULL COMMENT '相似度 0-100',
  `matched_fragments` json DEFAULT NULL COMMENT '匹配片段詳情',
  `ai_analysis` text COLLATE utf8mb4_unicode_ci COMMENT 'AI 分析說明',
  `is_flagged` tinyint(1) DEFAULT '0' COMMENT '是否標記為可疑',
  PRIMARY KEY (`id`),
  KEY `idx_plag_report` (`report_id`),
  KEY `idx_plag_flagged` (`report_id`,`is_flagged`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `plagiarism_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `plagiarism_reports` (
  `id` int NOT NULL AUTO_INCREMENT,
  `assignment_id` int NOT NULL COMMENT '作業ID',
  `status` enum('pending','running','completed','failed') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `threshold` decimal(5,2) DEFAULT '60.00' COMMENT '相似度閾值',
  `subject` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT '' COMMENT '科目代碼',
  `detect_mode` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'mixed' COMMENT '作業類型 code/text/mixed',
  `total_pairs` int DEFAULT '0' COMMENT '對比總對數',
  `flagged_pairs` int DEFAULT '0' COMMENT '標記可疑對數',
  `created_by` int DEFAULT NULL COMMENT '發起教師ID',
  `error_message` text COLLATE utf8mb4_unicode_ci COMMENT '錯誤資訊',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `completed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_plag_assignment` (`assignment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `ppt_files`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ppt_files` (
  `id` int NOT NULL AUTO_INCREMENT,
  `file_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `room_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '→ classroom_rooms.room_id (NULL=课案直传)',
  `teacher_username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_filename` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `stored_path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` bigint NOT NULL,
  `total_pages` int DEFAULT '0',
  `process_status` enum('pending','processing','completed','failed') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `uploaded_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `processed_at` datetime DEFAULT NULL,
  `is_deleted` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `file_id` (`file_id`),
  KEY `idx_room` (`room_id`),
  KEY `idx_status` (`process_status`),
  KEY `idx_teacher` (`teacher_username`),
  CONSTRAINT `ppt_files_ibfk_1` FOREIGN KEY (`room_id`) REFERENCES `classroom_rooms` (`room_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `ppt_pages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ppt_pages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `page_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `page_number` int NOT NULL,
  `image_path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `thumbnail_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `text_content` longtext COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `page_id` (`page_id`),
  KEY `idx_file_page` (`file_id`,`page_number`),
  CONSTRAINT `ppt_pages_ibfk_1` FOREIGN KEY (`file_id`) REFERENCES `ppt_files` (`file_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `practice_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `practice_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `session_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `student_username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subject` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `session_type` enum('targeted','review','challenge','exam_prep') COLLATE utf8mb4_unicode_ci DEFAULT 'targeted',
  `target_points` json DEFAULT NULL,
  `questions` json NOT NULL,
  `total_questions` int DEFAULT '0',
  `student_answers` json DEFAULT NULL,
  `correct_count` int DEFAULT '0',
  `score` float DEFAULT NULL,
  `ai_feedback` text COLLATE utf8mb4_unicode_ci,
  `weak_points_identified` json DEFAULT NULL,
  `status` enum('generating','generated','in_progress','completed','expired','generation_failed') COLLATE utf8mb4_unicode_ci DEFAULT 'generated',
  `error_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '錯誤代碼',
  `error_message` text COLLATE utf8mb4_unicode_ci COMMENT '錯誤訊息',
  `started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `session_id` (`session_id`),
  KEY `idx_student` (`student_username`,`subject`),
  KEY `idx_status` (`student_username`,`status`),
  KEY `idx_created` (`created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `query_cache`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `query_cache` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cache_key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cache_value` json DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cache_key` (`cache_key`),
  KEY `idx_cache_key` (`cache_key`),
  KEY `idx_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `resource_group_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `resource_group_members` (
  `id` int NOT NULL AUTO_INCREMENT,
  `group_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `teacher_username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `joined_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `is_active` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_group_teacher` (`group_id`,`teacher_username`),
  KEY `idx_teacher` (`teacher_username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `resource_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `resource_groups` (
  `id` int NOT NULL AUTO_INCREMENT,
  `group_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `group_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '管理员 username',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_group_id` (`group_id`),
  KEY `idx_created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `security_audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `security_audit_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `action` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '操作類型: UPDATE_API_KEY, UPDATE_API_MODEL ...',
  `actor` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '操作人 username',
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '來源 IP',
  `details_json` json DEFAULT NULL COMMENT '附加資訊（不含原文 Key）',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sa_actor` (`actor`),
  KEY `idx_sa_action` (`action`),
  KEY `idx_sa_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
  `session_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int NOT NULL,
  `token_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`session_id`),
  KEY `idx_session_user` (`user_id`),
  KEY `idx_session_expires` (`expires_at`),
  CONSTRAINT `sessions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `shared_resource_slides`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `shared_resource_slides` (
  `id` int NOT NULL AUTO_INCREMENT,
  `share_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slide_order` int NOT NULL,
  `slide_type` enum('ppt','game','quiz','quick_answer','raise_hand','poll','link','interactive') COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `config` json NOT NULL,
  `config_version` int DEFAULT '1',
  `duration_seconds` int DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_share` (`share_id`),
  CONSTRAINT `shared_resource_slides_ibfk_1` FOREIGN KEY (`share_id`) REFERENCES `shared_resources` (`share_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `shared_resources`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `shared_resources` (
  `id` int NOT NULL AUTO_INCREMENT,
  `share_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_plan_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '原始 plan_id (溯源)',
  `source_room_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '原始课堂 (溯源)',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `teacher_username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '分享者',
  `teacher_display_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT '' COMMENT '分享当下的显示名 (快照)',
  `subject_tag` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `total_slides` int DEFAULT '0',
  `thumbnail_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT '' COMMENT '第一页 PPT 缩略图路径',
  `share_scope` enum('group','school') COLLATE utf8mb4_unicode_ci NOT NULL,
  `group_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'scope=group 时必填',
  `clone_count` int DEFAULT '0',
  `status` enum('active','archived') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `shared_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_share_id` (`share_id`),
  KEY `idx_teacher` (`teacher_username`),
  KEY `idx_scope` (`share_scope`,`status`),
  KEY `idx_group` (`group_id`),
  KEY `idx_source_plan` (`source_plan_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `slc_contents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `slc_contents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `content_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'document' COMMENT 'document | video_local | video_external | article | image',
  `file_path` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_name` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_size` bigint DEFAULT NULL,
  `mime_type` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `external_url` varchar(2000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `video_platform` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `article_content` longtext COLLATE utf8mb4_unicode_ci,
  `thumbnail_path` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration` int DEFAULT NULL COMMENT 'µùÂÚò┐(þºÆ)',
  `tags` json DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft' COMMENT 'draft | published | archived',
  `sort_order` int DEFAULT '0',
  `view_count` int DEFAULT '0',
  `subject_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'þºæþø«õ╗úþáü(Õ┐àÕí½)',
  `grade_level` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Õ╣┤þ║º: õ©¡õ©Ç~õ©¡Õà¡',
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` tinyint DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_slc_contents_subject` (`subject_code`),
  KEY `idx_slc_contents_grade` (`grade_level`),
  KEY `idx_slc_contents_status` (`status`),
  KEY `idx_slc_contents_type` (`content_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `slc_knowledge_edges`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `slc_knowledge_edges` (
  `id` int NOT NULL AUTO_INCREMENT,
  `source_node_id` int NOT NULL,
  `target_node_id` int NOT NULL,
  `relation_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT 'related',
  `label` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `weight` float DEFAULT '1',
  `subject_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_deleted` tinyint DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `source_node_id` (`source_node_id`),
  KEY `target_node_id` (`target_node_id`),
  CONSTRAINT `slc_knowledge_edges_ibfk_1` FOREIGN KEY (`source_node_id`) REFERENCES `slc_knowledge_nodes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `slc_knowledge_edges_ibfk_2` FOREIGN KEY (`target_node_id`) REFERENCES `slc_knowledge_nodes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `slc_knowledge_nodes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `slc_knowledge_nodes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `icon` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT '­ƒôî',
  `color` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT '#006633',
  `node_size` int DEFAULT '40',
  `category_id` int DEFAULT NULL,
  `position_x` float DEFAULT '0',
  `position_y` float DEFAULT '0',
  `is_pinned` tinyint DEFAULT '0',
  `subject_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'þºæþø«õ╗úþáü(Õ┐àÕí½)',
  `grade_level` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` tinyint DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_slc_nodes_subject` (`subject_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `slc_learning_paths`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `slc_learning_paths` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `icon` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT '­ƒÄ»',
  `difficulty` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'beginner' COMMENT 'beginner | intermediate | advanced',
  `estimated_hours` float DEFAULT '1',
  `tags` json DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `subject_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'þºæþø«õ╗úþáü(Õ┐àÕí½)',
  `grade_level` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` tinyint DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_slc_paths_subject` (`subject_code`),
  KEY `idx_slc_paths_grade` (`grade_level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `slc_node_contents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `slc_node_contents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `node_id` int NOT NULL,
  `content_id` int NOT NULL,
  `sort_order` int DEFAULT '0',
  `anchor` json DEFAULT NULL COMMENT 'Õ«Üõ¢ìÚöÜþé╣, Õªé {"type":"page","value":5}',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_slc_node_content` (`node_id`,`content_id`),
  KEY `content_id` (`content_id`),
  CONSTRAINT `slc_node_contents_ibfk_1` FOREIGN KEY (`node_id`) REFERENCES `slc_knowledge_nodes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `slc_node_contents_ibfk_2` FOREIGN KEY (`content_id`) REFERENCES `slc_contents` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `slc_path_steps`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `slc_path_steps` (
  `id` int NOT NULL AUTO_INCREMENT,
  `path_id` int NOT NULL,
  `step_order` int DEFAULT '0',
  `title` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `content_id` int DEFAULT NULL,
  `node_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `path_id` (`path_id`),
  CONSTRAINT `slc_path_steps_ibfk_1` FOREIGN KEY (`path_id`) REFERENCES `slc_learning_paths` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `student_analysis_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `student_analysis_reports` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subject` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `overall_summary` text COLLATE utf8mb4_unicode_ci,
  `overall_assessment` text COLLATE utf8mb4_unicode_ci,
  `risk_level` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'normal',
  `full_analysis_json` longtext COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_student_subject` (`student_id`,`subject`),
  KEY `idx_student` (`student_id`),
  KEY `idx_updated` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='??????';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `student_knowledge_mastery`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `student_knowledge_mastery` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `point_code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subject` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mastery_level` int DEFAULT '50',
  `total_mistakes` int DEFAULT '0',
  `resolved_mistakes` int DEFAULT '0',
  `total_practices` int DEFAULT '0',
  `correct_practices` int DEFAULT '0',
  `last_mistake_at` datetime DEFAULT NULL,
  `last_practice_at` datetime DEFAULT NULL,
  `trend` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'stable',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_student_point` (`student_username`,`point_code`),
  KEY `idx_student_subject` (`student_username`,`subject`),
  KEY `idx_mastery` (`student_username`,`mastery_level`),
  KEY `idx_trend` (`student_username`,`trend`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `student_mistakes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `student_mistakes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `mistake_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `student_username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subject` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_image_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ocr_question_text` text COLLATE utf8mb4_unicode_ci,
  `ocr_answer_text` text COLLATE utf8mb4_unicode_ci,
  `manual_question_text` text COLLATE utf8mb4_unicode_ci,
  `manual_answer_text` text COLLATE utf8mb4_unicode_ci,
  `correct_answer` text COLLATE utf8mb4_unicode_ci,
  `ai_analysis` text COLLATE utf8mb4_unicode_ci,
  `improvement_tips` json DEFAULT NULL,
  `key_insight` text COLLATE utf8mb4_unicode_ci,
  `error_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `difficulty_level` int DEFAULT '1',
  `confidence_score` float DEFAULT NULL,
  `status` enum('pending_ocr','pending_review','analyzed','practicing','mastered','processing','ocr_failed','needs_review','analysis_failed','cancelled','analyzing') COLLATE utf8mb4_unicode_ci DEFAULT 'pending_ocr',
  `review_count` int DEFAULT '0',
  `last_review_at` datetime DEFAULT NULL,
  `next_review_at` datetime DEFAULT NULL,
  `mastery_level` int DEFAULT '0',
  `source` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'photo',
  `tags` json DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `mistake_id` (`mistake_id`),
  KEY `idx_student_subject` (`student_username`,`subject`),
  KEY `idx_student_status` (`student_username`,`status`),
  KEY `idx_student_category` (`student_username`,`subject`,`category`),
  KEY `idx_next_review` (`student_username`,`next_review_at`),
  KEY `idx_created` (`created_at` DESC),
  KEY `idx_not_deleted` (`student_username`,`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `subjects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subjects` (
  `id` int NOT NULL AUTO_INCREMENT,
  `subject_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subject_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `config` json DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `subject_code` (`subject_code`),
  KEY `idx_subject_code` (`subject_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `submission_answer_files`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `submission_answer_files` (
  `id` int NOT NULL AUTO_INCREMENT,
  `answer_id` int NOT NULL COMMENT 'submission_answers.id',
  `original_name` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `stored_name` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(1000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` bigint DEFAULT '0',
  `file_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `mime_type` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `uploaded_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_saf_answer` (`answer_id`),
  CONSTRAINT `fk_answer_file_answer` FOREIGN KEY (`answer_id`) REFERENCES `submission_answers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `submission_answers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `submission_answers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `submission_id` int NOT NULL,
  `question_id` int NOT NULL,
  `answer_text` text COLLATE utf8mb4_unicode_ci COMMENT '學生作答',
  `is_correct` tinyint(1) DEFAULT NULL COMMENT 'MC 自動判定',
  `points` decimal(5,1) DEFAULT NULL COMMENT '最終得分',
  `ai_points` decimal(5,1) DEFAULT NULL COMMENT 'AI 建議分',
  `ai_feedback` text COLLATE utf8mb4_unicode_ci COMMENT 'AI 批改反饋',
  `teacher_feedback` text COLLATE utf8mb4_unicode_ci COMMENT '老師批改反饋',
  `score_source` enum('auto','ai','teacher') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '分數來源',
  `graded_at` datetime DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL COMMENT '老師覆核時間',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sub_question` (`submission_id`,`question_id`),
  KEY `fk_answer_question` (`question_id`),
  KEY `idx_sa_submission` (`submission_id`),
  CONSTRAINT `fk_answer_question` FOREIGN KEY (`question_id`) REFERENCES `assignment_questions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_answer_submission` FOREIGN KEY (`submission_id`) REFERENCES `assignment_submissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `submission_files`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `submission_files` (
  `id` int NOT NULL AUTO_INCREMENT,
  `submission_id` int NOT NULL COMMENT '提交ID',
  `original_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '原始文件名',
  `stored_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'UUID存儲名',
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '相對路徑',
  `file_size` bigint DEFAULT NULL COMMENT '字節數',
  `file_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '類型: pdf/doc/image/video/code/archive',
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'MIME 類型',
  PRIMARY KEY (`id`),
  KEY `idx_submission` (`submission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `submission_rubric_scores`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `submission_rubric_scores` (
  `id` int NOT NULL AUTO_INCREMENT,
  `submission_id` int NOT NULL COMMENT '提交ID',
  `rubric_item_id` int NOT NULL COMMENT '評分項目ID',
  `points` decimal(5,1) DEFAULT NULL COMMENT '該項得分',
  `selected_level` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '选择的等级',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_submission_rubric` (`submission_id`,`rubric_item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `teacher_assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `teacher_assignments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `teacher_username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `class_id` int NOT NULL,
  `subject_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT 'subject_teacher' COMMENT 'head_teacher or subject_teacher',
  `assigned_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `is_active` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_teacher_class_subject` (`teacher_username`,`class_id`,`subject_code`),
  KEY `idx_teacher` (`teacher_username`),
  KEY `idx_class` (`class_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='??????';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `token_blacklist`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `token_blacklist` (
  `id` int NOT NULL AUTO_INCREMENT,
  `jti` varchar(36) NOT NULL,
  `username` varchar(100) DEFAULT '',
  `revoked_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `jti` (`jti`),
  KEY `idx_jti` (`jti`),
  KEY `idx_expires` (`expires_at`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `trade_game_scores`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `trade_game_scores` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_id` int NOT NULL COMMENT '用戶ID (users.id)',
  `student_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '顯示名稱',
  `class_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT '' COMMENT '班級',
  `difficulty` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'EASY/NORMAL/HARD',
  `player_spec` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'AGRI/IND/TECH',
  `ai_spec` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'AGRI/IND/TECH',
  `result` enum('win','lose','bankrupt') COLLATE utf8mb4_unicode_ci NOT NULL,
  `player_score` int NOT NULL COMMENT '綜合國力分',
  `ai_score` int NOT NULL,
  `turns_played` int NOT NULL DEFAULT '20',
  `final_money` int NOT NULL,
  `final_security` int NOT NULL,
  `final_inventory` json DEFAULT NULL,
  `total_trades` int DEFAULT '0',
  `good_trades` int DEFAULT '0',
  `bad_trades` int DEFAULT '0',
  `security_invests` int DEFAULT '0',
  `sanctions_used` int DEFAULT '0',
  `tips_read` int DEFAULT '0',
  `bankrupt_reason` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'money/security/null',
  `feedback_tags` json DEFAULT NULL COMMENT '學習反饋標籤',
  `played_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_student` (`student_id`),
  KEY `idx_class` (`class_name`),
  KEY `idx_played` (`played_at`),
  KEY `idx_difficulty` (`difficulty`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='全球貿易大亨遊戲成績';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `uploaded_games`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `uploaded_games` (
  `id` int NOT NULL AUTO_INCREMENT,
  `uuid` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name_en` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `subject` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `icon` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 0xF09F8EAE,
  `difficulty` json DEFAULT NULL,
  `tags` json DEFAULT NULL,
  `uploader_id` int NOT NULL,
  `is_public` tinyint(1) DEFAULT '0',
  `visible_to` json DEFAULT NULL COMMENT '可见班级列表，如["2A","3B"]，空数组=所有班级',
  `teacher_only` tinyint(1) DEFAULT '0' COMMENT '仅教师/管理员可见',
  `file_size` int DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uuid` (`uuid`),
  KEY `idx_subject` (`subject`),
  KEY `idx_uploader` (`uploader_id`),
  KEY `idx_public` (`is_public`),
  KEY `idx_deleted` (`is_deleted`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='教师上传的游戏';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `username` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `display_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `english_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT '' COMMENT '英文名',
  `card_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '學生證 CardID',
  `email` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email_encrypted` text COLLATE utf8mb4_unicode_ci,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone_encrypted` text COLLATE utf8mb4_unicode_ci,
  `role` enum('student','teacher','admin') COLLATE utf8mb4_unicode_ci DEFAULT 'student',
  `class_id` int DEFAULT NULL,
  `class_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `class_number` int DEFAULT NULL COMMENT '班號',
  `is_active` tinyint(1) DEFAULT '1',
  `is_locked` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_login` timestamp NULL DEFAULT NULL,
  `login_count` int DEFAULT '0',
  `password_changed_at` timestamp NULL DEFAULT NULL,
  `must_change_password` tinyint(1) DEFAULT '0',
  `data_consent` tinyint(1) DEFAULT '0',
  `data_consent_date` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `idx_username` (`username`),
  KEY `idx_role` (`role`),
  KEY `idx_card_id` (`card_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

