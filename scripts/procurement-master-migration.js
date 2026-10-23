const identifier=value=>'`'+String(value).replaceAll('`','``')+'`';

async function columns(connection,table) {
  const [data]=await connection.execute('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[table]);
  return new Set(data.map(row=>row.COLUMN_NAME));
}

export async function normalizeProcurementMasters(connection) {
  let fields=await columns(connection,'procurement');
  for(const field of ['scheme_id','commodity_id'])if(!fields.has(field))await connection.query(`ALTER TABLE procurement ADD COLUMN ${field} INT UNSIGNED NULL`);
  if(fields.has('scheme_code')&&fields.has('commodity')){
    await connection.query('UPDATE procurement p JOIN schemes s ON s.code=p.scheme_code JOIN commodities c ON c.code=p.commodity SET p.scheme_id=s.id,p.commodity_id=c.id');
  }
  const [missing]=await connection.query('SELECT id FROM procurement WHERE scheme_id IS NULL OR commodity_id IS NULL LIMIT 1');
  if(missing.length)throw Error('Procurement '+missing[0].id+' has an unknown scheme/commodity. Data preserved; resolve master mappings before retrying.');
  const [keys]=await connection.execute("SELECT DISTINCT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement' AND REFERENCED_TABLE_NAME IS NOT NULL AND COLUMN_NAME IN ('scheme_code','commodity')");
  for(const key of keys)await connection.query('ALTER TABLE procurement DROP FOREIGN KEY '+identifier(key.CONSTRAINT_NAME));
  const [definition]=await connection.query('SHOW CREATE TABLE procurement');
  const checks=[...definition[0]['Create Table'].matchAll(/CONSTRAINT `([^`]+)` CHECK \((.*)\)/g)];
  for(const check of checks)if(/\bcommodity\b|\bscheme_code\b/i.test(check[2])){
    // MariaDB and MySQL use different DROP syntax for CHECK constraints.
    const [version]=await connection.query('SELECT VERSION() version');
    const syntax=/mariadb/i.test(version[0].version)?'DROP CONSTRAINT ':'DROP CHECK ';
    await connection.query('ALTER TABLE procurement '+syntax+identifier(check[1]));
  }
  const [oldIndex]=await connection.query("SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement' AND INDEX_NAME='idx_procurement_scheme'");
  if(oldIndex.length)await connection.query('ALTER TABLE procurement DROP INDEX idx_procurement_scheme');
  fields=await columns(connection,'procurement');
  for(const field of ['scheme_code','commodity'])if(fields.has(field))await connection.query('ALTER TABLE procurement DROP COLUMN '+identifier(field));
  await connection.query('ALTER TABLE procurement MODIFY scheme_id INT UNSIGNED NOT NULL, MODIFY commodity_id INT UNSIGNED NOT NULL');
  const [current]=await connection.query("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement'");
  const names=new Set(current.map(row=>row.CONSTRAINT_NAME));
  if(!names.has('fk_procurement_scheme'))await connection.query('ALTER TABLE procurement ADD CONSTRAINT fk_procurement_scheme FOREIGN KEY(scheme_id) REFERENCES schemes(id)');
  if(!names.has('fk_procurement_commodity'))await connection.query('ALTER TABLE procurement ADD CONSTRAINT fk_procurement_commodity FOREIGN KEY(commodity_id) REFERENCES commodities(id)');
  const [indexes]=await connection.query("SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement' AND INDEX_NAME='idx_procurement_master_lots'");
  if(!indexes.length)await connection.query('ALTER TABLE procurement ADD INDEX idx_procurement_master_lots(facility_id,season_id,scheme_id,commodity_id,procured_at,id)');
}

export async function removePaddyReleaseOrders(connection) {
  const fields=await columns(connection,'shipments');
  if(fields.has('release_order_id')){
    const [links]=await connection.query('SELECT id FROM shipments WHERE release_order_id IS NOT NULL LIMIT 1');
    if(links.length){
      await connection.query('CREATE TABLE IF NOT EXISTS archived_paddy_release_order_links (shipment_id INT UNSIGNED PRIMARY KEY,release_order_id INT UNSIGNED NOT NULL) ENGINE=InnoDB');
      await connection.query('INSERT INTO archived_paddy_release_order_links(shipment_id,release_order_id) SELECT id,release_order_id FROM shipments WHERE release_order_id IS NOT NULL ON DUPLICATE KEY UPDATE release_order_id=VALUES(release_order_id)');
    }
    const [keys]=await connection.query("SELECT DISTINCT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='shipments' AND COLUMN_NAME='release_order_id' AND REFERENCED_TABLE_NAME IS NOT NULL");
    for(const key of keys)await connection.query('ALTER TABLE shipments DROP FOREIGN KEY '+identifier(key.CONSTRAINT_NAME));
    const [indexes]=await connection.query("SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='shipments' AND INDEX_NAME='idx_shipment_release_order'");
    if(indexes.length)await connection.query('ALTER TABLE shipments DROP INDEX idx_shipment_release_order');
    await connection.query('ALTER TABLE shipments DROP COLUMN release_order_id');
  }
  const fieldsRO=await columns(connection,'paddy_release_orders');
  if(fieldsRO.size){
    const [records]=await connection.query('SELECT id FROM paddy_release_orders LIMIT 1');
    if(records.length){
      await connection.query('RENAME TABLE paddy_release_orders TO archived_paddy_release_orders');
      console.log('Existing Paddy RO history retained in archived_paddy_release_orders.');
    }else await connection.query('DROP TABLE paddy_release_orders');
  }
}
