-- ETA belongs to actual trip start; remove any old pre-start estimates.
UPDATE shipments SET expected_completion_at=NULL
 WHERE trip_status=0 AND trip_started_at IS NULL;
