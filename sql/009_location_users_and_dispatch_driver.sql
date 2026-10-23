ALTER TABLE facilities
 ADD COLUMN district_id INT NULL AFTER address,
 ADD COLUMN block_id INT NULL AFTER district_id,
 MODIFY district VARCHAR(100) NULL,
 MODIFY block VARCHAR(100) NULL,
 ADD INDEX idx_facility_location (district_id,block_id),
 ADD CONSTRAINT fk_facility_district FOREIGN KEY (district_id) REFERENCES tbl_district_master(id),
 ADD CONSTRAINT fk_facility_block FOREIGN KEY (block_id) REFERENCES tbl_block_master(id);

ALTER TABLE farmers
 ADD COLUMN district_id INT NULL AFTER village,
 ADD COLUMN block_id INT NULL AFTER district_id,
 MODIFY district VARCHAR(100) NULL,
 ADD INDEX idx_farmer_location (district_id,block_id),
 ADD CONSTRAINT fk_farmer_district FOREIGN KEY (district_id) REFERENCES tbl_district_master(id),
 ADD CONSTRAINT fk_farmer_block FOREIGN KEY (block_id) REFERENCES tbl_block_master(id);

ALTER TABLE transporters
 ADD COLUMN district_id INT NULL AFTER address,
 ADD COLUMN block_id INT NULL AFTER district_id,
 ADD INDEX idx_transporter_location (district_id,block_id),
 ADD CONSTRAINT fk_transporter_district FOREIGN KEY (district_id) REFERENCES tbl_district_master(id),
 ADD CONSTRAINT fk_transporter_block FOREIGN KEY (block_id) REFERENCES tbl_block_master(id);

ALTER TABLE vehicles MODIFY driver_name VARCHAR(150) NULL, MODIFY driver_phone VARCHAR(20) NULL;
ALTER TABLE shipments ADD COLUMN driver_name VARCHAR(150) NULL AFTER dispatch_receipt, ADD COLUMN driver_phone VARCHAR(20) NULL AFTER driver_name;

ALTER TABLE users DROP CONSTRAINT CONSTRAINT_1,
 MODIFY role ENUM('ADMIN','OPERATOR','PACS','LAMPS','MILLER','TRANSPORTER') NOT NULL,
 ADD COLUMN facility_id INT UNSIGNED NULL AFTER transporter_id,
 ADD CONSTRAINT fk_users_facility FOREIGN KEY (facility_id) REFERENCES facilities(id),
 ADD CONSTRAINT chk_user_scope CHECK (
   (role IN ('ADMIN','OPERATOR') AND miller_id IS NULL AND transporter_id IS NULL AND facility_id IS NULL)
   OR (role='MILLER' AND miller_id IS NOT NULL AND transporter_id IS NULL AND facility_id=miller_id)
   OR (role='TRANSPORTER' AND miller_id IS NOT NULL AND transporter_id IS NOT NULL AND facility_id IS NULL)
   OR (role IN ('PACS','LAMPS') AND miller_id IS NULL AND transporter_id IS NULL AND facility_id IS NOT NULL)
 );
