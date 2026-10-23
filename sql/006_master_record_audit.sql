ALTER TABLE seasons
 ADD COLUMN created_by INT UNSIGNED NULL AFTER active,
 ADD COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER created_by,
 ADD COLUMN updated_by INT UNSIGNED NULL AFTER created_at,
 ADD COLUMN updated_at DATETIME(3) NULL AFTER updated_by;
ALTER TABLE seasons ADD CONSTRAINT fk_seasons_created_by FOREIGN KEY (created_by) REFERENCES users(id), ADD CONSTRAINT fk_seasons_updated_by FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE facilities
 ADD COLUMN created_by INT UNSIGNED NULL AFTER active,
 ADD COLUMN updated_by INT UNSIGNED NULL AFTER created_at,
 ADD COLUMN updated_at DATETIME(3) NULL AFTER updated_by;
ALTER TABLE facilities ADD CONSTRAINT fk_facilities_created_by FOREIGN KEY (created_by) REFERENCES users(id), ADD CONSTRAINT fk_facilities_updated_by FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE farmers
 ADD COLUMN created_by INT UNSIGNED NULL AFTER active,
 ADD COLUMN updated_by INT UNSIGNED NULL AFTER created_at,
 ADD COLUMN updated_at DATETIME(3) NULL AFTER updated_by;
ALTER TABLE farmers ADD CONSTRAINT fk_farmers_created_by FOREIGN KEY (created_by) REFERENCES users(id), ADD CONSTRAINT fk_farmers_updated_by FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE transporters
 ADD COLUMN created_by INT UNSIGNED NULL AFTER active,
 ADD COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER created_by,
 ADD COLUMN updated_by INT UNSIGNED NULL AFTER created_at,
 ADD COLUMN updated_at DATETIME(3) NULL AFTER updated_by;
ALTER TABLE transporters ADD CONSTRAINT fk_transporters_created_by FOREIGN KEY (created_by) REFERENCES users(id), ADD CONSTRAINT fk_transporters_updated_by FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE vehicles
 ADD COLUMN created_by INT UNSIGNED NULL AFTER active,
 ADD COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER created_by,
 ADD COLUMN updated_by INT UNSIGNED NULL AFTER created_at,
 ADD COLUMN updated_at DATETIME(3) NULL AFTER updated_by;
ALTER TABLE vehicles ADD CONSTRAINT fk_vehicles_created_by FOREIGN KEY (created_by) REFERENCES users(id), ADD CONSTRAINT fk_vehicles_updated_by FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE gps_devices
 ADD COLUMN created_by INT UNSIGNED NULL AFTER active,
 ADD COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER created_by,
 ADD COLUMN updated_by INT UNSIGNED NULL AFTER created_at,
 ADD COLUMN updated_at DATETIME(3) NULL AFTER updated_by;
ALTER TABLE gps_devices ADD CONSTRAINT fk_gps_devices_created_by FOREIGN KEY (created_by) REFERENCES users(id), ADD CONSTRAINT fk_gps_devices_updated_by FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE route_tags
 ADD COLUMN updated_by INT UNSIGNED NULL AFTER unassigned_at,
 ADD COLUMN updated_at DATETIME(3) NULL AFTER updated_by;
ALTER TABLE route_tags ADD CONSTRAINT fk_route_tags_updated_by FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE miller_store_assignments
 ADD COLUMN updated_by INT UNSIGNED NULL AFTER unassigned_at,
 ADD COLUMN updated_at DATETIME(3) NULL AFTER updated_by;
ALTER TABLE miller_store_assignments ADD CONSTRAINT fk_miller_store_updated_by FOREIGN KEY (updated_by) REFERENCES users(id);
