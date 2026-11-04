// Keep submitted codes on the original rows even when no master exists yet.
export async function unlinkPushMasters(connection) {
  const tables=['procurement','cmr_orders','route_tags','miller_store_assignments'];
  for(const table of tables){
    const [keys]=await connection.execute(`SELECT DISTINCT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND REFERENCED_TABLE_NAME IN ('seasons','facilities','farmers')`,[table]);
    for(const key of keys)await connection.query('ALTER TABLE `'+table+'` DROP FOREIGN KEY `'+key.CONSTRAINT_NAME.replaceAll('`','``')+'`');
  }
  const columns={procurement:['season_code','facility_code','farmer_code'],cmr_orders:['season_code','miller_code','destination_code']};
  for(const [table,names] of Object.entries(columns)){
    for(const name of names){
      const [found]=await connection.execute('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',[table,name]);
      if(!found.length)await connection.query(`ALTER TABLE ${table} ADD COLUMN ${name} VARCHAR(80) NULL`);
    }
  }
  await connection.query('ALTER TABLE procurement MODIFY season_id INT UNSIGNED NULL, MODIFY facility_id INT UNSIGNED NULL');
  await connection.query('ALTER TABLE cmr_orders MODIFY season_id INT UNSIGNED NULL, MODIFY miller_id INT UNSIGNED NULL, MODIFY destination_id INT UNSIGNED NULL');
  await connection.query(`UPDATE procurement p LEFT JOIN seasons s ON s.id=p.season_id
    LEFT JOIN facilities f ON f.id=p.facility_id LEFT JOIN farmers fr ON fr.id=p.farmer_id
    SET p.season_code=COALESCE(p.season_code,s.code),p.facility_code=COALESCE(p.facility_code,f.code),p.farmer_code=COALESCE(p.farmer_code,fr.code)`);
  await connection.query(`UPDATE cmr_orders o LEFT JOIN seasons s ON s.id=o.season_id
    LEFT JOIN facilities m ON m.id=o.miller_id LEFT JOIN facilities d ON d.id=o.destination_id
    SET o.season_code=COALESCE(o.season_code,s.code),o.miller_code=COALESCE(o.miller_code,m.code),o.destination_code=COALESCE(o.destination_code,d.code)`);
}
