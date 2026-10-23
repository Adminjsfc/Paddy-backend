ALTER TABLE vehicles
 ADD COLUMN mapping_status ENUM('AVAILABLE','MAPPED') NULL DEFAULT NULL,
 ADD COLUMN status_updated_at DATETIME(3) NULL DEFAULT NULL;

UPDATE vehicles v JOIN gps_devices d ON d.vehicle_id=v.id
 LEFT JOIN imeis i ON i.id=d.imei_id
 SET v.mapping_status=IF(d.active=1,'MAPPED','AVAILABLE'),
 v.status_updated_at=COALESCE(i.status_updated_at,d.updated_at,d.created_at);
