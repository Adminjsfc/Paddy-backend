// Creates temporary fixtures in a transaction and always rolls them back.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { pool } from "../src/config/database.js";
import { one, rows, insert } from "../src/repositories/database.js";
import { stock } from "../src/services/stock.service.js";
import { createMaster } from "../src/services/masters.service.js";
import { createShipment } from "../src/services/shipments.service.js";
import { receiveCMR } from "../src/services/cmr-receiving.service.js";
import { receivingSchema } from "../src/validators/cmr-receiving.schema.js";
import * as S from "../src/validators/schemas.js";
const c = await pool.getConnection(),
  suffix = crypto.randomBytes(5).toString('hex').toUpperCase();
try {
  await c.beginTransaction();
  const base = await one(c, "SELECT * FROM facilities WHERE kind='MILLER' AND active=1 AND block_id IS NOT NULL LIMIT 1");
  const dest = await one(c, "SELECT * FROM facilities WHERE core_store_id IS NOT NULL AND kind IN ('FCI','SFC_GODOWN') AND active=1 AND capacity_g>1000000 ORDER BY capacity_g DESC LIMIT 1");
  const season = await one(c, 'SELECT id FROM seasons WHERE active=1 LIMIT 1');
  const type = await one(c, 'SELECT id FROM vehicle_types WHERE active=1 LIMIT 1');
  const actor = {
    role: 'ADMIN',
    actor: 'receiving-validation'
  };
  const miller = await createMaster(c, 'facilities', S.facility.parse({
    code: 'VALIDATE-' + suffix,
    kind: 'MILLER',
    name: 'Temporary receiving validation',
    address: 'Rollback fixture',
    district_id: base.district_id,
    block_id: base.block_id,
    latitude: 23,
    longitude: 85,
    capacity: {
      value: '10',
      unit: 'MT'
    }
  }), actor);
  const vehicle = await createMaster(c, 'vehicles', S.vehicle.parse({
    miller_id: miller.id,
    registration_no: 'TST' + suffix,
    vehicle_type_id: type.id,
    capacity: {
      value: '1',
      unit: 'MT'
    }
  }), actor);
  const imei = await createMaster(c, 'imeis', S.imeiMaster.parse({
    imei: '99' + String(BigInt('0x' + suffix)).padStart(13, '0'),
    provider: 'ROLLBACK VALIDATION',
    district_id: base.district_id,
    block_id: base.block_id
  }), actor);
  await createMaster(c, 'gps-devices', S.device.parse({
    vehicle_id: vehicle.id,
    imei_id: imei.id,
    district_id: base.district_id,
    block_id: base.block_id
  }), actor);
  await stock(c, miller.id, season.id, 'RICE', 500000, 0, 'VALIDATION', miller.id, 'SCMR');
  await insert(c, 'miller_store_assignments', {
    season_id: season.id,
    miller_id: miller.id,
    store_id: dest.id
  });
  const orderId = await insert(c, 'cmr_orders', {
    scheme_code: 'SCMR',
    commodity: 'RICE',
    external_ref: 'VALIDATE-' + suffix,
    payload_hash: '0'.repeat(64),
    season_id: season.id,
    miller_id: miller.id,
    destination_id: dest.id,
    order_no: 'VALIDATE-' + suffix,
    ordered_at: new Date(Date.now() - 60000),
    due_date: '2026-12-31',
    rice_quantity_g: 500000
  });
  const initial = await one(c, "SELECT on_hand_g FROM stocks WHERE facility_id=? AND season_id=? AND commodity_id=(SELECT id FROM commodities WHERE code='RICE') AND scheme_id=(SELECT id FROM schemes WHERE code='SCMR')", [dest.id, season.id], false);
  const receiver = {
    role: 'CORE_RECEIVER',
    actor: 'receiving-validation',
    core_user_id: 1,
    core_user_type: 4,
    stores: [{
      store_id: dest.core_store_id,
      district_id: dest.district_id
    }]
  };
  const make = async tag => {
    const s = await createShipment(c, S.shipment.parse({
      shipment_no: 'VALIDATE-' + suffix + tag,
      leg: 'CMR',
      scheme_code: 'SCMR',
      season_id: season.id,
      miller_id: miller.id,
      source_id: miller.id,
      destination_id: dest.id,
      vehicle_id: vehicle.id,
      order_id: orderId,
      quantity: {
        value: '1',
        unit: 'QTL'
      }
    }), {
      user: actor
    });
    await stock(c, miller.id, season.id, 'RICE', -100000, -100000, 'DISPATCH', s.id, 'SCMR');
    await rows(c, "UPDATE shipments SET status='ARRIVED',dispatched_at=?,arrived_at=? WHERE id=?", [new Date(Date.now() - 30000), new Date(Date.now() - 10000), s.id]);
    return s.id;
  };
  const body = decision => receivingSchema.parse({
    decision,
    receipt_no: 'VALIDATE-' + suffix + decision,
    received_at: new Date().toISOString(),
    stacks: [{
      stack_no: 'A',
      received_quantity_qtl: '1.00000',
      bags: 2
    }],
    gross_weight_kg: '101.160',
    empty_bag_weight_kg: '0.580',
    red_grains_percent: 0,
    chalky_grains_percent: 0,
    moisture_percent: 12,
    broken_rice_percent: 1,
    other_standards: 'Validation only',
    compliance_confirmed: decision === 'ACCEPTED',
    remarks: decision === 'REJECTED' ? 'Validation rejection reason' : ''
  });
  const acceptedId = await make('A');
  const accepted = await receiveCMR(c, body('ACCEPTED'), {
    user: receiver,
    params: {
      id: acceptedId
    }
  });
  assert.equal(accepted.net_g, 100000);
  assert.equal((await one(c, 'SELECT status FROM shipments WHERE id=?', [acceptedId])).status, 'DELIVERED');
  assert.equal((await one(c, "SELECT on_hand_g FROM stocks WHERE facility_id=? AND season_id=? AND commodity_id=(SELECT id FROM commodities WHERE code='RICE')", [dest.id, season.id])).on_hand_g, Number(initial?.on_hand_g || 0) + 100000);
  await assert.rejects(receiveCMR(c, body('ACCEPTED'), {
    user: receiver,
    params: {
      id: acceptedId
    }
  }));
  const rejectedId = await make('R');
  await receiveCMR(c, body('REJECTED'), {
    user: receiver,
    params: {
      id: rejectedId
    }
  });
  assert.equal((await one(c, 'SELECT status FROM shipments WHERE id=?', [rejectedId])).status, 'ARRIVED');
  assert.equal((await one(c, "SELECT on_hand_g FROM stocks WHERE facility_id=? AND season_id=? AND commodity_id=(SELECT id FROM commodities WHERE code='RICE')", [dest.id, season.id])).on_hand_g, Number(initial?.on_hand_g || 0) + 100000);
  const order = await one(c, 'SELECT delivered_g,committed_g FROM cmr_orders WHERE id=?', [orderId]);
  assert.equal(order.delivered_g, 100000);
  assert.equal(order.committed_g, 100000);
  await assert.rejects(receiveCMR(c, body('REJECTED'), {
    user: {
      ...receiver,
      stores: [{
        store_id: dest.core_store_id + 100000,
        district_id: dest.district_id
      }]
    },
    params: {
      id: rejectedId
    }
  }), error => error.status === 404);
  console.log('PASS: acceptance, stock/order reconciliation, rejection, duplicate review and foreign-store denial; all fixtures rolled back.');
} finally {
  await c.rollback();
  c.release();
  await pool.end();
}
