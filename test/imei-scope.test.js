import test from 'node:test';
import assert from 'node:assert/strict';
import { visibility, createMaster, updateMasterProfile, setMasterStatus } from '../src/services/masters.service.js';
const user = { role: 'CORE_DM', district_ids: [364], core_user_id: 25, core_user_type: 3 };
const context = { user, params: { id: 12 } };
test('DM IMEI visibility is limited to assigned districts and fails closed', () => {
  assert.deepEqual(visibility('imeis', user), { sql: ' AND x.district_id IN (?)', args: [364] });
  assert.throws(() => visibility('imeis', { ...user, district_ids: [] }), error => error.status === 403);
  assert.throws(() => visibility('imeis', { role: 'MILLER' }), error => error.status === 403);
});
test('DM cannot add or move an IMEI outside assigned districts', async () => {
  const db = { async execute(sql, args) {
    assert.match(sql, /district_id IN \(\?\)/);
    assert.deepEqual(args, [12, 364]);
    return [[{ id: 12, district_id: 364, block_id: 1 }]];
  } };
  await assert.rejects(createMaster(db, 'imeis', { district_id: 365 }, user), error => error.code === 'DISTRICT_FORBIDDEN');
  await assert.rejects(updateMasterProfile(db, { district_id: 365 }, context, null, 'imeis'), error => error.code === 'DISTRICT_FORBIDDEN');
});
test('DM cannot deactivate another district IMEI or an IMEI in use', async () => {
  const db = { async execute(sql, args) {
    if (sql.includes('FROM imeis')) {
      assert.match(sql, /district_id IN \(\?\)/);
      assert.deepEqual(args, [12, 364]);
      return [[{ id: 12, district_id: 364 }]];
    }
    if (sql.includes('FROM gps_devices')) return [[{ id: 99 }]];
    throw Error('Unexpected write');
  } };
  await assert.rejects(setMasterStatus(db, { active: false }, context, 'imeis'), error => error.code === 'IMEI_IN_USE');
  await assert.rejects(setMasterStatus({ execute: async () => [[]] }, { active: false }, context, 'imeis'), error => error.status === 404);
});
