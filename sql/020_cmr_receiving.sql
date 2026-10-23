CREATE TABLE IF NOT EXISTS cmr_receipts (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 shipment_id INT UNSIGNED NOT NULL UNIQUE,
 decision ENUM('ACCEPTED','REJECTED') NOT NULL,
 receipt_no VARCHAR(100) NOT NULL UNIQUE,
 gross_g BIGINT NOT NULL, tare_per_bag_g BIGINT NOT NULL, tare_g BIGINT NOT NULL, net_g BIGINT NOT NULL,
 total_bags INT UNSIGNED NOT NULL,
 red_grains_percent DECIMAL(5,2) NOT NULL, chalky_grains_percent DECIMAL(5,2) NOT NULL,
 moisture_percent DECIMAL(5,2) NOT NULL, broken_rice_percent DECIMAL(5,2) NOT NULL,
 other_standards VARCHAR(1000) NOT NULL, compliance_confirmed BOOLEAN NOT NULL,
 remarks VARCHAR(500) NOT NULL, gps_override_reason VARCHAR(500) NULL,
 received_at DATETIME(3) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 core_user_id INT UNSIGNED NOT NULL, core_user_type INT NOT NULL,
 FOREIGN KEY(shipment_id) REFERENCES shipments(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS cmr_receipt_stacks (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, receipt_id INT UNSIGNED NOT NULL,
 stack_no VARCHAR(100) NOT NULL, quantity_g BIGINT NOT NULL, bags INT UNSIGNED NOT NULL,
 UNIQUE KEY uq_receipt_stack(receipt_id,stack_no),
 FOREIGN KEY(receipt_id) REFERENCES cmr_receipts(id)
) ENGINE=InnoDB;
