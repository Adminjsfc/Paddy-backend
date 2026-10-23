ALTER TABLE shipments
 ADD COLUMN release_order_id INT UNSIGNED NULL,
 ADD INDEX idx_shipment_release_order(release_order_id,status),
 ADD CONSTRAINT fk_shipment_release_order FOREIGN KEY(release_order_id) REFERENCES paddy_release_orders(id);
