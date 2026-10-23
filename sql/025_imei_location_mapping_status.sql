ALTER TABLE imeis
 ADD COLUMN district_id INT NULL AFTER provider,
 ADD COLUMN block_id INT NULL AFTER district_id,
 ADD COLUMN mapping_status ENUM('AVAILABLE','MAPPED') NOT NULL DEFAULT 'AVAILABLE',
 ADD COLUMN status_updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

UPDATE imeis i JOIN gps_devices d ON d.imei_id=i.id
 SET i.district_id=d.district_id,i.block_id=d.block_id,
 i.mapping_status=IF(d.active=1,'MAPPED','AVAILABLE'),
 i.status_updated_at=COALESCE(d.updated_at,d.created_at,i.created_at);
