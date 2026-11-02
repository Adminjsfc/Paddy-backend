// Keep historical values outside operational tables before removing the field.
const tables = ['facilities', 'farmers', 'transporters', 'imeis', 'gps_devices', 'shipments'];
export async function removeBlockLocation(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS retired_block_locations (
    entity_type VARCHAR(32) NOT NULL,
    entity_id INT UNSIGNED NOT NULL,
    legacy_block_id INT NULL,
    archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(entity_type,entity_id)
  ) ENGINE=InnoDB`);
  // Read both definitions before replacing the view on which the second depends.
  const [views] = await connection.execute(
    "SELECT TABLE_NAME,VIEW_DEFINITION FROM information_schema.VIEWS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('shipment_details','shipments_ist') ORDER BY FIELD(TABLE_NAME,'shipment_details','shipments_ist')");
  for (const view of views) {
    const definition = view.VIEW_DEFINITION.replace(/,\s*`s`\.`block_id`\s+AS\s+`block_id`/gi, '');
    if (/\bblock_id\b/i.test(definition)) throw new Error(`Unexpected block projection in ${view.TABLE_NAME}; review the view before migration`);
    await connection.query(`CREATE OR REPLACE SQL SECURITY INVOKER VIEW \`${view.TABLE_NAME}\` AS ${definition}`);
  }
  for (const table of tables) {
    const [columns] = await connection.execute(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME='block_id'", [table]);
    if (!columns.length) continue;
    await connection.query(`INSERT IGNORE INTO retired_block_locations(entity_type,entity_id,legacy_block_id)
      SELECT '${table}',id,block_id FROM \`${table}\``);
    const [keys] = await connection.execute(
      "SELECT DISTINCT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME='block_id' AND REFERENCED_TABLE_NAME IS NOT NULL", [table]);
    for (const key of keys) {
      const name = key.CONSTRAINT_NAME.replaceAll('`', '``');
      await connection.query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${name}\``);
    }
    await connection.query(`ALTER TABLE \`${table}\` DROP COLUMN block_id`);
  }
}
