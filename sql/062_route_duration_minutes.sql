ALTER TABLE shipment_routes ADD COLUMN duration_minutes INT UNSIGNED NULL AFTER distance_m;
UPDATE shipment_routes SET duration_minutes=CEIL(duration_seconds/60);
ALTER TABLE shipment_routes DROP COLUMN duration_seconds;
