// Migration 008a creates missing location masters. Data comes from the source.
// The location migrations reference signed INT primary/indexed IDs in InnoDB.
export async function checkLocationPrerequisites(connection) {
  for (const table of ['tbl_district_master','tbl_block_master']) {
    const [tables]=await connection.execute(
      'SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[table]);
    if (!tables.length) throw new Error(`Missing location master table ${table}. Apply 008a_location_masters.sql before retrying db:migrate. See docs/DEPLOYMENT.md (Location master prerequisites).`);
    if (tables[0].ENGINE?.toUpperCase()!=='INNODB') throw new Error(`Location master ${table} must use InnoDB to support the location foreign keys. Have the database owner review its storage engine before retrying.`);
    const [columns]=await connection.execute(
      "SELECT DATA_TYPE,COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME='id'",[table]);
    if (!columns.length || columns[0].DATA_TYPE!=='int' || /unsigned/i.test(columns[0].COLUMN_TYPE)) {
      throw new Error(`Location master ${table}.id must match the signed INT location columns in migrations 009 and 012. Review the imported schema and align the column types before retrying.`);
    }
    const [indexes]=await connection.execute(
      "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME='id' AND SEQ_IN_INDEX=1",[table]);
    if (!indexes.length) throw new Error(`Location master ${table}.id needs an index beginning with id before the location foreign keys can be created.`);
  }
}
