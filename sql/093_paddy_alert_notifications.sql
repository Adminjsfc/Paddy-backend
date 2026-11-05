CREATE TABLE IF NOT EXISTS tbl_notifications (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 alert_detail_id BIGINT UNSIGNED NOT NULL,
 event_key CHAR(64) NOT NULL,
 alert_id INT UNSIGNED NOT NULL,
 title VARCHAR(150) NOT NULL,
 message TEXT NOT NULL,
 raw_data JSON NOT NULL,
 reference_id INT UNSIGNED NOT NULL,
 notification_type INT UNSIGNED NOT NULL DEFAULT 9,
 link VARCHAR(255) NULL,
 district_id INT NULL,
 vehicle_no VARCHAR(30) NOT NULL,
 status TINYINT(1) NOT NULL DEFAULT 1,
 c_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_paddy_notification_event (event_key),
 UNIQUE KEY uq_paddy_notification_alert (alert_detail_id),
 CONSTRAINT fk_paddy_notification_detail FOREIGN KEY (alert_detail_id) REFERENCES tbl_vehicle_alerts_details(id),
 KEY idx_paddy_notification_shipment (reference_id,c_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tbl_notification_details (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 notification_id BIGINT UNSIGNED NOT NULL,
 user_id INT UNSIGNED NOT NULL,
 user_source VARCHAR(10) NOT NULL,
 is_read TINYINT(1) NOT NULL DEFAULT 0,
 read_at DATETIME NULL,
 published_at DATETIME NULL,
 status TINYINT(1) NOT NULL DEFAULT 1,
 c_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_paddy_notification_user (notification_id,user_source,user_id),
 KEY idx_paddy_notification_inbox (user_source,user_id,status,is_read,c_date),
 KEY idx_paddy_notification_pending (published_at,status,id),
 CONSTRAINT fk_paddy_notification_recipient FOREIGN KEY (notification_id) REFERENCES tbl_notifications(id) ON DELETE CASCADE
) ENGINE=InnoDB;
