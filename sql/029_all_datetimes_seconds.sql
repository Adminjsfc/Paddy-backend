UPDATE `audit_log` SET `created_at`=DATE_FORMAT(`created_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `audit_log`
 MODIFY `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE `cmr_orders` SET `ordered_at`=DATE_FORMAT(`ordered_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `cmr_orders`
 MODIFY `ordered_at` DATETIME NOT NULL;

UPDATE `cmr_receipts` SET `received_at`=DATE_FORMAT(`received_at`,'%Y-%m-%d %H:%i:%s'),`created_at`=DATE_FORMAT(`created_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `cmr_receipts`
 MODIFY `received_at` DATETIME NOT NULL,
 MODIFY `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE `facilities` SET `created_at`=DATE_FORMAT(`created_at`,'%Y-%m-%d %H:%i:%s'),`updated_at`=DATE_FORMAT(`updated_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `facilities`
 MODIFY `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 MODIFY `updated_at` DATETIME NULL DEFAULT NULL;

UPDATE `farmers` SET `created_at`=DATE_FORMAT(`created_at`,'%Y-%m-%d %H:%i:%s'),`updated_at`=DATE_FORMAT(`updated_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `farmers`
 MODIFY `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 MODIFY `updated_at` DATETIME NULL DEFAULT NULL;

UPDATE `gps_devices` SET `created_at`=DATE_FORMAT(`created_at`,'%Y-%m-%d %H:%i:%s'),`updated_at`=DATE_FORMAT(`updated_at`,'%Y-%m-%d %H:%i:%s'),`last_gps_at`=DATE_FORMAT(`last_gps_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `gps_devices`
 MODIFY `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 MODIFY `updated_at` DATETIME NULL DEFAULT NULL,
 MODIFY `last_gps_at` DATETIME NULL DEFAULT NULL;

UPDATE `gps_packets` SET `gps_at`=DATE_FORMAT(`gps_at`,'%Y-%m-%d %H:%i:%s'),`received_at`=DATE_FORMAT(`received_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `gps_packets`
 MODIFY `gps_at` DATETIME NOT NULL,
 MODIFY `received_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE `imeis` SET `created_at`=DATE_FORMAT(`created_at`,'%Y-%m-%d %H:%i:%s'),`updated_at`=DATE_FORMAT(`updated_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `imeis`
 MODIFY `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 MODIFY `updated_at` DATETIME NULL DEFAULT NULL;

UPDATE `miller_store_assignments` SET `created_at`=DATE_FORMAT(`created_at`,'%Y-%m-%d %H:%i:%s'),`unassigned_at`=DATE_FORMAT(`unassigned_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `miller_store_assignments`
 MODIFY `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 MODIFY `unassigned_at` DATETIME NULL DEFAULT NULL;

UPDATE `milling_batches` SET `milled_at`=DATE_FORMAT(`milled_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `milling_batches`
 MODIFY `milled_at` DATETIME NOT NULL;

UPDATE `module_permissions` SET `updated_at`=DATE_FORMAT(`updated_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `module_permissions`
 MODIFY `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE `paddy_release_orders` SET `created_at`=DATE_FORMAT(`created_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `paddy_release_orders`
 MODIFY `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE `procurement` SET `procured_at`=DATE_FORMAT(`procured_at`,'%Y-%m-%d %H:%i:%s'),`created_at`=DATE_FORMAT(`created_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `procurement`
 MODIFY `procured_at` DATETIME NOT NULL,
 MODIFY `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE `request_keys` SET `created_at`=DATE_FORMAT(`created_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `request_keys`
 MODIFY `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE `route_tags` SET `created_at`=DATE_FORMAT(`created_at`,'%Y-%m-%d %H:%i:%s'),`unassigned_at`=DATE_FORMAT(`unassigned_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `route_tags`
 MODIFY `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 MODIFY `unassigned_at` DATETIME NULL DEFAULT NULL;

UPDATE `schema_migrations` SET `applied_at`=DATE_FORMAT(`applied_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `schema_migrations`
 MODIFY `applied_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE `seasons` SET `created_at`=DATE_FORMAT(`created_at`,'%Y-%m-%d %H:%i:%s'),`updated_at`=DATE_FORMAT(`updated_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `seasons`
 MODIFY `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 MODIFY `updated_at` DATETIME NULL DEFAULT NULL;

UPDATE `sessions` SET `expires_at`=DATE_FORMAT(`expires_at`,'%Y-%m-%d %H:%i:%s'),`refresh_expires_at`=DATE_FORMAT(`refresh_expires_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `sessions`
 MODIFY `expires_at` DATETIME NOT NULL,
 MODIFY `refresh_expires_at` DATETIME NULL DEFAULT NULL;

UPDATE `shipments` SET `dispatched_at`=DATE_FORMAT(`dispatched_at`,'%Y-%m-%d %H:%i:%s'),`departed_at`=DATE_FORMAT(`departed_at`,'%Y-%m-%d %H:%i:%s'),`arrived_at`=DATE_FORMAT(`arrived_at`,'%Y-%m-%d %H:%i:%s'),`delivered_at`=DATE_FORMAT(`delivered_at`,'%Y-%m-%d %H:%i:%s'),`last_gps_at`=DATE_FORMAT(`last_gps_at`,'%Y-%m-%d %H:%i:%s'),`created_at`=DATE_FORMAT(`created_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `shipments`
 MODIFY `dispatched_at` DATETIME NULL DEFAULT NULL,
 MODIFY `departed_at` DATETIME NULL DEFAULT NULL,
 MODIFY `arrived_at` DATETIME NULL DEFAULT NULL,
 MODIFY `delivered_at` DATETIME NULL DEFAULT NULL,
 MODIFY `last_gps_at` DATETIME NULL DEFAULT NULL,
 MODIFY `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE `shipment_events` SET `occurred_at`=DATE_FORMAT(`occurred_at`,'%Y-%m-%d %H:%i:%s'),`created_at`=DATE_FORMAT(`created_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `shipment_events`
 MODIFY `occurred_at` DATETIME NOT NULL,
 MODIFY `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE `stock_ledger` SET `created_at`=DATE_FORMAT(`created_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `stock_ledger`
 MODIFY `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE `test_stock_entries` SET `created_at`=DATE_FORMAT(`created_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `test_stock_entries`
 MODIFY `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE `transporters` SET `created_at`=DATE_FORMAT(`created_at`,'%Y-%m-%d %H:%i:%s'),`updated_at`=DATE_FORMAT(`updated_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `transporters`
 MODIFY `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 MODIFY `updated_at` DATETIME NULL DEFAULT NULL;

UPDATE `users` SET `created_at`=DATE_FORMAT(`created_at`,'%Y-%m-%d %H:%i:%s'),`updated_at`=DATE_FORMAT(`updated_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `users`
 MODIFY `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 MODIFY `updated_at` DATETIME NULL DEFAULT NULL;

UPDATE `vehicles` SET `created_at`=DATE_FORMAT(`created_at`,'%Y-%m-%d %H:%i:%s'),`updated_at`=DATE_FORMAT(`updated_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `vehicles`
 MODIFY `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 MODIFY `updated_at` DATETIME NULL DEFAULT NULL;

UPDATE `vehicle_types` SET `created_at`=DATE_FORMAT(`created_at`,'%Y-%m-%d %H:%i:%s'),`updated_at`=DATE_FORMAT(`updated_at`,'%Y-%m-%d %H:%i:%s');

ALTER TABLE `vehicle_types`
 MODIFY `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 MODIFY `updated_at` DATETIME NULL DEFAULT NULL;
