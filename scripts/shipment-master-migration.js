const identifier=value=>'`'+String(value).replaceAll('`','``')+'`';

export async function normalizeShipmentMasters(connection) {
  const [columns]=await connection.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='shipments'");
  const fields=new Set(columns.map(row=>row.COLUMN_NAME));
  // Validate historical labels before dropping them. Do not guess mappings when
  // an old submission disagrees with its stock scheme or commodity.
  if(fields.has('scheme_type')){
    const [conflicts]=await connection.query("SELECT id FROM shipments WHERE NULLIF(TRIM(scheme_type),'') IS NOT NULL AND scheme_type<>scheme_code LIMIT 1");
    if(conflicts.length)throw Error(`Shipment ${conflicts[0].id}: scheme_type and scheme_code disagree. Data preserved; reconcile the stock scheme before retrying.`);
  }
  if(fields.has('commodity_type')){
    const [conflicts]=await connection.query("SELECT id FROM shipments WHERE NULLIF(TRIM(commodity_type),'') IS NOT NULL AND commodity_type<>CASE WHEN leg='PADDY' THEN 'PADDY' ELSE 'RICE' END LIMIT 1");
    if(conflicts.length)throw Error(`Shipment ${conflicts[0].id}: commodity_type does not match its leg. Data preserved; resolve the commodity before retrying.`);
  }
  for(const field of ['scheme_id','commodity_id','vehicle_type_id']){
    if(!fields.has(field))await connection.query(`ALTER TABLE shipments ADD COLUMN ${field} INT UNSIGNED NULL`);
  }
  if(fields.has('scheme_code'))await connection.query('UPDATE shipments s JOIN schemes sc ON sc.code=s.scheme_code SET s.scheme_id=sc.id');
  await connection.query("UPDATE shipments s JOIN commodities co ON co.code=CASE WHEN s.leg='PADDY' THEN 'PADDY' ELSE 'RICE' END SET s.commodity_id=co.id WHERE s.commodity_id IS NULL");
  if(fields.has('submitted_vehicle_type')){
    // Preserve the submitted vehicle type as a master ID even if the vehicle's
    // current type has since changed. Ambiguous old names require reconciliation.
    await connection.query(`UPDATE shipments s JOIN vehicles v ON v.id=s.vehicle_id
      LEFT JOIN vehicle_types current_type ON current_type.id=v.vehicle_type_id
      LEFT JOIN (SELECT name,MIN(id) id FROM vehicle_types GROUP BY name HAVING COUNT(*)=1) historical_type ON historical_type.name=s.submitted_vehicle_type
      SET s.vehicle_type_id=CASE
        WHEN NULLIF(TRIM(s.submitted_vehicle_type),'') IS NULL THEN v.vehicle_type_id
        WHEN current_type.name=s.submitted_vehicle_type THEN current_type.id
        ELSE historical_type.id END WHERE s.vehicle_type_id IS NULL`);
    const [missing]=await connection.query("SELECT id FROM shipments WHERE NULLIF(TRIM(submitted_vehicle_type),'') IS NOT NULL AND vehicle_type_id IS NULL LIMIT 1");
    if(missing.length)throw Error(`Shipment ${missing[0].id}: submitted_vehicle_type has no unambiguous master mapping. Data preserved; resolve the vehicle type before retrying.`);
  }
  const [missing]=await connection.query(`SELECT s.id FROM shipments s
    LEFT JOIN schemes sc ON sc.id=s.scheme_id LEFT JOIN commodities co ON co.id=s.commodity_id
    LEFT JOIN vehicle_types vt ON vt.id=s.vehicle_type_id
    WHERE sc.id IS NULL OR co.id IS NULL OR co.code<>CASE WHEN s.leg='PADDY' THEN 'PADDY' ELSE 'RICE' END
      OR (s.vehicle_type_id IS NOT NULL AND vt.id IS NULL) LIMIT 1`);
  if(missing.length)throw Error(`Shipment ${missing[0].id}: invalid scheme, commodity or vehicle type mapping. Data preserved; resolve masters before retrying.`);
  const [oldKeys]=await connection.query("SELECT DISTINCT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='shipments' AND COLUMN_NAME IN ('scheme_code','scheme_type','commodity_type','submitted_vehicle_type') AND REFERENCED_TABLE_NAME IS NOT NULL");
  for(const key of oldKeys)await connection.query('ALTER TABLE shipments DROP FOREIGN KEY '+identifier(key.CONSTRAINT_NAME));
  const drops=['scheme_code','scheme_type','commodity_type','submitted_vehicle_type'].filter(field=>fields.has(field)).map(field=>'DROP COLUMN '+identifier(field));
  if(drops.length)await connection.query('ALTER TABLE shipments '+drops.join(', '));
  await connection.query('ALTER TABLE shipments MODIFY scheme_id INT UNSIGNED NOT NULL, MODIFY commodity_id INT UNSIGNED NOT NULL');
  const [keys]=await connection.query("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='shipments'");
  const names=new Set(keys.map(row=>row.CONSTRAINT_NAME));
  for(const [column,table] of [['scheme_id','schemes'],['commodity_id','commodities'],['vehicle_type_id','vehicle_types']]){
    const name='fk_shipments_'+column;
    if(!names.has(name))await connection.query(`ALTER TABLE shipments ADD CONSTRAINT ${name} FOREIGN KEY(${column}) REFERENCES ${table}(id)`);
  }
}
