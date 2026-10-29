CREATE TABLE IF NOT EXISTS facility_routes (
 source_id INT UNSIGNED NOT NULL,
 destination_id INT UNSIGNED NOT NULL,
 source_lat DECIMAL(10,7) NOT NULL,
 source_lng DECIMAL(10,7) NOT NULL,
 destination_lat DECIMAL(10,7) NOT NULL,
 destination_lng DECIMAL(10,7) NOT NULL,
 encoded_polyline MEDIUMTEXT NOT NULL,
 geometry JSON NOT NULL,
 distance_m INT UNSIGNED NOT NULL,
 duration_seconds INT UNSIGNED NOT NULL,
 generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(source_id,destination_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS shipment_gps_routes (
 shipment_id INT UNSIGNED PRIMARY KEY,
 geometry JSON NOT NULL,
 allowed_district_ids JSON NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY(shipment_id) REFERENCES shipments(id)
) ENGINE=InnoDB;

ALTER TABLE shipment_gps_routes
 ADD COLUMN encoded_polyline MEDIUMTEXT NULL,
 ADD COLUMN distance_m INT UNSIGNED NULL,
 ADD COLUMN duration_seconds INT UNSIGNED NULL;
