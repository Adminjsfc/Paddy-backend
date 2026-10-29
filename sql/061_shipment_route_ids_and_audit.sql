RENAME TABLE facility_routes TO shipment_routes;

ALTER TABLE shipment_routes
 DROP PRIMARY KEY,
 ADD COLUMN id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST,
 ADD UNIQUE KEY uq_shipment_route_pair(source_id,destination_id),
 CHANGE COLUMN generated_at created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 ADD COLUMN created_by INT UNSIGNED NULL,
 ADD COLUMN updated_by INT UNSIGNED NULL,
 ADD COLUMN status TINYINT UNSIGNED NOT NULL DEFAULT 1,
 ADD CONSTRAINT fk_shipment_route_creator FOREIGN KEY(created_by) REFERENCES users(id),
 ADD CONSTRAINT fk_shipment_route_updater FOREIGN KEY(updated_by) REFERENCES users(id);

UPDATE shipment_routes SET updated_at=created_at;

ALTER TABLE shipments
 ADD COLUMN route_id INT UNSIGNED NULL AFTER destination_id,
 ADD CONSTRAINT fk_shipment_route FOREIGN KEY(route_id) REFERENCES shipment_routes(id);

UPDATE shipments s JOIN shipment_routes r ON r.source_id=s.source_id AND r.destination_id=s.destination_id
SET s.route_id=r.id;
