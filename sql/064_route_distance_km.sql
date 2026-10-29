ALTER TABLE shipment_routes ADD COLUMN distance_km DECIMAL(12,3) UNSIGNED NULL AFTER geometry;
UPDATE shipment_routes SET distance_km=distance_m/1000;
ALTER TABLE shipment_routes DROP COLUMN distance_m;
