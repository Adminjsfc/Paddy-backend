CREATE TABLE vehicle_types (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 code VARCHAR(40) NOT NULL UNIQUE,
 name VARCHAR(100) NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_by INT UNSIGNED NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_by INT UNSIGNED NULL,
 updated_at DATETIME(3) NULL,
 CONSTRAINT fk_vehicle_types_created_by FOREIGN KEY (created_by) REFERENCES users(id),
 CONSTRAINT fk_vehicle_types_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB;

ALTER TABLE vehicles
 ADD COLUMN vehicle_type_id INT UNSIGNED NULL AFTER transporter_id,
 ADD INDEX idx_vehicle_type (vehicle_type_id),
 ADD CONSTRAINT fk_vehicle_type FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id);
