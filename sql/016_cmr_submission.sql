ALTER TABLE shipments
 ADD COLUMN submitted_on DATE NULL,
 ADD COLUMN agency VARCHAR(20) NULL,
 ADD COLUMN commodity_type VARCHAR(30) NULL,
 ADD COLUMN cmr_lot_count INT UNSIGNED NULL,
 ADD COLUMN stenciling_code VARCHAR(100) NULL,
 ADD COLUMN gunny_bag_year SMALLINT UNSIGNED NULL,
 ADD COLUMN gunny_bag_type VARCHAR(80) NULL,
 ADD COLUMN total_bags INT UNSIGNED NULL,
 ADD COLUMN submitted_vehicle_type VARCHAR(100) NULL;

INSERT INTO module_permissions (role,module_key,can_view,can_add,can_edit)
VALUES ('MILLER','cmr',1,1,0);
