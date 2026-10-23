-- Run before migration 009, which adds foreign keys to these tables.
-- Existing imported masters and their source IDs are preserved.
CREATE TABLE IF NOT EXISTS tbl_district_master (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 id_old INT NOT NULL,
 district_name VARCHAR(255) NULL,
 c_by INT NULL,
 c_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 d_by INT NULL,
 d_date DATETIME NULL,
 status TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS tbl_block_master (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 district_id INT NULL,
 block_name VARCHAR(255) NULL,
 rgi_block_code INT NULL,
 c_by INT NULL,
 c_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 d_by INT NULL,
 d_date DATETIME NULL,
 INDEX idx_block_district (district_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
