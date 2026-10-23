ALTER TABLE imeis
 MODIFY mapping_status ENUM('AVAILABLE','MAPPED') NULL DEFAULT NULL,
 MODIFY status_updated_at DATETIME(3) NULL DEFAULT NULL;

UPDATE imeis i
 LEFT JOIN gps_devices d ON d.imei_id=i.id
 SET i.mapping_status=NULL,i.status_updated_at=NULL
 WHERE d.id IS NULL;
