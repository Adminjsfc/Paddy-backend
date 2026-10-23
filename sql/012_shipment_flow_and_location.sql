ALTER TABLE shipments
 DROP INDEX uq_active_vehicle,
 DROP COLUMN active_vehicle_id,
 ADD COLUMN flow_type ENUM('PACS_LAMPS_TO_MILLER','MILLER_TO_GODOWN') NOT NULL AFTER leg,
 ADD COLUMN district_id INT NULL AFTER destination_id,
 ADD COLUMN block_id INT NULL AFTER district_id,
 ADD INDEX idx_shipment_flow (flow_type,season_id,status),
 ADD INDEX idx_shipment_location (district_id,block_id),
 ADD CONSTRAINT fk_shipment_district FOREIGN KEY (district_id) REFERENCES tbl_district_master(id),
 ADD CONSTRAINT fk_shipment_block FOREIGN KEY (block_id) REFERENCES tbl_block_master(id);
