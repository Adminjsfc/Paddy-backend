ALTER TABLE route_tags
 DROP FOREIGN KEY fk_route_tags_updated_by,
 DROP COLUMN updated_by,
 DROP COLUMN updated_at;

ALTER TABLE miller_store_assignments
 DROP FOREIGN KEY fk_miller_store_updated_by,
 DROP COLUMN updated_by,
 DROP COLUMN updated_at;
