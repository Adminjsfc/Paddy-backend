ALTER TABLE vehicles
 ADD COLUMN miller_id INT UNSIGNED NULL AFTER transporter_id,
 MODIFY transporter_id INT UNSIGNED NULL,
 ADD CONSTRAINT fk_vehicle_direct_miller FOREIGN KEY (miller_id) REFERENCES facilities(id),
 ADD INDEX idx_vehicle_miller (miller_id,active);
UPDATE vehicles v JOIN transporters t ON t.id=v.transporter_id SET v.miller_id=t.miller_id WHERE v.miller_id IS NULL;

CREATE TABLE test_stock_entries (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 reference VARCHAR(120) NOT NULL UNIQUE,
 facility_id INT UNSIGNED NOT NULL,
 season_id INT UNSIGNED NOT NULL,
 quantity_g BIGINT UNSIGNED NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (facility_id) REFERENCES facilities(id),
 FOREIGN KEY (season_id) REFERENCES seasons(id)
) ENGINE=InnoDB;
