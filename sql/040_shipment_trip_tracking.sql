ALTER TABLE shipments
 ADD COLUMN trip_status TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER status,
 ADD COLUMN trip_started_at DATETIME NULL AFTER trip_status,
 ADD COLUMN trip_completed_at DATETIME NULL AFTER trip_started_at,
 ADD COLUMN expected_completion_at DATETIME NULL AFTER trip_completed_at,
 ADD CONSTRAINT chk_shipment_trip_status CHECK(trip_status IN (0,1,2));

UPDATE shipments SET
 trip_status=CASE
   WHEN arrived_at IS NOT NULL OR status IN ('ARRIVED','DELIVERED') THEN 2
   WHEN departed_at IS NOT NULL OR status='IN_TRANSIT' THEN 1
   ELSE 0 END,
 trip_started_at=departed_at,
 trip_completed_at=CASE
   WHEN arrived_at IS NOT NULL OR status IN ('ARRIVED','DELIVERED') THEN COALESCE(arrived_at,delivered_at)
   ELSE NULL END;
