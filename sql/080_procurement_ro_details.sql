ALTER TABLE procurement
 ADD COLUMN ro_no VARCHAR(255) NULL,
 ADD COLUMN ro_date DATE NULL,
 ADD INDEX idx_procurement_ro_no (ro_no);
