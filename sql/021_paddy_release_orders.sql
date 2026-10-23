CREATE TABLE IF NOT EXISTS paddy_release_orders (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 ro_no VARCHAR(100) NOT NULL UNIQUE,
 season_id INT UNSIGNED NOT NULL,
 commodity ENUM('PADDY') NOT NULL DEFAULT 'PADDY',
 quantity_g BIGINT UNSIGNED NOT NULL,
 source_id INT UNSIGNED NOT NULL,
 destination_id INT UNSIGNED NOT NULL,
 status ENUM('OPEN','CLOSED','CANCELLED') NOT NULL DEFAULT 'OPEN',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(season_id) REFERENCES seasons(id),
 FOREIGN KEY(source_id) REFERENCES facilities(id),
 FOREIGN KEY(destination_id) REFERENCES facilities(id),
 INDEX idx_paddy_ro_source(source_id,season_id,status),
 INDEX idx_paddy_ro_destination(destination_id,season_id,status),
 CHECK(quantity_g>0), CHECK(source_id<>destination_id)
) ENGINE=InnoDB;
