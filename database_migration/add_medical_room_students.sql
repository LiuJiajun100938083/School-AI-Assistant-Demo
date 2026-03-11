-- Add medical_room_students column to class_diary_entries
-- Stores JSON array of {reason, students[]} for medical room visits
ALTER TABLE class_diary_entries
    ADD COLUMN medical_room_students TEXT DEFAULT NULL AFTER rule_violations;
