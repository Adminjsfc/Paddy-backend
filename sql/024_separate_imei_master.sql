CREATE TABLE imeis (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 imei VARCHAR(30) NOT NULL UNIQUE,
 provider VARCHAR(120) NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_by INT UNSIGNED NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_by INT UNSIGNED NULL,
 updated_at DATETIME(3) NULL,
 FOREIGN KEY (created_by) REFERENCES users(id),
 FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB;

INSERT INTO imeis (imei,provider,active,created_by,created_at,updated_by,updated_at)
 SELECT imei,provider,TRUE,created_by,created_at,updated_by,updated_at FROM gps_devices;

ALTER TABLE gps_devices
 ADD COLUMN imei_id INT UNSIGNED NULL AFTER vehicle_id,
 ADD COLUMN district_id INT NULL AFTER imei_id,
 ADD COLUMN block_id INT NULL AFTER district_id;

UPDATE gps_devices d
 JOIN imeis i ON i.imei=d.imei
 JOIN vehicles v ON v.id=d.vehicle_id
 LEFT JOIN transporters t ON t.id=v.transporter_id
 LEFT JOIN facilities f ON f.id=COALESCE(v.miller_id,t.miller_id)
 SET d.imei_id=i.id,d.district_id=f.district_id,d.block_id=f.block_id;

ALTER TABLE gps_devices
 MODIFY imei_id INT UNSIGNED NOT NULL,
 ADD UNIQUE INDEX uq_gps_imei (imei_id),
 ADD CONSTRAINT fk_gps_imei FOREIGN KEY (imei_id) REFERENCES imeis(id),
 DROP COLUMN imei,
 DROP COLUMN provider;
