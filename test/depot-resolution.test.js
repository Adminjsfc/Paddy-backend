import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDMDepot } from '../src/services/dm-setup.service.js';
const context = { user: { district_ids: [364], core_user_id: 25, core_user_type: 3 } };
const store = { id: 38, district_id: 364, store_type: 2, store_name: 'Test depot', lat: 23, lng: 85, capacity: 10, radius: 0.2, status: 1 };
function database({ selected = store, existing = null } = {}) {
  const writes = [];
  return { writes, async execute(sql, args) {
    if (sql.includes('FROM tbl_store_location_master')) return [[selected]];
    if (sql.includes('FROM facilities')) return [existing ? [existing] : []];
    if (sql.includes('FROM tbl_district_master')) return [[{ id: 364, district_name: 'Test district' }]];
    if (sql.includes('FROM tbl_block_master')) return [[]];
    if (sql.startsWith('INSERT INTO facilities')) { writes.push(args); return [{ insertId: 900 }]; }
    throw Error('Unexpected SQL: ' + sql);
  } };
}
test('Store IDs resolve to linked facility IDs, without creating duplicates', async () => {
  const db = database({ existing: { id: 900, district_id: 364, kind: 'SFC_GODOWN', active: 1 } });
  assert.equal((await resolveDMDepot(db, { store_location_id: 38 }, context, 'store_id')).id, 900);
  assert.equal(db.writes.length, 0);
});
test('Valid selected store creates only its own linked facility', async () => {
  const db = database();
  const result = await resolveDMDepot(db, { store_location_id: 38 }, context, 'store_id');
  assert.equal(result.id, 900);
  assert.equal(result.core_store_id, 38);
  assert.equal(result.radius_m, 200);
  assert.equal(result.capacity_g, 10000000);
  assert.equal(db.writes.length, 1);
});
test('Foreign districts, invalid store details and mixed ID domains are rejected without writes', async () => {
  for (const [selected, code] of [[{ ...store, district_id: 365 }, 'DISTRICT_FORBIDDEN'], [{ ...store, lat: null }, 'INVALID_STORE_DETAILS']]) {
    const db = database({ selected });
    await assert.rejects(resolveDMDepot(db, { store_location_id: 38 }, context, 'store_id'), error => error.code === code);
    assert.equal(db.writes.length, 0);
  }
  await assert.rejects(resolveDMDepot(database(), { store_location_id: 38, store_id: 38 }, context, 'store_id'), error => error.code === 'VALIDATION');
});
