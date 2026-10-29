import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { receivingSchema } from "../src/validators/cmr-receiving.schema.js";
import { receivingCalculation, receivingScope, receiveCMR } from "../src/services/cmr-receiving.service.js";
import { createVerifyCoreReceiver } from "../src/middlewares/verifyCoreReceiver.js";
const payload = () => ({
  decision: 'ACCEPTED',
  receipt_no: 'TEST-RECEIPT',
  received_at: new Date().toISOString(),
  stacks: [{
    stack_no: 'A1',
    received_quantity_qtl: '289.43740',
    bags: 580
  }],
  gross_weight_kg: '29280.140',
  empty_bag_weight_kg: '0.580',
  red_grains_percent: 0,
  chalky_grains_percent: 1,
  moisture_percent: 12,
  broken_rice_percent: 5,
  other_standards: 'Officer verified applicable specifications',
  compliance_confirmed: true,
  remarks: ''
});
test('Receiving calculation preserves the supplied five-decimal quintal example exactly', () => {
  const data = receivingSchema.parse(payload()),
    calc = receivingCalculation(data);
  assert.equal(calc.tare_g, 336400);
  assert.equal(calc.gross_g, 29280140);
  assert.equal(calc.net_g, 28943740);
  assert.equal(calc.total_bags, 580);
  assert.equal(calc.stacks[0].quantity_g, calc.net_g);
  assert.throws(() => receivingCalculation({
    ...data,
    gross_weight_kg: '29280.139'
  }), error => error.code === 'WEIGHT_MISMATCH');
  assert.throws(() => receivingCalculation({
    ...data,
    compliance_confirmed: false
  }), error => error.code === 'QUALITY_CONFIRMATION_REQUIRED');
  assert.throws(() => receivingCalculation({
    ...data,
    decision: 'REJECTED'
  }), error => error.status === 400);
  assert.equal(receivingCalculation({
    ...data,
    decision: 'REJECTED',
    compliance_confirmed: false,
    remarks: 'Quality standards failed'
  }).net_g, 28943740);
  assert.throws(() => receivingCalculation({
    ...data,
    stacks: [...data.stacks, {
      ...data.stacks[0],
      stack_no: 'a1'
    }]
  }), error => error.status === 400);
  assert(!receivingSchema.safeParse({
    ...payload(),
    moisture_percent: 101
  }).success);
  assert(!receivingSchema.safeParse({
    ...payload(),
    stacks: [{
      stack_no: 'A1',
      received_quantity_qtl: '1.000001',
      bags: 1
    }]
  }).success);
});
test('Receiving scopes exact store/district pairs and blocks repeated or unshipped reviews', async () => {
  const user = {
    stores: [{
      store_id: 210,
      district_id: 364
    }, {
      store_id: 211,
      district_id: 355
    }]
  };
  assert.deepEqual(receivingScope(user).args, [210, 364, 211, 355]);
  assert.throws(() => receivingScope({
    stores: []
  }), error => error.status === 403);
  const req = {
    params: {
      id: '1'
    },
    user
  };
  const db = {
    execute: async sql => [sql.includes('FROM shipment_details s') ? [{
      id: 1,
      status: 'PLANNED'
    }] : []]
  };
  await assert.rejects(receiveCMR(db, receivingSchema.parse(payload()), req), error => error.code === 'INVALID_STATUS');
  const reviewed = {
    execute: async sql => [sql.includes('FROM shipment_details s') ? [{
      id: 1,
      status: 'ARRIVED'
    }] : [{
      id: 22
    }]]
  };
  await assert.rejects(receiveCMR(reviewed, receivingSchema.parse(payload()), req), error => error.code === 'ALREADY_REVIEWED');
});
test('Core receiver trusts active database roles and store assignments rather than JWT claims', async () => {
  const enabled = process.env.CORE_DM_ENABLED,
    secret = process.env.CORE_JWT_ACCESS_SECRET;
  process.env.CORE_DM_ENABLED = 'true';
  process.env.CORE_JWT_ACCESS_SECRET = 'isolated-receiver-test-secret';
  let type = 4,
    status = 1,
    assignments = [{
      store_id: 210,
      district_id: 364
    }];
  const middleware = createVerifyCoreReceiver({
    database: () => ({
      execute: async sql => [sql.includes('tbl_user_master') ? [{
        id: 7,
        user_type: type,
        status,
        full_name: 'Officer'
      }] : assignments]
    })
  });
  const verify = async () => {
    const req = {
      get: () => `Bearer ${jwt.sign({
        id: 7,
        user_type: 3,
        stores: [999]
      }, process.env.CORE_JWT_ACCESS_SECRET, {
        expiresIn: 60
      })}`
    };
    let advanced = false;
    await middleware(req, {}, () => {
      advanced = true;
    });
    assert(advanced);
    return req.user;
  };
  try {
    assert.deepEqual((await verify()).stores, [{
      store_id: 210,
      district_id: 364
    }]);
    type = 8;
    assert.equal((await verify()).core_user_type, 8);
    type = 3;
    await assert.rejects(verify(), error => error.status === 403);
    type = 4;
    status = 0;
    await assert.rejects(verify(), error => error.status === 401);
    status = 1;
    assignments = [];
    await assert.rejects(verify(), error => error.code === 'STORE_SCOPE_REQUIRED');
  } finally {
    for (const [key, value] of [['CORE_DM_ENABLED', enabled], ['CORE_JWT_ACCESS_SECRET', secret]]) if (value === undefined) delete process.env[key];else process.env[key] = value;
  }
});
