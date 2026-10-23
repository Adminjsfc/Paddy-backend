-- Run manually as a database administrator after replacing both passwords.
-- For a remote Router, change the account host to your application host/subnet.
CREATE DATABASE IF NOT EXISTS sfc_cmr CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'sfc_cmr_app'@'localhost' IDENTIFIED BY 'REPLACE_APP_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON sfc_cmr.* TO 'sfc_cmr_app'@'localhost';
CREATE USER 'sfc_cmr_migration'@'localhost' IDENTIFIED BY 'REPLACE_MIGRATION_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON sfc_cmr.* TO 'sfc_cmr_migration'@'localhost';
