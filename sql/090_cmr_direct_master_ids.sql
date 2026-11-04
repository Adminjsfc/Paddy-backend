UPDATE cmr_orders o LEFT JOIN seasons s ON s.code=o.season_code
 LEFT JOIN facilities m ON m.code=o.miller_code AND m.kind='MILLER'
 LEFT JOIN facilities d ON d.code=o.destination_code AND d.kind IN ('SFC_GODOWN','FCI')
 SET o.season_id=COALESCE(o.season_id,s.id),o.miller_id=COALESCE(o.miller_id,m.id),o.destination_id=COALESCE(o.destination_id,d.id);
ALTER TABLE cmr_orders DROP COLUMN season_code, DROP COLUMN miller_code, DROP COLUMN destination_code;
