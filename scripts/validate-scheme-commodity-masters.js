// Validate master CRUD and CMR active-master checks, then roll back fixtures.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { pool } from '../src/config/database.js';
import { one } from '../src/repositories/database.js';
import { createMaster, updateMasterProfile, setFacilityOrSeasonStatus } from '../src/services/masters.service.js';
import { requireActiveCmrMasters } from '../src/repositories/cmr-submissions.repository.js';
import { configs, profilePatches } from '../src/config/masters.js';

const c = await pool.getConnection();
try {
  await c.beginTransaction();
  const suffix = crypto.randomBytes(5).toString('hex');
  const user = { role: 'ADMIN' };
  for (const [type, field] of [['schemes', 'scheme_name'], ['commodities', 'commodity_name']]) {
    const input = configs[type].schema.parse({ code: 'VALIDATE-' + suffix, [field]: 'Test name' });
    const created = await createMaster(c, type, input, user);
    await assert.rejects(createMaster(c, type, input, user), { code: 'ER_DUP_ENTRY' });
    const context = { user, params: { id: created.id } };
    await updateMasterProfile(c, profilePatches[type].parse({ [field]: 'Updated name', description: 'Updated description' }), context, profilePatches[type], type);
    const updated = await one(c, `SELECT * FROM ${type} WHERE id=?`, [created.id]);
    assert.equal(updated[field], 'Updated name');
    assert.equal(updated.description, 'Updated description');
    assert.equal(updated.code, input.code);
    await setFacilityOrSeasonStatus(c, { active: false }, context, type);
    assert.equal((await one(c, `SELECT active FROM ${type} WHERE id=?`, [created.id])).active, 0);
  }
  await requireActiveCmrMasters(c, { scheme_type: 'SCMR', commodity_type: 'RICE' });
  const scheme = await one(c, "SELECT id FROM schemes WHERE code='SCMR'");
  await setFacilityOrSeasonStatus(c, { active: false }, { user, params: { id: scheme.id } }, 'schemes');
  await assert.rejects(requireActiveCmrMasters(c, { scheme_type: 'SCMR', commodity_type: 'RICE' }), { status: 404 });
  console.log('Scheme/commodity creation, duplicate prevention, name updates, deletion and CMR active-master checks passed. Fixtures rolled back.');
} finally {
  await c.rollback();
  c.release();
  await pool.end();
}
