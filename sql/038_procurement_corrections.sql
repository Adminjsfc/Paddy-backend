CREATE TABLE IF NOT EXISTS procurement_references (
 external_ref VARCHAR(120) NOT NULL PRIMARY KEY,
 procurement_id INT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(procurement_id) REFERENCES procurement(id),
 INDEX idx_procurement_reference_owner(procurement_id)
) ENGINE=InnoDB;

INSERT INTO procurement_references(external_ref,procurement_id)
 SELECT external_ref,id FROM procurement
 ON DUPLICATE KEY UPDATE external_ref=VALUES(external_ref);

CREATE TABLE IF NOT EXISTS procurement_corrections (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 procurement_id INT UNSIGNED NOT NULL,
 old_external_ref VARCHAR(120) NOT NULL,
 new_external_ref VARCHAR(120) NOT NULL,
 old_quantity_g BIGINT UNSIGNED NOT NULL,
 new_quantity_g BIGINT UNSIGNED NOT NULL,
 reason VARCHAR(500) NOT NULL,
 created_by INT UNSIGNED NULL,
 created_by_actor VARCHAR(160) NOT NULL,
 request_id VARCHAR(80) NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(procurement_id) REFERENCES procurement(id),
 FOREIGN KEY(created_by) REFERENCES users(id),
 INDEX idx_procurement_correction(procurement_id,id)
) ENGINE=InnoDB;
