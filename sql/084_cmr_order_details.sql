ALTER TABLE cmr_orders
 ADD COLUMN district_id INT NULL,
 ADD COLUMN lot_count INT UNSIGNED NULL,
 ADD COLUMN stenciling_code VARCHAR(100) NULL,
 ADD INDEX idx_cmr_order_district (district_id);

UPDATE cmr_orders o JOIN facilities f ON f.id=o.destination_id
 SET o.district_id=f.district_id;
