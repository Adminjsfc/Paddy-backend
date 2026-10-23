ALTER TABLE route_tags
 ADD COLUMN created_by INT UNSIGNED NULL AFTER active,
 ADD COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER created_by,
 ADD COLUMN unassigned_by INT UNSIGNED NULL AFTER created_at,
 ADD COLUMN unassigned_at DATETIME(3) NULL AFTER unassigned_by,
 ADD INDEX idx_route_tag_source_assignment (season_id,source_id,active),
 ADD INDEX idx_route_tag_destination_assignment (season_id,destination_id,active);

ALTER TABLE route_tags
 ADD CONSTRAINT fk_route_tag_created_by FOREIGN KEY (created_by) REFERENCES users(id),
 ADD CONSTRAINT fk_route_tag_unassigned_by FOREIGN KEY (unassigned_by) REFERENCES users(id);
