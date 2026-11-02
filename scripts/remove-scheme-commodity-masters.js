const quote = name => '`' + String(name).replaceAll('`', '``') + '`';
const tables = ['procurement', 'stocks', 'stock_ledger', 'shipments'];
async function columns(connection, table) {
  const [rows] = await connection.execute('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [table]);
  return new Set(rows.map(row => row.COLUMN_NAME));
}
export async function removeSchemeCommodityMasters(connection) {
  for (const table of tables) {
    const fields = await columns(connection, table);
    for (const [old, target, master] of [['scheme_id','scheme_code','schemes'], ['commodity_id','commodity_code','commodities']]) {
      if (!fields.has(target)) await connection.query(`ALTER TABLE ${quote(table)} ADD COLUMN ${quote(target)} VARCHAR(80) NULL`);
      if (fields.has(old)) await connection.query(`UPDATE ${quote(table)} t JOIN ${quote(master)} m ON m.id=t.${quote(old)} SET t.${quote(target)}=m.code`);
    }
    const [missing] = await connection.query(`SELECT id FROM ${quote(table)} WHERE scheme_code IS NULL OR commodity_code IS NULL LIMIT 1`);
    if (missing.length) throw new Error(`${table}: unresolved scheme/commodity codes; master tables have not been removed`);
    await connection.query(`ALTER TABLE ${quote(table)} MODIFY scheme_code VARCHAR(80) NOT NULL, MODIFY commodity_code VARCHAR(80) NOT NULL`);
    // Build equivalent indexes first, including uniqueness of each stock balance.
    const [indexes] = await connection.execute('SELECT INDEX_NAME,NON_UNIQUE,COLUMN_NAME,SEQ_IN_INDEX FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY INDEX_NAME,SEQ_IN_INDEX', [table]);
    const groups = new Map();
    for (const index of indexes) {
      if (!groups.has(index.INDEX_NAME)) groups.set(index.INDEX_NAME, []);
      groups.get(index.INDEX_NAME).push(index);
    }
    for (const [name, parts] of groups) {
      if (!parts.some(p => ['scheme_id','commodity_id'].includes(p.COLUMN_NAME))) continue;
      const replacement = 'codes_' + name;
      if (!groups.has(replacement)) {
        const names = parts.map(p => quote(p.COLUMN_NAME.replace('scheme_id','scheme_code').replace('commodity_id','commodity_code'))).join(',');
        await connection.query(`ALTER TABLE ${quote(table)} ADD ${parts[0].NON_UNIQUE ? '' : 'UNIQUE '}INDEX ${quote(replacement)} (${names})`);
      }
    }
  }
  const [keys] = await connection.execute("SELECT TABLE_NAME,CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IN ('schemes','commodities')");
  for (const key of keys) await connection.query(`ALTER TABLE ${quote(key.TABLE_NAME)} DROP FOREIGN KEY ${quote(key.CONSTRAINT_NAME)}`);
  const [views] = await connection.execute("SELECT TABLE_NAME,VIEW_DEFINITION FROM information_schema.VIEWS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('shipment_details','shipments_ist') ORDER BY FIELD(TABLE_NAME,'shipment_details','shipments_ist')");
  for (const view of views) {
    const definition = view.VIEW_DEFINITION.replaceAll('scheme_id','scheme_code').replaceAll('commodity_id','commodity_code');
    await connection.query(`CREATE OR REPLACE SQL SECURITY INVOKER VIEW ${quote(view.TABLE_NAME)} AS ${definition}`);
  }
  for (const table of tables) {
    const [indexes] = await connection.execute("SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME IN ('scheme_id','commodity_id')", [table]);
    for (const index of indexes) await connection.query(`ALTER TABLE ${quote(table)} DROP INDEX ${quote(index.INDEX_NAME)}`);
    const fields = await columns(connection, table);
    for (const field of ['scheme_id','commodity_id']) if (fields.has(field)) await connection.query(`ALTER TABLE ${quote(table)} DROP COLUMN ${quote(field)}`);
  }
  await connection.query('DROP TABLE IF EXISTS schemes,commodities');
}
