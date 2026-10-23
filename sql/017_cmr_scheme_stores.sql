ALTER TABLE facilities ADD COLUMN core_store_id INT UNSIGNED NULL,
 ADD UNIQUE INDEX uq_facility_core_store (core_store_id);
ALTER TABLE shipments ADD COLUMN scheme_type VARCHAR(4) NULL,
 ADD COLUMN core_store_location_id INT UNSIGNED NULL;
