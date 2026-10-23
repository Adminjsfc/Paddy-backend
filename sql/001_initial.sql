CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(80) PRIMARY KEY, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB;

CREATE TABLE seasons (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, code VARCHAR(40) NOT NULL UNIQUE,
 name VARCHAR(150) NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL,
 recovery_percent DECIMAL(5,2) NOT NULL DEFAULT 68.00, active BOOLEAN NOT NULL DEFAULT TRUE,
 CHECK (end_date >= start_date), CHECK (recovery_percent > 0 AND recovery_percent <= 100)
) ENGINE=InnoDB;

CREATE TABLE facilities (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, code VARCHAR(80) NOT NULL UNIQUE,
 kind ENUM('PACS','LAMPS','MILLER','SFC_GODOWN','FCI') NOT NULL,
 name VARCHAR(180) NOT NULL, address VARCHAR(500) NOT NULL,
 district VARCHAR(100) NOT NULL, block VARCHAR(100) NOT NULL,
 latitude DECIMAL(10,7) NOT NULL, longitude DECIMAL(10,7) NOT NULL,
 radius_m INT UNSIGNED NOT NULL DEFAULT 200,
 capacity_g BIGINT UNSIGNED NOT NULL, milling_capacity_g_per_day BIGINT UNSIGNED NULL,
 recovery_percent DECIMAL(5,2) NULL, contact_name VARCHAR(150) NULL,
 phone VARCHAR(20) NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 CHECK (latitude BETWEEN -90 AND 90), CHECK (longitude BETWEEN -180 AND 180),
 CHECK (radius_m BETWEEN 10 AND 10000),
 CHECK (recovery_percent IS NULL OR (recovery_percent > 0 AND recovery_percent <= 100)),
 INDEX idx_facility_kind (kind,active,district)
) ENGINE=InnoDB;

CREATE TABLE farmers (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, code VARCHAR(80) NOT NULL UNIQUE,
 name VARCHAR(150) NOT NULL, phone VARCHAR(20) NULL, village VARCHAR(150) NOT NULL,
 district VARCHAR(100) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE transporters (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, miller_id INT UNSIGNED NOT NULL,
 code VARCHAR(80) NOT NULL, name VARCHAR(150) NOT NULL, contact_name VARCHAR(150) NOT NULL,
 phone VARCHAR(20) NOT NULL, address VARCHAR(500) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
 UNIQUE KEY uq_transporter (miller_id,code), FOREIGN KEY (miller_id) REFERENCES facilities(id)
) ENGINE=InnoDB;

CREATE TABLE vehicles (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, transporter_id INT UNSIGNED NOT NULL,
 registration_no VARCHAR(20) NOT NULL UNIQUE, capacity_g BIGINT UNSIGNED NOT NULL,
 driver_name VARCHAR(150) NOT NULL, driver_phone VARCHAR(20) NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 FOREIGN KEY (transporter_id) REFERENCES transporters(id)
) ENGINE=InnoDB;

CREATE TABLE gps_devices (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, vehicle_id INT UNSIGNED NOT NULL UNIQUE,
 imei VARCHAR(30) NOT NULL UNIQUE, provider VARCHAR(120) NOT NULL,
 model VARCHAR(100) NULL, sim_no VARCHAR(25) NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
 last_gps_at DATETIME(3) NULL, latitude DECIMAL(10,7) NULL, longitude DECIMAL(10,7) NULL,
 speed_kph DECIMAL(7,2) NULL, FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
) ENGINE=InnoDB;

CREATE TABLE users (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150) NOT NULL,
 email VARCHAR(190) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
 role ENUM('ADMIN','OPERATOR','MILLER','TRANSPORTER') NOT NULL,
 miller_id INT UNSIGNED NULL, transporter_id INT UNSIGNED NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY (miller_id) REFERENCES facilities(id), FOREIGN KEY (transporter_id) REFERENCES transporters(id),
 CHECK ((role IN ('ADMIN','OPERATOR') AND miller_id IS NULL AND transporter_id IS NULL)
 OR (role='MILLER' AND miller_id IS NOT NULL AND transporter_id IS NULL)
 OR (role='TRANSPORTER' AND miller_id IS NOT NULL AND transporter_id IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE sessions (
 token_hash CHAR(64) PRIMARY KEY, user_id INT UNSIGNED NOT NULL,
 expires_at DATETIME(3) NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id), INDEX idx_session_expiry(expires_at)
) ENGINE=InnoDB;

CREATE TABLE route_tags (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, season_id INT UNSIGNED NOT NULL,
 source_id INT UNSIGNED NOT NULL, destination_id INT UNSIGNED NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 UNIQUE KEY uq_tag(season_id,source_id,destination_id),
 FOREIGN KEY(season_id) REFERENCES seasons(id), FOREIGN KEY(source_id) REFERENCES facilities(id),
 FOREIGN KEY(destination_id) REFERENCES facilities(id), CHECK(source_id <> destination_id)
) ENGINE=InnoDB;

CREATE TABLE stocks (
 facility_id INT UNSIGNED NOT NULL, season_id INT UNSIGNED NOT NULL,
 commodity ENUM('PADDY','RICE') NOT NULL, on_hand_g BIGINT NOT NULL DEFAULT 0,
 reserved_g BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(facility_id,season_id,commodity), FOREIGN KEY(facility_id) REFERENCES facilities(id),
 FOREIGN KEY(season_id) REFERENCES seasons(id),
 CHECK(on_hand_g >= 0), CHECK(reserved_g >= 0 AND reserved_g <= on_hand_g)
) ENGINE=InnoDB;

CREATE TABLE procurement (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, external_ref VARCHAR(120) NOT NULL UNIQUE,
 payload_hash CHAR(64) NOT NULL, season_id INT UNSIGNED NOT NULL, farmer_id INT UNSIGNED NOT NULL,
 facility_id INT UNSIGNED NOT NULL, procured_at DATETIME(3) NOT NULL,
 quantity_g BIGINT UNSIGNED NOT NULL, available_g BIGINT NOT NULL, reserved_g BIGINT NOT NULL DEFAULT 0,
 moisture_percent DECIMAL(5,2) NULL, receipt_no VARCHAR(100) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(season_id) REFERENCES seasons(id), FOREIGN KEY(farmer_id) REFERENCES farmers(id),
 FOREIGN KEY(facility_id) REFERENCES facilities(id),
 CHECK(available_g >= 0), CHECK(reserved_g >= 0 AND reserved_g <= available_g),
 INDEX idx_procurement_lots(facility_id,season_id,procured_at,id), INDEX idx_procurement_farmer(farmer_id,season_id)
) ENGINE=InnoDB;

CREATE TABLE cmr_orders (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, external_ref VARCHAR(120) NOT NULL UNIQUE,
 payload_hash CHAR(64) NOT NULL, season_id INT UNSIGNED NOT NULL, miller_id INT UNSIGNED NOT NULL,
 destination_id INT UNSIGNED NOT NULL, order_no VARCHAR(100) NOT NULL,
 ordered_at DATETIME(3) NOT NULL, due_date DATE NOT NULL, rice_quantity_g BIGINT UNSIGNED NOT NULL,
 committed_g BIGINT NOT NULL DEFAULT 0, delivered_g BIGINT NOT NULL DEFAULT 0,
 status ENUM('OPEN','FULFILLED','CANCELLED') NOT NULL DEFAULT 'OPEN',
 FOREIGN KEY(season_id) REFERENCES seasons(id), FOREIGN KEY(miller_id) REFERENCES facilities(id),
 FOREIGN KEY(destination_id) REFERENCES facilities(id),
 CHECK(committed_g >= 0 AND delivered_g >= 0 AND committed_g + delivered_g <= rice_quantity_g),
 INDEX idx_cmr_miller(miller_id,season_id,status,due_date)
) ENGINE=InnoDB;

CREATE TABLE milling_batches (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, batch_no VARCHAR(100) NOT NULL,
 miller_id INT UNSIGNED NOT NULL, season_id INT UNSIGNED NOT NULL,
 paddy_consumed_g BIGINT UNSIGNED NOT NULL, rice_produced_g BIGINT UNSIGNED NOT NULL,
 expected_rice_g BIGINT UNSIGNED NOT NULL, recovery_percent DECIMAL(5,2) NOT NULL,
 milled_at DATETIME(3) NOT NULL, remarks VARCHAR(500) NULL,
 UNIQUE KEY uq_batch(miller_id,season_id,batch_no),
 FOREIGN KEY(miller_id) REFERENCES facilities(id), FOREIGN KEY(season_id) REFERENCES seasons(id)
) ENGINE=InnoDB;

CREATE TABLE shipments (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, shipment_no VARCHAR(100) NOT NULL UNIQUE,
 leg ENUM('PADDY','CMR') NOT NULL, season_id INT UNSIGNED NOT NULL,
 miller_id INT UNSIGNED NOT NULL, source_id INT UNSIGNED NOT NULL, destination_id INT UNSIGNED NOT NULL,
 vehicle_id INT UNSIGNED NOT NULL, order_id INT UNSIGNED NULL,
 quantity_g BIGINT UNSIGNED NOT NULL, accepted_g BIGINT UNSIGNED NULL, shortage_g BIGINT UNSIGNED NULL,
 recovery_percent DECIMAL(5,2) NULL, expected_rice_g BIGINT UNSIGNED NULL,
 status ENUM('PLANNED','DISPATCHED','IN_TRANSIT','ARRIVED','DELIVERED','CANCELLED') NOT NULL DEFAULT 'PLANNED',
 active_vehicle_id INT UNSIGNED GENERATED ALWAYS AS
 (CASE WHEN status IN ('PLANNED','DISPATCHED','IN_TRANSIT','ARRIVED') THEN vehicle_id ELSE NULL END) STORED,
 UNIQUE KEY uq_active_vehicle(active_vehicle_id),
 source_lat DECIMAL(10,7) NOT NULL, source_lng DECIMAL(10,7) NOT NULL, source_radius_m INT UNSIGNED NOT NULL,
 destination_lat DECIMAL(10,7) NOT NULL, destination_lng DECIMAL(10,7) NOT NULL, destination_radius_m INT UNSIGNED NOT NULL,
 source_geofence ENUM('UNKNOWN','IN','OUT') NOT NULL DEFAULT 'UNKNOWN',
 destination_geofence ENUM('UNKNOWN','IN','OUT') NOT NULL DEFAULT 'UNKNOWN',
 dispatched_at DATETIME(3) NULL, departed_at DATETIME(3) NULL, arrived_at DATETIME(3) NULL,
 delivered_at DATETIME(3) NULL, last_gps_at DATETIME(3) NULL,
 dispatch_receipt VARCHAR(100) NULL, delivery_receipt VARCHAR(100) NULL, remarks VARCHAR(500) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(season_id) REFERENCES seasons(id), FOREIGN KEY(miller_id) REFERENCES facilities(id),
 FOREIGN KEY(source_id) REFERENCES facilities(id), FOREIGN KEY(destination_id) REFERENCES facilities(id),
 FOREIGN KEY(vehicle_id) REFERENCES vehicles(id), FOREIGN KEY(order_id) REFERENCES cmr_orders(id),
 CHECK(accepted_g IS NULL OR accepted_g <= quantity_g),
 CHECK((leg='PADDY' AND order_id IS NULL) OR (leg='CMR' AND order_id IS NOT NULL)),
 INDEX idx_shipment_miller(miller_id,season_id,status), INDEX idx_shipment_vehicle(vehicle_id,dispatched_at)
) ENGINE=InnoDB;

CREATE TABLE shipment_lots (
 shipment_id INT UNSIGNED NOT NULL, procurement_id INT UNSIGNED NOT NULL, quantity_g BIGINT UNSIGNED NOT NULL,
 PRIMARY KEY(shipment_id,procurement_id), FOREIGN KEY(shipment_id) REFERENCES shipments(id),
 FOREIGN KEY(procurement_id) REFERENCES procurement(id)
) ENGINE=InnoDB;

CREATE TABLE shipment_events (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, shipment_id INT UNSIGNED NOT NULL,
 event_type VARCHAR(40) NOT NULL, occurred_at DATETIME(3) NOT NULL, detail JSON NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(shipment_id) REFERENCES shipments(id), INDEX idx_event_shipment(shipment_id,occurred_at,id)
) ENGINE=InnoDB;

CREATE TABLE gps_packets (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, device_id INT UNSIGNED NOT NULL,
 gps_at DATETIME(3) NOT NULL, latitude DECIMAL(10,7) NOT NULL, longitude DECIMAL(10,7) NOT NULL,
 speed_kph DECIMAL(7,2) NOT NULL, packet_type VARCHAR(20) NOT NULL, raw_payload JSON NOT NULL,
 processing_result VARCHAR(40) NOT NULL,
 received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_gps_packet(device_id,gps_at), FOREIGN KEY(device_id) REFERENCES gps_devices(id)
) ENGINE=InnoDB;

CREATE TABLE stock_ledger (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, facility_id INT UNSIGNED NOT NULL,
 season_id INT UNSIGNED NOT NULL, commodity ENUM('PADDY','RICE') NOT NULL,
 on_hand_delta_g BIGINT NOT NULL, reserved_delta_g BIGINT NOT NULL,
 reference_type VARCHAR(30) NOT NULL, reference_id INT UNSIGNED NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(facility_id) REFERENCES facilities(id), FOREIGN KEY(season_id) REFERENCES seasons(id),
 INDEX idx_ledger_facility(facility_id,season_id,commodity,id)
) ENGINE=InnoDB;

CREATE TABLE request_keys (
 actor VARCHAR(80) NOT NULL, route VARCHAR(150) NOT NULL, request_key VARCHAR(120) NOT NULL,
 payload_hash CHAR(64) NOT NULL, response JSON NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(actor,route,request_key)
) ENGINE=InnoDB;

CREATE TABLE audit_log (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, actor VARCHAR(80) NOT NULL,
 action VARCHAR(150) NOT NULL, request_id CHAR(36) NOT NULL, entity_id VARCHAR(80) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX idx_audit_date(created_at,id)
) ENGINE=InnoDB;
