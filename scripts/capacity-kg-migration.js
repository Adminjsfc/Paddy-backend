export async function capacityKg(connection) {
  for (const [table, fields] of [
    ['facilities', [['capacity_g', 'capacity_kg', false], ['milling_capacity_g_per_day', 'milling_capacity_kg_per_day', true]]],
    ['vehicles', [['capacity_g', 'capacity_kg', false]]]
  ]) {
    const [columns] = await connection.query(`SHOW COLUMNS FROM \`${table}\``);
    const names = new Set(columns.map(column => column.Field));
    for (const [oldName, newName, nullable] of fields) {
      if (!names.has(oldName)) {
        if (!names.has(newName)) throw new Error(`${table}: missing capacity column ${newName}`);
        continue;
      }
      if (!names.has(newName)) await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${newName}\` DECIMAL(20,3) UNSIGNED NULL`);
      await connection.query(`UPDATE \`${table}\` SET \`${newName}\`=\`${oldName}\`/1000`);
      const [invalid] = await connection.query(`SELECT id FROM \`${table}\` WHERE NOT (\`${newName}\` <=> \`${oldName}\`/1000) LIMIT 1`);
      if (invalid.length) throw new Error(`${table}: capacity conversion did not preserve original values`);
      await connection.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${newName}\` DECIMAL(20,3) UNSIGNED ${nullable ? 'NULL' : 'NOT NULL'}, DROP COLUMN \`${oldName}\``);
    }
  }
}
