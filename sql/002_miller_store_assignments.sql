CREATE TABLE miller_store_assignments (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 season_id INT UNSIGNED NOT NULL,
 miller_id INT UNSIGNED NOT NULL,
 store_id INT UNSIGNED NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_miller_store_assignment (season_id,miller_id,store_id),
 INDEX idx_miller_assignments (miller_id,season_id,active),
 INDEX idx_store_assignments (store_id,season_id,active),
 FOREIGN KEY (season_id) REFERENCES seasons(id),
 FOREIGN KEY (miller_id) REFERENCES facilities(id),
 FOREIGN KEY (store_id) REFERENCES facilities(id),
 CHECK (miller_id <> store_id)
) ENGINE=InnoDB;

-- Preserve existing active Miller-to-store route tags as assignments during upgrade.
INSERT IGNORE INTO miller_store_assignments (season_id,miller_id,store_id,active)
SELECT r.season_id,r.source_id,r.destination_id,r.active
FROM route_tags r
JOIN facilities m ON m.id=r.source_id AND m.kind='MILLER'
JOIN facilities s ON s.id=r.destination_id AND s.kind IN ('SFC_GODOWN','FCI');
