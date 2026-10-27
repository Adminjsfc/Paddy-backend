SET SESSION time_zone='+00:00';
INSERT INTO gps_alert_master(alert_name,alert_short_name,alert_time,alert_reminder_time,status,c_date)
SELECT 'On Route','ON_ROUTE',0,NULL,1,UTC_TIMESTAMP()
WHERE NOT EXISTS(SELECT 1 FROM gps_alert_master WHERE alert_short_name='ON_ROUTE');

UPDATE shipments s JOIN shipment_routes r ON r.id=s.route_id
SET s.expected_completion_at=TIMESTAMPADD(MINUTE,r.duration_minutes,s.trip_started_at)
WHERE s.trip_status=1 AND s.trip_started_at IS NOT NULL;
