-- DDL commits independently of the migration ledger. Check each object so a
-- retry can finish an interrupted migration without losing existing audit data.
SET @migration_sql = IF(
 EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='miller_store_assignments' AND COLUMN_NAME='created_by'),
 'SELECT 1',
 'ALTER TABLE miller_store_assignments ADD COLUMN created_by INT UNSIGNED NULL AFTER active'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
 EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='miller_store_assignments' AND COLUMN_NAME='unassigned_by'),
 'SELECT 1',
 'ALTER TABLE miller_store_assignments ADD COLUMN unassigned_by INT UNSIGNED NULL AFTER created_at'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
 EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='miller_store_assignments' AND COLUMN_NAME='unassigned_at'),
 'SELECT 1',
 'ALTER TABLE miller_store_assignments ADD COLUMN unassigned_at DATETIME(3) NULL AFTER unassigned_by'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
 EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='miller_store_assignments' AND CONSTRAINT_NAME='fk_miller_store_created_by' AND CONSTRAINT_TYPE='FOREIGN KEY'),
 'SELECT 1',
 'ALTER TABLE miller_store_assignments ADD CONSTRAINT fk_miller_store_created_by FOREIGN KEY (created_by) REFERENCES users(id)'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
 EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='miller_store_assignments' AND CONSTRAINT_NAME='fk_miller_store_unassigned_by' AND CONSTRAINT_TYPE='FOREIGN KEY'),
 'SELECT 1',
 'ALTER TABLE miller_store_assignments ADD CONSTRAINT fk_miller_store_unassigned_by FOREIGN KEY (unassigned_by) REFERENCES users(id)'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;
