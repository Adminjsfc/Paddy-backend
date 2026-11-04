// Exercise the current schema and APIs in a disposable database, never the source.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pool} from '../src/config/database.js';
import {quantityKg} from './quantity-kg-migration.js';
import {moduleCatalog} from '../src/config/modules.js';
const schema = `paddy_kg_${crypto.randomBytes(8).toString('hex')}_test`;
const quote = name => '`' + String(name).replaceAll('`', '``') + '`';
const c = await pool.getConnection();
let created = false;
try {
  assert.match(schema, /^paddy_kg_[0-9a-f]{16}_test$/);
  const [tables] = await c.query("SHOW FULL TABLES WHERE Table_type='BASE TABLE'");
  const definitions = [];
  for (const row of tables) {
    const [[ddl]] = await c.query('SHOW CREATE TABLE ' + quote(Object.values(row)[0]));
    definitions.push(Object.values(ddl)[1]);
  }
  await c.query('CREATE DATABASE ' + quote(schema)); created = true;
  await c.query('USE ' + quote(schema));
  await c.query('SET FOREIGN_KEY_CHECKS=0');
  for (const ddl of definitions) await c.query(ddl);
  await c.query('SET FOREIGN_KEY_CHECKS=1');
  await quantityKg(c);
  for (const module of moduleCatalog) await c.execute(
    'INSERT INTO module_permissions(role,module_key,can_view,can_add,can_edit) VALUES (?,?,?,?,?)',
    ['MILLER', module.key, 1, 1, 1]);
  const result = spawnSync(process.execPath,
    ['--test', '--test-reporter=tap', '--test-concurrency=1', 'test/integration.test.js'],
    {env: {...process.env, DB_NAME: schema}, stdio: 'inherit'});
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (created) await c.query('DROP DATABASE ' + quote(schema));
  c.release(); await pool.end();
}
