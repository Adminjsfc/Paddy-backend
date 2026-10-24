import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaster, visibility, updateMasterProfile, setMasterStatus } from '../src/services/masters.service.js';
const user = { role: 'CORE_DM', district_ids: [364], core_user_id: 25 };
const context = { user, params: { id: 9 } };
test('DM vehicle list and record changes are scoped by Miller district', () => {
  const scope = visibility('vehicles', user);
  assert.match(scope.sql, /x.miller_id IN .*district_id IN/s);
  assert.deepEqual(scope.args, [364]);
  assert.throws(() => visibility('vehicles', { ...user, district_ids: [] }), error => error.status === 403);
});
test('DM cannot create a vehicle for a foreign or inactive Miller', async () => {
  const db = { execute: async (sql, args) => {
    assert.match(sql, /kind='MILLER'.*district_id IN/);
    assert.deepEqual(args, [7, 364]);
    return [[]];
  } };
  await assert.rejects(createMaster(db, 'vehicles', { miller_id: 7 }, user), error => error.code === 'DISTRICT_FORBIDDEN');
});
test('DM capacity updates preserve active-load checks and block foreign records', async () => {
  const db = { execute: async (sql, args) => {
    if (sql.includes('FROM vehicles')) { assert.deepEqual(args, [9, 364]); return [[{ id: 9 }]]; }
    if (sql.includes('MAX(quantity_g)')) return [[{ max_load: 30000000 }]];
    throw Error('Unexpected write');
  } };
  await assert.rejects(updateMasterProfile(db, { capacity: { value: 25, unit: 'MT' } }, context, null, 'vehicles'), /Capacity is below active shipment load/);
  await assert.rejects(updateMasterProfile({ execute: async () => [[]] }, { capacity: { value: 25, unit: 'MT' } }, context, null, 'vehicles'), error => error.status === 404);
});
test('DM cannot deactivate vehicles with active shipments', async () => {
  const db = { execute: async (sql) => {
    if (sql.includes('FROM vehicles')) return [[{ id: 9 }]];
    if (sql.includes('COUNT(*) AS n')) return [[{ n: 1 }]];
    throw Error('Unexpected write');
  } };
  await assert.rejects(setMasterStatus(db, { active: false }, context, 'vehicles'), /Finish or cancel active shipments/);
});
