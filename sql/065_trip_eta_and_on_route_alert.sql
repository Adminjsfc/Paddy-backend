SET SESSION time_zone='+00:00';
CREATE TABLE IF NOT EXISTS gps_alert_master (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 alert_name VARCHAR(100) NOT NULL,
 alert_short_name VARCHAR(30) NOT NULL,
 alert_time INT UNSIGNED NULL,
 alert_reminder_time INT UNSIGNED NULL,
 threshold_value DECIMAL(12,3) NOT NULL DEFAULT 0,
 threshold_unit VARCHAR(20) NULL,
 alert_interval INT UNSIGNED NULL,
 status TINYINT(1) NOT NULL DEFAULT 1,
 c_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_gps_alert_master_short_name (alert_short_name)
) ENGINE=InnoDB;

INSERT INTO gps_alert_master(alert_name,alert_short_name,alert_time,alert_reminder_time,status,c_date)
SELECT 'On Route','ON_ROUTE',0,NULL,1,UTC_TIMESTAMP()
WHERE NOT EXISTS(SELECT 1 FROM gps_alert_master WHERE alert_short_name='ON_ROUTE');

UPDATE shipments s JOIN shipment_routes r ON r.id=s.route_id
SET s.expected_completion_at=TIMESTAMPADD(MINUTE,r.duration_minutes,s.trip_started_at)
WHERE s.trip_status=1 AND s.trip_started_at IS NOT NULL;
