ALTER TABLE tbl_notifications DROP FOREIGN KEY fk_paddy_notification_detail, DROP INDEX uq_paddy_notification_alert, DROP COLUMN alert_detail_id;
ALTER TABLE tbl_vehicle_alert_event DROP COLUMN last_sample_at;
