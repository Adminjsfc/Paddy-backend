const quote=value=>'`'+String(value).replaceAll('`','``')+'`';
async function fields(connection,table) {
  const [data]=await connection.execute('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[table]);
  return new Set(data.map(row=>row.COLUMN_NAME));
}
async function addFields(connection,table,definitions) {
  const existing=await fields(connection,table);
  for(const [name,definition] of Object.entries(definitions))if(!existing.has(name))await connection.query(`ALTER TABLE ${quote(table)} ADD COLUMN ${quote(name)} ${definition}`);
}
export async function normalizeStockAudit(connection) {
  for(const table of ['stocks','stock_ledger']){
    await addFields(connection,table,{
      scheme_id:'INT UNSIGNED NULL',commodity_id:'INT UNSIGNED NULL',
      created_at:'DATETIME NULL DEFAULT NULL',created_by:'INT UNSIGNED NULL',
      updated_at:'DATETIME NULL',updated_by:'INT UNSIGNED NULL',
      created_by_actor:'VARCHAR(160) NULL',updated_by_actor:'VARCHAR(160) NULL',
      status:'TINYINT UNSIGNED NOT NULL DEFAULT 1 CHECK(status IN (0,1))'
    });
    const existing=await fields(connection,table);
    if(existing.has('scheme_code')&&existing.has('commodity'))await connection.query(`UPDATE ${quote(table)} b JOIN schemes s ON s.code=b.scheme_code JOIN commodities c ON c.code=b.commodity SET b.scheme_id=s.id,b.commodity_id=c.id`);
    const [missing]=await connection.query(`SELECT facility_id FROM ${quote(table)} WHERE scheme_id IS NULL OR commodity_id IS NULL LIMIT 1`);
    if(missing.length)throw Error(table+' contains an unknown scheme/commodity; data preserved. Resolve masters before retrying.');
  }
  // Preserve known history; absent historical provenance stays NULL.
  await connection.query(`UPDATE stocks s LEFT JOIN (
    SELECT facility_id,season_id,scheme_id,commodity_id,MIN(created_at) first_at,MAX(created_at) last_at
    FROM stock_ledger GROUP BY facility_id,season_id,scheme_id,commodity_id
    ) l ON l.facility_id=s.facility_id AND l.season_id=s.season_id AND l.scheme_id=s.scheme_id AND l.commodity_id=s.commodity_id
    SET s.created_at=l.first_at,s.updated_at=l.last_at WHERE s.created_at IS NULL`);
  const stockFields=await fields(connection,'stocks');
  if(!stockFields.has('id'))await connection.query(`ALTER TABLE stocks DROP PRIMARY KEY,
    ADD COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST,
    ADD UNIQUE KEY uq_stock_balance(facility_id,season_id,scheme_id,commodity_id)`);
  const [indexes]=await connection.query("SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='stock_ledger' AND INDEX_NAME='idx_ledger_balance'");
  if(!indexes.length)await connection.query('ALTER TABLE stock_ledger ADD INDEX idx_ledger_balance(facility_id,season_id,scheme_id,commodity_id,id)');
  for(const table of ['stocks','stock_ledger']){
    const [keys]=await connection.execute("SELECT DISTINCT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND REFERENCED_TABLE_NAME IS NOT NULL AND COLUMN_NAME IN ('scheme_code','commodity')",[table]);
    for(const key of keys)await connection.query(`ALTER TABLE ${quote(table)} DROP FOREIGN KEY ${quote(key.CONSTRAINT_NAME)}`);
    const [indexes]=await connection.execute("SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME IN ('scheme_code','commodity')",[table]);
    for(const index of indexes)await connection.query(`ALTER TABLE ${quote(table)} DROP INDEX ${quote(index.INDEX_NAME)}`);
    const existing=await fields(connection,table);
    for(const column of ['scheme_code','commodity'])if(existing.has(column))await connection.query(`ALTER TABLE ${quote(table)} DROP COLUMN ${quote(column)}`);
    await connection.query(`ALTER TABLE ${quote(table)} MODIFY scheme_id INT UNSIGNED NOT NULL, MODIFY commodity_id INT UNSIGNED NOT NULL`);
    const [constraints]=await connection.execute('SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[table]);
    const names=new Set(constraints.map(row=>row.CONSTRAINT_NAME));
    for(const [column,target] of [['scheme_id','schemes'],['commodity_id','commodities'],['created_by','users'],['updated_by','users']]){
      const name=`fk_${table}_${column}`;
      if(!names.has(name))await connection.query(`ALTER TABLE ${quote(table)} ADD CONSTRAINT ${quote(name)} FOREIGN KEY(${quote(column)}) REFERENCES ${quote(target)}(id)`);
    }
  }
  await connection.query('ALTER TABLE stocks MODIFY created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP');
}
