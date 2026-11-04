// Run with API/worker writers stopped. Historical migration files stay unchanged.
const quote = name => '`' + String(name).replaceAll('`', '``') + '`';
export const quantityTables = ['procurement', 'shipments', 'shipment_lots', 'stocks',
  'stock_ledger', 'procurement_corrections', 'cmr_orders', 'cmr_receipts',
  'cmr_receipt_stacks', 'milling_batches', 'test_stock_entries'];

export async function quantityKg(connection) {
  const [[version]] = await connection.query('SELECT VERSION() version');
  const dropCheck = /mariadb/i.test(version.version) ? 'DROP CONSTRAINT ' : 'DROP CHECK ';
  const sameTable = /mariadb/i.test(version.version) ? ' AND cc.TABLE_NAME=tc.TABLE_NAME' : '';
  for (const table of quantityTables) {
    const [columns] = await connection.execute(`SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`, [table]);
    const legacy = columns.filter(c => /_g$/.test(c.COLUMN_NAME));
    if (!legacy.length) continue; // Already converted, including after a partial migration.
    const names = new Set(columns.map(c => c.COLUMN_NAME));
    for (const c of legacy) {
      const target = c.COLUMN_NAME.replace(/_g$/, '_kg');
      if (!names.has(target)) await connection.query(`ALTER TABLE ${quote(table)} ADD COLUMN ${quote(target)} DECIMAL(20,3) NULL`);
    }
    await connection.query(`UPDATE ${quote(table)} SET ${legacy.map(c =>
      `${quote(c.COLUMN_NAME.replace(/_g$/, '_kg'))}=${quote(c.COLUMN_NAME)}/1000`).join(',')}`);
    const [invalid] = await connection.query(`SELECT 1 FROM ${quote(table)} WHERE ${legacy.map(c =>
      `NOT (${quote(c.COLUMN_NAME.replace(/_g$/, '_kg'))} <=> ${quote(c.COLUMN_NAME)}/1000)`).join(' OR ')} LIMIT 1`);
    if (invalid.length) throw new Error(`${table}: kilogram conversion did not preserve quantities`);
    const [checks] = await connection.execute(`SELECT tc.CONSTRAINT_NAME, cc.CHECK_CLAUSE
      FROM information_schema.TABLE_CONSTRAINTS tc JOIN information_schema.CHECK_CONSTRAINTS cc
      ON cc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME${sameTable}
      WHERE tc.TABLE_SCHEMA=DATABASE() AND tc.TABLE_NAME=? AND tc.CONSTRAINT_TYPE='CHECK'`, [table]);
    const affected = checks.filter(c => legacy.some(field =>
      new RegExp('\\b' + field.COLUMN_NAME + '\\b').test(c.CHECK_CLAUSE)));
    const operations = affected.map(c => dropCheck + quote(c.CONSTRAINT_NAME));
    for (const c of legacy) {
      const target = c.COLUMN_NAME.replace(/_g$/, '_kg');
      // All existing weight defaults are numeric zero or NULL.
      const rawDefault = c.COLUMN_DEFAULT;
      const hasDefault = rawDefault != null && String(rawDefault).toUpperCase() !== 'NULL';
      const defaultNumber = hasDefault ? Number(String(rawDefault).replaceAll("'", '')) / 1000 : null;
      if (hasDefault && !Number.isFinite(defaultNumber)) throw new Error(`${table}.${c.COLUMN_NAME}: unsupported default`);
      operations.push(`DROP COLUMN ${quote(c.COLUMN_NAME)}`,
        `MODIFY COLUMN ${quote(target)} DECIMAL(20,3) ${/unsigned/i.test(c.COLUMN_TYPE) ? 'UNSIGNED ' : ''}${c.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}${hasDefault ? ` DEFAULT ${defaultNumber}` : c.IS_NULLABLE === 'YES' ? ' DEFAULT NULL' : ''}`);
    }
    for (const c of affected) operations.push(`ADD CONSTRAINT ${quote(c.CONSTRAINT_NAME)} CHECK (${c.CHECK_CLAUSE.replace(/\b([a-z][a-z0-9_]*?)_g\b/g, '$1_kg')})`);
    await connection.query(`ALTER TABLE ${quote(table)} ${operations.join(',')}`);
  }
  const [bags] = await connection.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='shipments' AND COLUMN_NAME='received_bags'");
  if (!bags.length) await connection.query('ALTER TABLE shipments ADD COLUMN received_bags INT UNSIGNED NULL');
}
