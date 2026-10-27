SET SESSION time_zone='+00:00';
ALTER TABLE facility_routes
 MODIFY encoded_polyline MEDIUMTEXT NULL,
 MODIFY distance_m INT UNSIGNED NULL,
 MODIFY duration_seconds INT UNSIGNED NULL;

INSERT INTO facility_routes(source_id,destination_id,source_lat,source_lng,destination_lat,destination_lng,
 encoded_polyline,geometry,distance_m,duration_seconds,generated_at)
SELECT s.source_id,s.destination_id,s.source_lat,s.source_lng,s.destination_lat,s.destination_lng,
 g.encoded_polyline,g.geometry,g.distance_m,g.duration_seconds,g.updated_at
FROM shipment_gps_routes g JOIN shipments s ON s.id=g.shipment_id
ORDER BY g.updated_at DESC,g.shipment_id DESC
ON DUPLICATE KEY UPDATE source_id=facility_routes.source_id;

DROP TABLE shipment_gps_routes;
