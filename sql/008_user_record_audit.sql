ALTER TABLE users
 ADD COLUMN created_by INT UNSIGNED NULL AFTER created_at,
 ADD COLUMN updated_by INT UNSIGNED NULL AFTER created_by,
 ADD COLUMN updated_at DATETIME(3) NULL AFTER updated_by,
 ADD CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users(id),
 ADD CONSTRAINT fk_users_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
 ADD INDEX idx_users_created_by (created_by),
 ADD INDEX idx_users_updated_by (updated_by);
