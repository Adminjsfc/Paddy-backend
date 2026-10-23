ALTER TABLE facilities
 ADD COLUMN created_by_core_user_id INT UNSIGNED NULL AFTER created_by,
 ADD COLUMN created_by_user_type INT UNSIGNED NULL AFTER created_by_core_user_id;
