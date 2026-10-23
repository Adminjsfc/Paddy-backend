-- Remove database foreign keys to location masters while keeping location IDs and indexes.
-- Application validation still checks district, block and district/block membership.

SET @location_fk_clauses = (
 SELECT GROUP_CONCAT(DISTINCT CONCAT('DROP FOREIGN KEY ', CHAR(96), REPLACE(CONSTRAINT_NAME, CHAR(96), CONCAT(CHAR(96), CHAR(96))), CHAR(96)) SEPARATOR ', ')
 FROM information_schema.KEY_COLUMN_USAGE
 WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='facilities'
 AND REFERENCED_TABLE_SCHEMA=DATABASE()
 AND REFERENCED_TABLE_NAME IN ('tbl_district_master','tbl_block_master')
);
SET @location_fk_sql = IF(@location_fk_clauses IS NULL, 'SELECT 1', CONCAT('ALTER TABLE facilities ', @location_fk_clauses));
PREPARE location_fk_statement FROM @location_fk_sql;
EXECUTE location_fk_statement;
DEALLOCATE PREPARE location_fk_statement;

SET @location_fk_clauses = (
 SELECT GROUP_CONCAT(DISTINCT CONCAT('DROP FOREIGN KEY ', CHAR(96), REPLACE(CONSTRAINT_NAME, CHAR(96), CONCAT(CHAR(96), CHAR(96))), CHAR(96)) SEPARATOR ', ')
 FROM information_schema.KEY_COLUMN_USAGE
 WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='farmers'
 AND REFERENCED_TABLE_SCHEMA=DATABASE()
 AND REFERENCED_TABLE_NAME IN ('tbl_district_master','tbl_block_master')
);
SET @location_fk_sql = IF(@location_fk_clauses IS NULL, 'SELECT 1', CONCAT('ALTER TABLE farmers ', @location_fk_clauses));
PREPARE location_fk_statement FROM @location_fk_sql;
EXECUTE location_fk_statement;
DEALLOCATE PREPARE location_fk_statement;

SET @location_fk_clauses = (
 SELECT GROUP_CONCAT(DISTINCT CONCAT('DROP FOREIGN KEY ', CHAR(96), REPLACE(CONSTRAINT_NAME, CHAR(96), CONCAT(CHAR(96), CHAR(96))), CHAR(96)) SEPARATOR ', ')
 FROM information_schema.KEY_COLUMN_USAGE
 WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='transporters'
 AND REFERENCED_TABLE_SCHEMA=DATABASE()
 AND REFERENCED_TABLE_NAME IN ('tbl_district_master','tbl_block_master')
);
SET @location_fk_sql = IF(@location_fk_clauses IS NULL, 'SELECT 1', CONCAT('ALTER TABLE transporters ', @location_fk_clauses));
PREPARE location_fk_statement FROM @location_fk_sql;
EXECUTE location_fk_statement;
DEALLOCATE PREPARE location_fk_statement;

SET @location_fk_clauses = (
 SELECT GROUP_CONCAT(DISTINCT CONCAT('DROP FOREIGN KEY ', CHAR(96), REPLACE(CONSTRAINT_NAME, CHAR(96), CONCAT(CHAR(96), CHAR(96))), CHAR(96)) SEPARATOR ', ')
 FROM information_schema.KEY_COLUMN_USAGE
 WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='shipments'
 AND REFERENCED_TABLE_SCHEMA=DATABASE()
 AND REFERENCED_TABLE_NAME IN ('tbl_district_master','tbl_block_master')
);
SET @location_fk_sql = IF(@location_fk_clauses IS NULL, 'SELECT 1', CONCAT('ALTER TABLE shipments ', @location_fk_clauses));
PREPARE location_fk_statement FROM @location_fk_sql;
EXECUTE location_fk_statement;
DEALLOCATE PREPARE location_fk_statement;
