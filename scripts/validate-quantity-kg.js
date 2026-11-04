import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {pool} from '../src/config/database.js';
import {quantityKg, quantityTables} from './quantity-kg-migration.js';

const schema = `paddy_quantity_${crypto.randomBytes(8).toString('hex')}_test`;
const quote = name => '`' + String(name).replaceAll('`', '``') + '`';
const connection = await pool.getConnection();
let created = false;
try {
  assert.match(schema, /^paddy_quantity_[0-9a-f]{16}_test$/);
  await connection.query(`CREATE DATABASE ${quote(schema)}`);
  created = true;
  await connection.query(`USE ${quote(schema)}`);
  for (const table of quantityTables) {
    await connection.query(`CREATE TABLE ${quote(table)} (id INT PRIMARY KEY,
      quantity_g BIGINT UNSIGNED NOT NULL, optional_g BIGINT NULL,
      delta_g BIGINT NOT NULL DEFAULT 0, CHECK(quantity_g>=0), CHECK(optional_g IS NULL OR optional_g<=quantity_g))`);
    await connection.query(`INSERT INTO ${quote(table)} VALUES (1,426470,NULL,-1250),(2,1,1,0)`);
  }
  // Simulate a crash after adding a new column but before copying all data.
  await connection.query('ALTER TABLE stocks ADD COLUMN quantity_kg DECIMAL(20,3) NULL');
  await quantityKg(connection);
  await quantityKg(connection); // Restart must never divide already converted values again.
  for (const table of quantityTables) {
    const [rows] = await connection.query(`SELECT * FROM ${quote(table)} ORDER BY id`);
    assert.equal(Number(rows[0].quantity_kg), 426.47);
    assert.equal(rows[0].optional_kg, null);
    assert.equal(Number(rows[0].delta_kg), -1.25);
    assert.equal(Number(rows[1].quantity_kg), 0.001);
    await assert.rejects(connection.query(`UPDATE ${quote(table)} SET optional_kg=500 WHERE id=1`));
    await connection.query(`INSERT INTO ${quote(table)}(id,quantity_kg) VALUES (3,0.123)`);
    const [[added]] = await connection.query(`SELECT delta_kg FROM ${quote(table)} WHERE id=3`);
    assert.equal(Number(added.delta_kg), 0);
  }
  console.log('Kg migration: values, NULLs, signed deltas, constraints, defaults and restart safety verified for all quantity tables.');
} finally {
  if (created) await connection.query(`DROP DATABASE ${quote(schema)}`);
  connection.release();
  await pool.end();
}
