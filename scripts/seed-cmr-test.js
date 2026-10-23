import { pool } from "../src/config/database.js";
import { one, rows, insert } from "../src/repositories/database.js";
import { transaction } from "../src/utils/transaction.js";
import { stock } from "../src/services/stock.service.js";
import { lockFacilities } from "../src/repositories/facilities.repository.js";
import { hash } from "../src/utils/core.js";
import { updateDeviceMappingState } from '../src/repositories/masters.repository.js';
try {
  const result = await transaction(async c => {
    const miller = await one(c, "SELECT * FROM facilities WHERE kind='MILLER' AND code='m001' AND active=1");
    await lockFacilities(c, [miller.id]);
    const season = await one(c, 'SELECT id,code,name FROM seasons WHERE active=1 ORDER BY id DESC LIMIT 1');
    const depot = await one(c, "SELECT id,code,name,kind,core_store_id FROM facilities WHERE kind='SFC_GODOWN' AND active=1 AND district_id=? AND core_store_id IS NOT NULL ORDER BY id LIMIT 1", [miller.district_id]);
    await rows(c, 'INSERT INTO miller_store_assignments(season_id,miller_id,store_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE active=1', [season.id, miller.id, depot.id]);
    const orderRef = `SAMPLE-CMR:${miller.id}:${season.id}:SCMR`;
    let order = await one(c, 'SELECT id FROM cmr_orders WHERE external_ref=?', [orderRef], false);
    if (!order) order = {
      id: await insert(c, 'cmr_orders', {
    scheme_code: 'SCMR',
    commodity: 'RICE',
        external_ref: orderRef,
        payload_hash: hash(orderRef),
        season_id: season.id,
        miller_id: miller.id,
        destination_id: depot.id,
        order_no: 'SAMPLE-CMR-M001',
        ordered_at: new Date(),
        due_date: '2026-12-31',
        rice_quantity_g: 5000000
      })
    };
    const reference = `SAMPLE-RICE:${miller.id}:${season.id}:SCMR`;
    const existing = await one(c, 'SELECT id FROM test_stock_entries WHERE reference=?', [reference], false);
    if (!existing) {
      const entry = await insert(c, 'test_stock_entries', {
        scheme_code: 'SCMR',
        reference,
        facility_id: miller.id,
        season_id: season.id,
        quantity_g: 10000000
      });
      await stock(c, miller.id, season.id, 'RICE', 10000000, 0, 'TEST_RICE', entry, 'SCMR');
    }
    let type = await one(c, "SELECT id FROM vehicle_types WHERE code='SAMPLE-TRUCK'", [], false);
    if (!type) type = {
      id: await insert(c, 'vehicle_types', {
        code: 'SAMPLE-TRUCK',
        name: 'Sample testing truck'
      })
    };
    let vehicle = await one(c, "SELECT id,miller_id,transporter_id FROM vehicles WHERE registration_no='JH01CMR0001'", [], false);
    if (vehicle && vehicle.miller_id !== miller.id) throw Error('Sample registration belongs to another miller');
    if (!vehicle) vehicle = {
      id: await insert(c, 'vehicles', {
        miller_id: miller.id,
        transporter_id: null,
        vehicle_type_id: type.id,
        registration_no: 'JH01CMR0001',
        capacity_g: 10000000
      })
    };
    const device = await one(c, 'SELECT id FROM gps_devices WHERE vehicle_id=?', [vehicle.id], false);
    if (!device) {
      let imei = await one(c, 'SELECT id FROM imeis WHERE imei=?', ['990000000000001'], false);
      if (!imei) imei = { id: await insert(c, 'imeis', { imei: '990000000000001', provider: 'SAMPLE TEST ONLY - not live hardware', district_id: miller.district_id, block_id: miller.block_id }) };
      await insert(c, 'gps_devices', {
        vehicle_id: vehicle.id,
        imei_id: imei.id,
        district_id: miller.district_id,
        block_id: miller.block_id
      });
      await updateDeviceMappingState(c, imei.id, true, { vehicle_id: vehicle.id, district_id: miller.district_id, block_id: miller.block_id });
    }
    return {
      sample: true,
      miller_id: miller.id,
      season_id: season.id,
      season_name: season.name,
      destination: depot.name,
      destination_id: depot.id,
      store_location_id: depot.core_store_id,
      scheme_type: 'SCMR',
      order_id: order.id,
      order_no: 'SAMPLE-CMR-M001',
      order_quantity_qtl: 50,
      test_rice_added_qtl: existing ? 0 : 100,
      vehicle: 'JH01CMR0001'
    };
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await pool.end();
}
