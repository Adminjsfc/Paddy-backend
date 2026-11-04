DROP TABLE IF EXISTS push_testing_records;
DELETE FROM request_keys WHERE route LIKE 'testing:%';
