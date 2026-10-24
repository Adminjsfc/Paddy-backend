ALTER TABLE users
 DROP CONSTRAINT chk_user_scope,
 MODIFY role ENUM('ADMIN','OPERATOR','PACS','LAMPS','MILLER','TRANSPORTER','DRIVER') NOT NULL,
 ADD COLUMN phone VARCHAR(20) NULL,
 ADD UNIQUE KEY uq_users_phone (phone),
 ADD CONSTRAINT chk_user_scope CHECK (
 (role IN ('ADMIN','OPERATOR','DRIVER') AND miller_id IS NULL AND transporter_id IS NULL AND facility_id IS NULL)
 OR (role='MILLER' AND miller_id IS NOT NULL AND transporter_id IS NULL AND facility_id=miller_id)
 OR (role='TRANSPORTER' AND miller_id IS NOT NULL AND transporter_id IS NOT NULL AND facility_id IS NULL)
 OR (role IN ('PACS','LAMPS') AND miller_id IS NULL AND transporter_id IS NULL AND facility_id IS NOT NULL)
 );

CREATE TABLE driver_owners (
 driver_id INT UNSIGNED NOT NULL,
 facility_id INT UNSIGNED NOT NULL,
 created_by INT UNSIGNED NULL,
 PRIMARY KEY (driver_id,facility_id),
 FOREIGN KEY (driver_id) REFERENCES users(id),
 FOREIGN KEY (facility_id) REFERENCES facilities(id),
 FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

ALTER TABLE shipments ADD COLUMN driver_user_id INT UNSIGNED NULL,
 ADD CONSTRAINT fk_shipment_driver FOREIGN KEY (driver_user_id) REFERENCES users(id);
