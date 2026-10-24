ALTER TABLE users
 DROP CONSTRAINT chk_user_scope,
 ADD CONSTRAINT chk_user_scope CHECK (
 (role IN ('ADMIN','OPERATOR') AND miller_id IS NULL AND transporter_id IS NULL AND facility_id IS NULL)
 OR (role='DRIVER' AND miller_id IS NULL AND transporter_id IS NULL)
 OR (role='MILLER' AND miller_id IS NOT NULL AND transporter_id IS NULL AND facility_id=miller_id)
 OR (role='TRANSPORTER' AND miller_id IS NOT NULL AND transporter_id IS NOT NULL AND facility_id IS NULL)
 OR (role IN ('PACS','LAMPS') AND miller_id IS NULL AND transporter_id IS NULL AND facility_id IS NOT NULL)
 );

UPDATE users u
 LEFT JOIN users creator ON creator.id=u.created_by
 LEFT JOIN (SELECT driver_id,MIN(facility_id) facility_id FROM driver_owners GROUP BY driver_id) owners ON owners.driver_id=u.id
 SET u.facility_id=COALESCE(
 CASE WHEN creator.role IN ('PACS','LAMPS') THEN creator.facility_id WHEN creator.role='MILLER' THEN creator.miller_id END,
 owners.facility_id)
 WHERE u.role='DRIVER' AND u.facility_id IS NULL;
