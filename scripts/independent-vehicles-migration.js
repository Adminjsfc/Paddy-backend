const quote=name=>'`'+String(name).replaceAll('`','``')+'`';
async function columns(connection,table) {
  const [rows]=await connection.execute('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[table]);
  return new Set(rows.map(row=>row.COLUMN_NAME));
}
export async function independentVehicles(connection) {
  let fields=await columns(connection,'vehicles');
  for(const [name,type] of [['transporter_name','VARCHAR(150)'],['transporter_contact_no','VARCHAR(20)'],['district_id','INT']]) {
    if(!fields.has(name))await connection.query(`ALTER TABLE vehicles ADD COLUMN ${quote(name)} ${type} NULL`);
  }
  // Copy known transporter data. Unknown legacy contacts remain NULL for correction.
  if(fields.has('transporter_id'))await connection.query(`UPDATE vehicles v
    LEFT JOIN transporters t ON t.id=v.transporter_id
    LEFT JOIN facilities f ON f.id=COALESCE(v.miller_id,t.miller_id)
    SET v.transporter_name=COALESCE(v.transporter_name,t.name),
      v.transporter_contact_no=COALESCE(v.transporter_contact_no,t.phone),
      v.district_id=COALESCE(v.district_id,t.district_id,f.district_id)`);
  const [keys]=await connection.execute("SELECT DISTINCT TABLE_NAME,CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL AND ((TABLE_NAME='vehicles' AND COLUMN_NAME IN ('miller_id','transporter_id')) OR (TABLE_NAME='users' AND COLUMN_NAME='transporter_id'))");
  for(const key of keys)await connection.query(`ALTER TABLE ${quote(key.TABLE_NAME)} DROP FOREIGN KEY ${quote(key.CONSTRAINT_NAME)}`);
  const userFields=await columns(connection,'users');
  if(userFields.has('transporter_id')) {
    const [checks]=await connection.query("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND CONSTRAINT_TYPE='CHECK' AND CONSTRAINT_NAME='chk_user_scope'");
    const [[version]]=await connection.query('SELECT VERSION() version');
    if(checks.length)await connection.query('ALTER TABLE users '+(/mariadb/i.test(version.version)?'DROP CONSTRAINT ':'DROP CHECK ')+'chk_user_scope');
    await connection.query("UPDATE users SET miller_id=NULL,facility_id=NULL WHERE role='TRANSPORTER'");
    await connection.query('ALTER TABLE users DROP COLUMN transporter_id');
  }
  const [scopeCheck]=await connection.query("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND CONSTRAINT_TYPE='CHECK' AND CONSTRAINT_NAME='chk_user_scope'");
  if(!scopeCheck.length) {
    await connection.query(`ALTER TABLE users ADD CONSTRAINT chk_user_scope CHECK (
      (role IN ('ADMIN','OPERATOR','TRANSPORTER') AND miller_id IS NULL AND facility_id IS NULL)
      OR (role='DRIVER' AND miller_id IS NULL)
      OR (role='MILLER' AND miller_id IS NOT NULL AND facility_id=miller_id)
      OR (role IN ('PACS','LAMPS') AND miller_id IS NULL AND facility_id IS NOT NULL))`);
  }
  const [indexes]=await connection.query("SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vehicles' AND COLUMN_NAME IN ('miller_id','transporter_id')");
  for(const index of indexes)await connection.query('ALTER TABLE vehicles DROP INDEX '+quote(index.INDEX_NAME));
  fields=await columns(connection,'vehicles');
  for(const field of ['miller_id','transporter_id'])if(fields.has(field))await connection.query('ALTER TABLE vehicles DROP COLUMN '+quote(field));
  const [districtIndex]=await connection.query("SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vehicles' AND INDEX_NAME='idx_vehicle_district'");
  if(!districtIndex.length)await connection.query('ALTER TABLE vehicles ADD INDEX idx_vehicle_district(district_id,active)');
  await connection.query("DELETE FROM module_permissions WHERE module_key='transporters'");
  await connection.query('DROP TABLE IF EXISTS transporters');
}
