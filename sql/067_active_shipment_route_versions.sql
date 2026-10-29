ALTER TABLE shipment_routes
 DROP INDEX uq_shipment_route_pair,
 ADD COLUMN active_pair TINYINT GENERATED ALWAYS AS (CASE WHEN status=1 THEN 1 ELSE NULL END) STORED,
 ADD UNIQUE KEY uq_active_shipment_route_pair(source_id,destination_id,active_pair);
