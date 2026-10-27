import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createVerifyCoreDM } from "../src/middlewares/verifyCoreDM.js";
import { requireDMDistrict } from "../src/services/millers.service.js";
import { scopedDMFacility } from "../src/services/dm-setup.service.js";
import { paddyFacilitySchema } from "../src/validators/dm-setup.schema.js";
test('Paddy setup restricts facility kinds and district access', async () => {
  const facility = {
    kind: 'PACS',
    name: 'Test PACS',
    email: 'pacs@test.invalid',
    address: 'Test address',
    district_id: 364,
    block_id: 1,
    latitude: 23,
    longitude: 85,
    capacity: {
      value: '10',
      unit: 'MT'
    }
  };
  assert(paddyFacilitySchema.safeParse(facility).success);
  assert(!paddyFacilitySchema.safeParse({...facility,email:undefined}).success);
  assert(!paddyFacilitySchema.safeParse({...facility,email:'invalid'}).success);
  assert(paddyFacilitySchema.safeParse({
    ...facility,
    kind: 'LAMPS'
  }).success);
  assert(!paddyFacilitySchema.safeParse({
    ...facility,
    kind: 'MILLER'
  }).success);
  assert(!paddyFacilitySchema.safeParse({
    ...facility,
    code: 'CLIENT-CODE'
  }).success);
  assert(!paddyFacilitySchema.safeParse({
    ...facility,
    recovery_percent: 68
  }).success);
  const db = {
    execute: async () => [[{
      id: 1,
      district_id: 364,
      kind: 'PACS',
      active: 1
    }]]
  };
  assert.equal((await scopedDMFacility(db, {
    district_ids: [364]
  }, 1, 'PADDY')).kind, 'PACS');
  await assert.rejects(scopedDMFacility(db, {
    district_ids: [355]
  }, 1, 'PADDY'), error => error.status === 403);
  await assert.rejects(scopedDMFacility(db, {
    district_ids: [364]
  }, 1, 'MILLER'), error => error.status === 400);
});
test('DM setup rejects another district or wrong facility kind', async () => {
  const db = {
    execute: async () => [[{
      id: 1,
      district_id: 364,
      kind: 'MILLER',
      active: 1
    }]]
  };
  assert.equal((await scopedDMFacility(db, {
    district_ids: [364]
  }, 1, 'MILLER')).id, 1);
  await assert.rejects(scopedDMFacility(db, {
    district_ids: [355]
  }, 1, 'MILLER'), error => error.status === 403);
  await assert.rejects(scopedDMFacility(db, {
    district_ids: [364]
  }, 1, 'STORE'), error => error.status === 400);
});
test('Core DM identity is checked against active database records and district scope', async () => {
  const previous = {
    enabled: process.env.CORE_DM_ENABLED,
    secret: process.env.CORE_JWT_ACCESS_SECRET
  };
  process.env.CORE_DM_ENABLED = 'true';
  process.env.CORE_JWT_ACCESS_SECRET = 'isolated-test-signing-secret-123456';
  let user = {
    id: 25,
    user_type: 3,
    status: 1,
    full_name: 'District Manager'
  };
  let assignments = [{
    district_id: 7
  }, {
    district_id: 7
  }, {
    district_id: 9
  }];
  let queries = 0;
  const middleware = createVerifyCoreDM({
    database: () => ({
      async execute(sql, args) {
        queries++;
        assert.equal(args[0], 25);
        return [sql.includes('tbl_user_master') ? [user] : assignments];
      }
    })
  });
  const verify = async token => {
    const req = {
      get: name => name === 'Authorization' ? 'Bearer ' + token : undefined
    };
    let advanced = false;
    await middleware(req, {}, () => {
      advanced = true;
    });
    assert(advanced);
    return req.user;
  };
  const sign = (payload = {
    id: 25
  }, options = {
    expiresIn: 60
  }) => jwt.sign(payload, process.env.CORE_JWT_ACCESS_SECRET, options);
  try {
    const actor = await verify(sign({
      id: 25,
      user_type: 1,
      district_ids: [100]
    }));
    assert.deepEqual(actor.district_ids, [7, 9]);
    assert.equal(actor.actor, 'core-dm:25');
    assert.equal(actor.id, undefined);
    assert.equal(actor.core_user_type, 3);
    requireDMDistrict(actor, 7);
    assert.throws(() => requireDMDistrict(actor, 100), error => error.status === 403);
    user = {
      ...user,
      user_type: 5
    };
    await assert.rejects(verify(sign()), error => error.status === 403);
    user = {
      ...user,
      user_type: 3,
      status: 0
    };
    await assert.rejects(verify(sign()), error => error.status === 401);
    user = {
      ...user,
      status: 1
    };
    assignments = [];
    await assert.rejects(verify(sign()), error => error.status === 403);
    const before = queries;
    await assert.rejects(verify(sign({
      id: 25
    }, {
      expiresIn: -1
    })), error => error.status === 401);
    await assert.rejects(verify(jwt.sign({
      id: 25
    }, 'different-secret', {
      expiresIn: 60
    })), error => error.status === 401);
    await assert.rejects(verify(sign({
      id: 25
    }, {})), error => error.status === 401);
    assert.equal(queries, before);
  } finally {
    for (const [key, value] of [['CORE_DM_ENABLED', previous.enabled], ['CORE_JWT_ACCESS_SECRET', previous.secret]]) {
      if (value === undefined) delete process.env[key];else process.env[key] = value;
    }
  }
});

test('DM maps a selected active vehicle and IMEI without inserting another vehicle', async () => {
  const { registerMillerVehicle } = await import('../src/services/dm-setup.service.js');
  const writes = [];
  const db = { async execute(sql, args) {
    if (sql.includes(' FROM facilities ')) return [[{ id: 7, kind: 'MILLER', district_id: 364, block_id: 1 }]];
    if (sql.includes('SELECT id FROM vehicles WHERE')) {
      assert.deepEqual(args, [9, 7]);
      return [[{ id: 9 }]];
    }
    if (sql.includes('FROM vehicles v ')) return [[{ id: 9, miller_id: 7 }]];
    if (sql.startsWith('SELECT id FROM')) return [[{ id: 1 }]];
    writes.push(sql);
    if (sql.startsWith('INSERT INTO gps_devices')) return [{ insertId: 11 }];
    if (sql.startsWith('UPDATE')) return [{ affectedRows: 1 }];
    throw Error('Unexpected SQL: ' + sql);
  } };
  const result = await registerMillerVehicle(db, { miller_id: 7, vehicle_id: 9, imei_id: 1 }, { user: { role: 'CORE_DM', district_ids: [364] } });
  assert.deepEqual(result, { id: 9, device_id: 11 });
  assert(!writes.some(sql => sql.startsWith('INSERT INTO vehicles')));
});

test('DM rejects a vehicle that does not belong to the selected Miller', async () => {
  const { registerMillerVehicle } = await import('../src/services/dm-setup.service.js');
  const db = { async execute(sql) {
    if (sql.includes('FROM facilities')) return [[{ id: 7, kind: 'MILLER', district_id: 364 }]];
    if (sql.startsWith('SELECT')) return [[]];
    throw Error('Unexpected write');
  } };
  await assert.rejects(registerMillerVehicle(db, { miller_id: 7, vehicle_id: 9, imei_id: 1 }, { user: { district_ids: [364] } }), error => error.code === 'INVALID_VEHICLE');
});
