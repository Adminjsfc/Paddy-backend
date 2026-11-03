export async function capacityUnits(connection) {
  for (const [table, fields] of [
    ['facilities', [['capacity_kg', 'capacity_value', 'capacity_unit', false], ['milling_capacity_kg_per_day', 'milling_capacity_value_per_day', 'milling_capacity_unit', true]]],
    ['vehicles', [['capacity_kg', 'capacity_value', 'capacity_unit', false]]]
  ]) {
    const [columns] = await connection.query(`SHOW COLUMNS FROM \`${table}\``);
    const names = new Set(columns.map(column => column.Field));
    for (const [oldName, valueName, unitName, nullable] of fields) {
      if (!names.has(oldName)) {
        if (!names.has(valueName) || !names.has(unitName)) throw new Error(`${table}: missing capacity value/unit columns`);
        continue;
      }
      if (!names.has(valueName)) await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${valueName}\` DECIMAL(23,6) UNSIGNED NULL`);
      if (!names.has(unitName)) await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${unitName}\` ENUM('KG','QTL','MT') NULL`);
      // Original input units were not retained by the old schema. Represent legacy
      // capacities in MT without changing their physical weight, including 1 gram.
      await connection.query(`UPDATE \`${table}\` SET \`${valueName}\`=\`${oldName}\`/1000, \`${unitName}\`=IF(\`${oldName}\` IS NULL,NULL,'MT')`);
      const [invalid] = await connection.query(`SELECT id FROM \`${table}\` WHERE NOT (\`${valueName}\`*1000 <=> \`${oldName}\`) LIMIT 1`);
      if (invalid.length) throw new Error(`${table}: capacity unit conversion changed physical weight`);
      const nullability = nullable ? 'NULL' : 'NOT NULL';
      await connection.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${valueName}\` DECIMAL(23,6) UNSIGNED ${nullability}, MODIFY COLUMN \`${unitName}\` ENUM('KG','QTL','MT') ${nullability}, DROP COLUMN \`${oldName}\``);
    }
  }
}
