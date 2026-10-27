// Uses an existing dedicated MySQL database ending in _test. Creates only uniquely
// named test records. Never drops/truncates a database or uses production credentials.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApp } from "../src/app.js";
import { pool } from "../src/config/database.js";
import { insert, one, rows } from "../src/repositories/database.js";
import { passwordHash } from "../src/utils/core.js";
import {stock} from '../src/services/stock.service.js';
import {lockFacilities} from '../src/repositories/facilities.repository.js';
import {transaction} from '../src/utils/transaction.js';
import * as receiving from '../src/services/cmr-receiving.service.js';
import {receivingSchema} from '../src/validators/cmr-receiving.schema.js';
if (!process.env.DB_NAME?.endsWith('_test')) throw new Error('Use a migrated DB_NAME ending in _test');
const suffix = crypto.randomBytes(4).toString('hex'),
  ids = {};
let server, url, admin, millerToken, otherToken, transporterToken;
const pass = 'Only-for-integration-tests-2026';
const key = () => crypto.randomUUID();
const at = minutes => new Date(Date.now() + minutes * 60000).toISOString();
const qty = (value, unit = 'KG') => ({
  value,
  unit
});
const code = name => `${name}-${suffix}`;
async function request(method, path, body, {
  auth = admin,
  apiKey,
  idem = key(),
  status
} = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Idempotency-Key': idem
  };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  if (apiKey) headers['X-API-Key'] = apiKey;
  const r = await fetch(url + '/api/v1' + path, {
    method,
    headers,
    ...(body !== undefined ? {
      body: JSON.stringify(body)
    } : {})
  });
  const data = await r.json();
  if (status !== undefined) assert.equal(r.status, status, JSON.stringify(data));else assert(r.status < 300, JSON.stringify(data));
  return {
    status: r.status,
    ...data
  };
}
async function login(email) {
  return (await request('POST', '/auth/login', {
    email,
    password: pass
  }, {
    auth: null
  })).data.token;
}
before(async () => {
  ids.district = await insert(pool,'tbl_district_master',{id_old:999999,district_name:'Test district'});
  ids.block = await insert(pool,'tbl_block_master',{district_id:ids.district,block_name:'Test block',rgi_block_code:999999});
  process.env.EUPARJAN_API_KEY = crypto.randomBytes(32).toString('hex');
  process.env.GPS_API_KEY = crypto.randomBytes(32).toString('hex');
  await insert(pool, 'users', {
    name: 'Test admin',
    email: code('admin') + '@test.invalid',
    password_hash: await passwordHash(pass),
    role: 'ADMIN'
  });
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  url = `http://127.0.0.1:${server.address().port}`;
  admin = await login(code('admin') + '@test.invalid');
});
after(async () => {
  if (server) await new Promise(r => server.close(r));
  await pool.end();
});
test('Shipment schema keeps master IDs and meaningful CMR metadata',async()=>{
  const fields=new Set((await rows(pool,'SHOW COLUMNS FROM shipment_details')).map(row=>row.Field));
  for(const field of ['scheme_id','commodity_id','vehicle_type_id','submitted_on','cmr_lot_count','trip_status','trip_started_at','trip_completed_at','expected_completion_at'])assert(fields.has(field));
  for(const field of ['scheme_code','scheme_type','commodity_type','submitted_vehicle_type','submitted_count'])assert(!fields.has(field));
});
test('Create masters, users and scoped transport registrations', async () => {
  ids.season = (await request('POST', '/seasons', {
    code: code('KMS'),
    name: 'Test season',
    start_date: '2020-01-01',
    end_date: '2099-12-31',
    recovery_percent: 68
  })).data.id;
  const facility = async (kind, lat, lng, label) => (await request('POST', '/facilities', {
    code: code(label),
    kind,
    name: label,
    address: 'Test location',
    district_id: ids.district,
    block_id: ids.block,
    latitude: lat,
    longitude: lng,
    radius_m: 200,
    capacity: qty(1000, 'MT'),
    ...(kind === 'MILLER' ? {
      milling_capacity_per_day: qty(100, 'MT')
    } : {})
  })).data.id;
  ids.pacs = await facility('PACS', 23.3, 85.3, 'PACS');
  ids.miller = await facility('MILLER', 23.4, 85.4, 'MILLER');
  ids.other = await facility('MILLER', 23.5, 85.5, 'OTHER');
  ids.godown = await facility('SFC_GODOWN', 23.6, 85.6, 'GODOWN');
  ids.fci = await facility('FCI', 23.7, 85.7, 'FCI');
  ids.farmer = (await request('POST', '/farmers', {
    code: code('FARMER'),
    name: 'Test farmer',
    village: 'Test',
    district_id: ids.district,
    block_id: ids.block
  })).data.id;
  for (const [source_id, destination_id] of [[ids.pacs, ids.miller], [ids.miller, ids.godown], [ids.miller, ids.fci]]) await request('POST', '/route-tags', {
    season_id: ids.season,
    source_id,
    destination_id
  });
  for (const store_id of [ids.godown,ids.fci]) await request('POST','/miller-store-assignments',{season_id:ids.season,miller_id:ids.miller,store_id});
  await request('POST', '/route-tags', {
    season_id: ids.season,
    source_id: ids.pacs,
    destination_id: ids.fci
  }, {
    status: 400
  });
  for (const [label, miller_id] of [['miller', ids.miller], ['other', ids.other]]) await request('POST', '/users', {
    name: label,
    email: code(label) + '@test.invalid',
    password: pass,
    role: 'MILLER',
    miller_id
  });
  millerToken = await login(code('miller') + '@test.invalid');
  otherToken = await login(code('other') + '@test.invalid');
  ids.transporter = (await request('POST', '/transporters', {
    miller_id: ids.miller,
    code: code('TRANS'),
    name: 'Test transporter',
    contact_name: 'Test',
    phone: '9999999999',
    district_id: ids.district,
    block_id: ids.block,
    address: 'Test'
  }, {
    auth: millerToken
  })).data.id;
  await request('POST', '/transporters', {
    miller_id: ids.other,
    code: code('BAD'),
    name: 'Bad',
    contact_name: 'Test',
    phone: '9999999999',
    district_id: ids.district,
    block_id: ids.block,
    address: 'Test'
  }, {
    auth: millerToken,
    status: 403
  });
  await request('POST', '/users', {
    name: 'Transport user',
    email: code('transport') + '@test.invalid',
    password: pass,
    role: 'TRANSPORTER',
    miller_id: ids.miller,
    transporter_id: ids.transporter
  });
  transporterToken = await login(code('transport') + '@test.invalid');
  ids.vehicleType = (await request('POST','/vehicle-types',{code:code('TRUCK'),name:'Test truck'})).data.id;
  for (const i of [1, 2]) {
    ids['vehicle' + i] = (await request('POST', '/vehicles', {
      transporter_id: ids.transporter,
      registration_no: `JH${suffix.toUpperCase()}${i}`,
      capacity: qty(20, 'MT'),
      vehicle_type_id: ids.vehicleType
    }, {
      auth: transporterToken
    })).data.id;
    ids['imei' + i] = `${String(Date.now()).slice(-11)}${i}${Math.floor(Math.random() * 900 + 100)}`;
    ids['imeiMaster' + i] = (await request('POST', '/imeis', {
      imei: ids['imei' + i], provider: 'Test GPS', district_id: ids.district, block_id: ids.block
    })).data.id;
    await request('POST', '/gps-devices', {
      vehicle_id: ids['vehicle' + i],
      imei_id: ids['imeiMaster' + i],
      district_id: ids.district,
      block_id: ids.block
    }, {
      auth: transporterToken
    });
  }
});
function procure(ref, value = 10000) {
  return {
    scheme_code: 'SCMR',
    commodity_code: 'PADDY',
    external_ref: code(ref),
    season_code: code('KMS'),
    farmer_code: code('FARMER'),
    facility_code: code('PACS'),
    procured_at: at(-60),
    quantity: qty(value),
    receipt_no: code('PROC-RECEIPT')
  };
}
function paddy(no, vehicle = ids.vehicle1, value = 10000) {
  return {
    shipment_no: code(no),
    leg: 'PADDY',
    scheme_code: 'SCMR',
    season_id: ids.season,
    miller_id: ids.miller,
    source_id: ids.pacs,
    destination_id: ids.miller,
    vehicle_id: vehicle,
    driver_name: 'Paddy Test Driver',
    driver_phone: '9999999999',
    expected_completion_at: at(60),
    quantity: qty(value)
  };
}
test('Push procurement once under concurrent retries; reject changed payloads', async () => {
  const body = {
      records: [procure('PROC')]
    },
    idem = key();
  ids.procBody = body;
  const responses = await Promise.all([request('POST', '/integrations/euparjan/procurements', body, {
    apiKey: process.env.EUPARJAN_API_KEY,
    idem
  }), request('POST', '/integrations/euparjan/procurements', body, {
    apiKey: process.env.EUPARJAN_API_KEY,
    idem
  })]);
  assert.equal(responses.filter(r => r.replayed).length, 1);
  ids.procurement = responses[0].data.records[0].id;
  const duplicate = await request('POST', '/integrations/euparjan/procurements', body, {
    apiKey: process.env.EUPARJAN_API_KEY
  });
  assert(duplicate.data.records[0].duplicate);
  await request('POST', '/integrations/euparjan/procurements', {
    records: [{
      ...body.records[0],
      quantity: qty(9999)
    }]
  }, {
    apiKey: process.env.EUPARJAN_API_KEY,
    status: 409
  });
  const stock = await one(pool, 'SELECT on_hand_g FROM stocks WHERE facility_id=? AND season_id=?', [ids.pacs, ids.season]);
  assert.equal(stock.on_hand_g, 10000000);
});
test('Reject invalid API key and atomically roll back partly invalid push batches', async () => {
  await request('POST', '/integrations/euparjan/procurements', ids.procBody, {
    apiKey: 'bad',
    status: 401
  });
  const body = {
    records: [procure('ROLLBACK'), {
      ...procure('BAD-FARMER'),
      farmer_code: 'MISSING'
    }]
  };
  await request('POST', '/integrations/euparjan/procurements', body, {
    apiKey: process.env.EUPARJAN_API_KEY,
    status: 404
  });
  assert.equal((await one(pool, 'SELECT COUNT(*) n FROM procurement WHERE external_ref=?', [code('ROLLBACK')])).n, 0);
});
test('Reserve paddy, reject over-allocation and protect cross-miller data', async () => {
  await request('POST', '/shipments', paddy('OVERLOAD', ids.vehicle1, 21000), {
    status: 409
  });
  ids.paddy = (await request('POST', '/shipments', paddy('PADDY'), {
    auth: millerToken
  })).data.id;
  const driver=await one(pool,'SELECT driver_name,driver_phone FROM shipment_details WHERE id=?',[ids.paddy]);
  assert.deepEqual(driver,{driver_name:'Paddy Test Driver',driver_phone:'9999999999'});
  const planned=(await request('GET',`/shipments/${ids.paddy}`)).data;
  assert.equal(planned.trip_status,0);assert.equal(planned.trip_started_at,null);assert.equal(planned.trip_completed_at,null);
  assert(planned.expected_completion_at);
  const stored=await one(pool,`SELECT s.scheme_id,s.commodity_id,s.vehicle_type_id,sc.code scheme_code,co.code commodity_code
    FROM shipment_details s JOIN schemes sc ON sc.id=s.scheme_id JOIN commodities co ON co.id=s.commodity_id WHERE s.id=?`,[ids.paddy]);
  assert.equal(stored.scheme_code,'SCMR');assert.equal(stored.commodity_code,'PADDY');
  assert.equal(stored.vehicle_type_id,(await one(pool,'SELECT vehicle_type_id FROM vehicles WHERE id=?',[ids.vehicle1])).vehicle_type_id);
  const listed=await request('GET',`/shipments?scheme_code=SCMR&scheme_id=${stored.scheme_id}&commodity_id=${stored.commodity_id}`,undefined,{auth:millerToken});
  assert(listed.data.some(row=>row.id===ids.paddy&&row.scheme_id===stored.scheme_id&&row.commodity_code==='PADDY'));
  await request('POST', '/shipments', paddy('SAME-VEHICLE', ids.vehicle1, 1), {
    status: 409
  });
  await request('POST', '/shipments', paddy('TOO-MUCH', ids.vehicle2, 1), {
    status: 409
  });
  await request('GET', `/shipments/${ids.paddy}`, undefined, {
    auth: otherToken,
    status: 404
  });
  assert.equal((await request('GET', '/shipments', undefined, {
    auth: otherToken
  })).data.length, 0);
  const invalidEta=await request('POST',`/shipments/${ids.paddy}/dispatch`,{dispatched_at:at(-45),receipt_no:'INVALID-ETA',expected_completion_at:at(-46)},{auth:transporterToken,status:400});
  assert.match(invalidEta.error.message,/expected_completion_at/);
  const dispatch=await request('POST', `/shipments/${ids.paddy}/dispatch`, {
    dispatched_at: at(-45),
    receipt_no: 'DISPATCH',
  }, {
    auth: transporterToken
  });
  const dispatchedDriver=await one(pool,'SELECT driver_name,driver_phone FROM shipment_details WHERE id=?',[ids.paddy]);
  assert.deepEqual(dispatchedDriver,driver);
  assert.equal(dispatch.data.trip_status,0);assert.equal(dispatch.data.trip_started_at,null);
  assert.equal(dispatch.data.expected_completion_at,planned.expected_completion_at);
});
test('Process sorted historical GPS, ignore duplicate and older packets, verify arrival', async () => {
  const packet = (mins, lat, lng) => ({
    imei: ids.imei1,
    gps_at: at(mins),
    latitude: lat,
    longitude: lng,
    gps_fix: true
  });
  const inside = packet(-44, 23.3, 85.3),
    outside = packet(-43, 23.35, 85.35),
    destination = packet(-40, 23.4, 85.4);
  const pushed = await request('POST', '/gps/packets', {
    packets: [destination, inside, outside]
  }, {
    apiKey: process.env.GPS_API_KEY
  });
  assert.equal(pushed.data.results[2].status, 'ARRIVED');
  assert.deepEqual(pushed.data.results.map(row=>row.trip_status),[0,1,2]);
  const dup = await request('POST', '/gps/packets', {
    packets: [destination]
  }, {
    apiKey: process.env.GPS_API_KEY
  });
  assert.equal(dup.data.results[0].result, 'DUPLICATE');
  const older = await request('POST', '/gps/packets', {
    packets: [packet(-42, 23.3, 85.3)]
  }, {
    apiKey: process.env.GPS_API_KEY
  });
  assert.equal(older.data.results[0].result, 'OLDER_THAN_TRIP_WATERMARK');
  const s = await request('GET', `/shipments/${ids.paddy}`);
  assert.equal(s.data.status, 'ARRIVED');
  assert.equal(s.data.trip_status,2);
  assert.equal(new Date(s.data.trip_started_at).getTime(),Math.floor(new Date(outside.gps_at).getTime()/1000)*1000);
  assert.equal(new Date(s.data.trip_completed_at).getTime(),Math.floor(new Date(destination.gps_at).getTime()/1000)*1000);
  assert.ok(s.data.trip_started_at);assert.ok(s.data.trip_completed_at);assert.equal('departed_at' in s.data,false);assert.equal('arrived_at' in s.data,false);
  const completed=await request('GET','/shipments?trip_status=2');assert(completed.data.some(row=>row.id===ids.paddy));
  const pending=await request('GET','/shipments?trip_status=0');assert(!pending.data.some(row=>row.id===ids.paddy));
  await request('GET','/shipments?trip_status=3',undefined,{status:400});
  ids.paddyTripCompleted=s.data.trip_completed_at;
  assert.equal(s.data.events.filter(e => e.event_type === 'ARRIVED').length, 1);
});
test('Accept paddy and freeze 68% rice obligation despite later configuration change', async () => {
  await request('PATCH', `/facilities/${ids.miller}`, {
    recovery_percent: 67
  });
  const delivered = await request('POST', `/shipments/${ids.paddy}/deliver`, {
    delivered_at: at(-39),
    accepted_quantity: qty(10000),
    receipt_no: 'PADDY-ACCEPTED'
  }, {
    auth: millerToken
  });
  assert.equal(delivered.data.expected_rice_g, 6800000);
  assert.equal(delivered.data.trip_status,2);assert.equal(delivered.data.trip_completed_at,ids.paddyTripCompleted);
  await request('PATCH', `/facilities/${ids.miller}`, {
    recovery_percent: 68
  });
  await request('POST', `/shipments/${ids.paddy}/deliver`, {
    delivered_at: at(-39),
    accepted_quantity: qty(10000),
    receipt_no: 'DUPLICATE'
  }, {
    status: 409
  });
});
test('Milling consumes available paddy, produces 6800 kg rice, and cannot double consume', async () => {
  ids.batch = (await request('POST', '/milling-batches', {
    miller_id: ids.miller,
    season_id: ids.season,
    batch_no: code('BATCH'),
    scheme_code: 'SCMR',
    paddy_quantity: qty(10000),
    milled_at: at(-35)
  }, {
    auth: millerToken
  })).data.id;
  const s = await one(pool, "SELECT on_hand_g FROM stocks WHERE facility_id=? AND season_id=? AND commodity_id=(SELECT id FROM commodities WHERE code='RICE')", [ids.miller, ids.season]);
  assert.equal(s.on_hand_g, 6800000);
  await request('POST', '/milling-batches', {
    miller_id: ids.miller,
    season_id: ids.season,
    batch_no: code('EXCESS'),
    scheme_code: 'SCMR',
    paddy_quantity: qty(1),
    milled_at: at(-34)
  }, {
    status: 409
  });
});
test('Import CMR orders for both SFC and FCI, reserve rice and release on cancellation', async () => {
  for (const [label, destination] of [['SFC', 'GODOWN'], ['FCI', 'FCI']]) {
    const r = await request('POST', '/integrations/euparjan/cmr-orders', {
      records: [{
        external_ref: code(label),
        season_code: code('KMS'),
        miller_code: code('MILLER'),
        destination_code: code(destination),
        order_no: code(label),
        ordered_at: at(-34),
        due_date: '2099-12-31',
        scheme_code: 'SCMR',
        commodity_code: 'RICE',
        rice_quantity: qty(label === 'SFC' ? 6800 : 100)
      }]
    }, {
      apiKey: process.env.EUPARJAN_API_KEY
    });
    ids[label + 'order'] = r.data.records[0].id;
  }
  const fci = {
    shipment_no: code('FCI-CANCEL'),
    leg: 'CMR',
    scheme_code: 'SCMR',
    season_id: ids.season,
    miller_id: ids.miller,
    source_id: ids.miller,
    destination_id: ids.fci,
    vehicle_id: ids.vehicle1,
    order_id: ids.FCIorder,
    quantity: qty(100)
  };
  const shipment = (await request('POST', '/shipments', fci, {
    auth: millerToken
  })).data.id;
  const rescheduled=await request('POST',`/shipments/${shipment}/dispatch`,{dispatched_at:at(-33),receipt_no:'FCI-ETA',expected_completion_at:'invalid'},{auth:millerToken,status:400});
  assert.equal(rescheduled.ok,false);
  await request('POST', `/shipments/${shipment}/cancel`, {
    reason: 'Cancelled test allocation'
  }, {
    auth: millerToken
  });
  const o = await one(pool, 'SELECT committed_g FROM cmr_orders WHERE id=?', [ids.FCIorder]);
  assert.equal(o.committed_g, 0);
  const cancelled=(await request('GET',`/shipments/${shipment}`)).data;
  assert.equal(cancelled.trip_status,0);assert.equal(cancelled.trip_started_at,null);assert.equal(cancelled.trip_completed_at,null);
  ids.riceBody = {
    ...fci,
    shipment_no: code('RICE'),
    destination_id: ids.godown,
    order_id: ids.SFCorder,
    quantity: qty(6800)
  };
  ids.rice = (await request('POST', '/shipments', ids.riceBody, {
    auth: millerToken
  })).data.id;
  await request('POST', '/shipments', {
    ...ids.riceBody,
    shipment_no: code('OVERORDER'),
    vehicle_id: ids.vehicle2,
    quantity: qty(1)
  }, {
    status: 409
  });
});
test('CMR receipt requires SFC role and arrival or explicit operator override; shortage reopens balance', async () => {
  const expected=at(120);
  const dispatched=await request('POST', `/shipments/${ids.rice}/dispatch`, {
    dispatched_at: at(-30),
    expected_completion_at: expected,
    receipt_no: 'RICE-DISPATCH',
    driver_name:'Test driver',driver_phone:'9999999999'
  }, {
    auth: transporterToken
  });
  assert.equal(new Date(dispatched.data.expected_completion_at).getTime(),Math.floor(new Date(expected).getTime()/1000)*1000);
  assert.equal(dispatched.data.trip_status,0);
  const receipt = {
    delivered_at: at(-20),
    accepted_quantity: qty(6790),
    receipt_no: 'RICE-RECEIPT',
    remarks: '10 kg transit shortage recorded'
  };
  await request('POST', `/shipments/${ids.rice}/deliver`, receipt, {
    auth: millerToken,
    status: 403
  });
  await request('POST', `/shipments/${ids.rice}/deliver`, receipt, {
    status: 409
  });
  await request('POST', `/shipments/${ids.rice}/deliver`, {
    ...receipt,
    gps_override_reason: 'GPS device offline; weighbridge receipt verified'
  });
  const overrideTrip=(await request('GET',`/shipments/${ids.rice}`)).data;
  assert.equal(overrideTrip.trip_status,2);assert.equal(overrideTrip.trip_completed_at,overrideTrip.delivered_at);
  assert.equal(overrideTrip.trip_started_at,null);
  const o = await one(pool, 'SELECT delivered_g,committed_g,status FROM cmr_orders WHERE id=?', [ids.SFCorder]);
  assert.equal(o.delivered_g, 6790000);
  assert.equal(o.committed_g, 0);
  assert.equal(o.status, 'OPEN');
  const report = (await request('GET', `/reports/millers/${ids.miller}/reconciliation?season_id=${ids.season}`, undefined, {
    auth: millerToken
  })).data;
  assert.equal(report.totals.rice_obligation_balance_g, 10000);
  assert.equal(report.totals.rice_shortage_g, 10000);
  assert.equal(report.totals.production_variance_g, 0);
});
test('Concurrent competing reservations cannot overspend stock; cancellation restores reservations', async () => {
  await request('POST', '/integrations/euparjan/procurements', {
    records: [procure('CONCURRENCY', 1000)]
  }, {
    apiKey: process.env.EUPARJAN_API_KEY
  });
  async function attempt(body) {
    const r = await fetch(url + '/api/v1/shipments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin}`,
        'Idempotency-Key': key()
      },
      body: JSON.stringify(body)
    });
    return {
      status: r.status,
      body: await r.json()
    };
  }
  const results = await Promise.all([attempt(paddy('CONCURRENT1', ids.vehicle1, 750)), attempt(paddy('CONCURRENT2', ids.vehicle2, 750))]);
  assert.equal(results.filter(r => r.status === 201).length, 1);
  assert.equal(results.filter(r => r.status === 409).length, 1);
  const accepted = results.find(r => r.status === 201);
  await request('POST', `/shipments/${accepted.body.data.id}/cancel`, {
    reason: 'Release concurrency test reservation'
  });
  const s = await one(pool, 'SELECT on_hand_g,reserved_g FROM stocks WHERE facility_id=? AND season_id=?', [ids.pacs, ids.season]);
  assert.equal(s.on_hand_g, 1000000);
  assert.equal(s.reserved_g, 0);
});
test('Capacity, future GPS, ownership, reports and stock-ledger invariants', async () => {
  await request('PATCH', `/facilities/${ids.pacs}`, {
    capacity: qty(1)
  }, {
    status: 409
  });
  const future = await request('POST', '/gps/packets', {
    packets: [{
      imei: ids.imei1,
      gps_at: at(60),
      latitude: 23,
      longitude: 85,
      gps_fix: true
    }]
  }, {
    apiKey: process.env.GPS_API_KEY,
    status: 207
  });
  assert.equal(future.data.failed, 1);
  await request('GET', `/vehicles/${ids.vehicle1}/location`, undefined, {
    auth: otherToken,
    status: 403
  });
  for (const endpoint of ['/reports/stocks', '/reports/ledger', '/reports/dashboard', '/reports/audit', '/milling-batches', '/cmr-orders', '/procurements']) await request('GET', endpoint);
  const mismatches = await rows(pool, `SELECT s.facility_id FROM stocks s LEFT JOIN (SELECT facility_id,season_id,scheme_id,commodity_id,SUM(on_hand_delta_g) h,SUM(reserved_delta_g) r FROM stock_ledger GROUP BY facility_id,season_id,scheme_id,commodity_id) l ON l.facility_id=s.facility_id AND l.season_id=s.season_id AND l.commodity_id=s.commodity_id AND l.scheme_id=s.scheme_id WHERE s.season_id=? AND (s.on_hand_g<>COALESCE(l.h,0) OR s.reserved_g<>COALESCE(l.r,0))`, [ids.season]);
  assert.equal(mismatches.length, 0);
});

test('Scheme and commodity stay isolated from procurement through Miller milling and godown delivery',async()=>{
  const pushed=await request('POST','/integrations/euparjan/procurements',{
    records:[{...procure('CCMR-PADDY',300),scheme_code:'CCMR'}]
  },{apiKey:process.env.EUPARJAN_API_KEY});
  const procurementId=pushed.data.records[0].id;
  const stockAudit=await one(pool,'SELECT * FROM stocks WHERE facility_id=? AND season_id=? AND scheme_id=(SELECT id FROM schemes WHERE code=?) AND commodity_id=(SELECT id FROM commodities WHERE code=?)',[ids.pacs,ids.season,'CCMR','PADDY']);
  assert(stockAudit.id>0);
  assert.equal(stockAudit.status,1);
  assert.equal(stockAudit.created_by,null);
  assert.equal(stockAudit.created_by_actor,'integration');
  assert.equal(stockAudit.updated_by_actor,'integration');
  assert(stockAudit.created_at instanceof Date&&stockAudit.updated_at instanceof Date);
  const procurementLedger=await one(pool,"SELECT * FROM stock_ledger WHERE reference_type='PROCUREMENT' AND reference_id=?",[procurementId]);
  assert.equal(procurementLedger.scheme_id,stockAudit.scheme_id);
  assert.equal(procurementLedger.commodity_id,stockAudit.commodity_id);
  assert.equal(procurementLedger.created_by_actor,'integration');
  assert.equal(procurementLedger.updated_by,null);
  assert.equal(procurementLedger.updated_at,null);
  assert(!Object.hasOwn(procurementLedger,'commodity'));
  assert(!Object.hasOwn(procurementLedger,'scheme_code'));
  const stored=await one(pool,'SELECT * FROM procurement WHERE id=?',[procurementId]);
  const schemeMaster=await one(pool,"SELECT id FROM schemes WHERE code='CCMR'");
  const commodityMaster=await one(pool,"SELECT id FROM commodities WHERE code='PADDY'");
  assert.equal(stored.scheme_id,schemeMaster.id);
  assert.equal(stored.commodity_id,commodityMaster.id);
  assert(!Object.hasOwn(stored,'scheme_code'));
  assert(!Object.hasOwn(stored,'commodity'));
  const listed=await request('GET',`/procurements?scheme_id=${schemeMaster.id}&commodity_id=${commodityMaster.id}`);
  assert(listed.data.some(row=>row.id===procurementId&&row.scheme_code==='CCMR'&&row.commodity==='PADDY'));
  const lots=await request('GET',`/procurements/available-lots?facility_id=${ids.pacs}&season_id=${ids.season}&scheme_id=${schemeMaster.id}`);
  assert(lots.data.some(row=>row.id===procurementId&&row.scheme_id===schemeMaster.id));
  const ccBody={...paddy('CCMR-TOO-MUCH',ids.vehicle1,301),scheme_code:'CCMR'};
  const denied=await request('POST','/shipments',ccBody,{auth:millerToken,status:409});
  assert.equal(denied.error.code,'INSUFFICIENT_STOCK');
  await request('POST','/shipments',{
    ...ccBody,shipment_no:code('CROSS-SCHEME-LOT'),quantity:qty(100),
    lots:[{procurement_id:ids.procurement,quantity:qty(100)}]
  },{auth:millerToken,status:400});
  const reservation=(await request('POST','/shipments',{
    ...ccBody,shipment_no:code('CCMR-CANCEL'),quantity:qty(200)
  },{auth:millerToken})).data.id;
  const reservedAudit=await one(pool,'SELECT * FROM stocks WHERE id=?',[stockAudit.id]);
  assert.equal(reservedAudit.id,stockAudit.id);
  assert.equal(reservedAudit.created_by_actor,'integration');
  assert(reservedAudit.updated_by>0);
  assert.equal(reservedAudit.updated_by_actor,`user:${reservedAudit.updated_by}`);
  await request('POST',`/shipments/${reservation}/cancel`,{reason:'Verify scheme reservation release'},{auth:millerToken});
  const sourceBalance=await one(pool,"SELECT * FROM stocks WHERE facility_id=? AND season_id=? AND scheme_id=(SELECT id FROM schemes WHERE code='CCMR') AND commodity_id=(SELECT id FROM commodities WHERE code='PADDY')",[ids.pacs,ids.season]);
  assert.equal(sourceBalance.reserved_g,0);
  await rows(pool,'UPDATE stocks SET status=0 WHERE id=?',[stockAudit.id]);
  const inactive=await request('POST','/shipments',{
    ...ccBody,shipment_no:code('INACTIVE-BALANCE'),quantity:qty(100)
  },{auth:millerToken,status:409});
  assert.equal(inactive.error.code,'STOCK_INACTIVE');
  await rows(pool,'UPDATE stocks SET status=1 WHERE id=?',[stockAudit.id]);
  const trip=(await request('POST','/shipments',{
    ...ccBody,shipment_no:code('CCMR-PADDY-TRIP'),quantity:qty(200)
  },{auth:millerToken})).data.id;
  const links=await rows(pool,'SELECT * FROM shipment_lots WHERE shipment_id=?',[trip]);
  assert.equal(links.length,1);
  assert.equal(links[0].procurement_id,procurementId);
  await request('POST',`/shipments/${trip}/dispatch`,{
    dispatched_at:at(-45),receipt_no:code('CCMR-PADDY-DISPATCH'),driver_name:'Test Driver',driver_phone:'9999999999'
  });
  await request('POST',`/shipments/${trip}/deliver`,{
    delivered_at:at(-40),accepted_quantity:qty(200),receipt_no:code('CCMR-PADDY-DELIVERY'),gps_override_reason:'Scheme isolation test arrival override'
  });
  await request('POST','/milling-batches',{
    miller_id:ids.miller,season_id:ids.season,scheme_code:'CCMR',batch_no:code('CCMR-MILLING'),paddy_quantity:qty(200),milled_at:at(-35)
  },{auth:millerToken});
  // An unrelated SCMR balance must not fund a CCMR reservation.
  await transaction(async c=>{
    await lockFacilities(c,[ids.miller]);
    await stock(c,ids.miller,ids.season,'RICE',1000000,0,'SCHEME_TEST',ids.miller,'SCMR');
  });
  const order=(await request('POST','/integrations/euparjan/cmr-orders',{
    records:[{external_ref:code('CCMR-ORDER'),season_code:code('KMS'),miller_code:code('MILLER'),destination_code:code('GODOWN'),
      order_no:code('CCMR-ORDER'),ordered_at:at(-34),due_date:'2099-12-31',scheme_code:'CCMR',commodity_code:'RICE',rice_quantity:qty(300)}]
  },{apiKey:process.env.EUPARJAN_API_KEY})).data.records[0].id;
  const riceBody={shipment_no:code('CCMR-RICE-OVER'),leg:'CMR',season_id:ids.season,scheme_code:'CCMR',miller_id:ids.miller,
    source_id:ids.miller,destination_id:ids.godown,vehicle_id:ids.vehicle1,order_id:order,quantity:qty(137)};
  await request('POST','/shipments',riceBody,{auth:millerToken,status:409});
  await request('POST','/shipments',{...riceBody,scheme_code:'SCMR'},{auth:millerToken,status:400});
  const riceTrip=(await request('POST','/shipments',{
    ...riceBody,shipment_no:code('CCMR-RICE-TRIP'),quantity:qty(136)
  },{auth:millerToken})).data.id;
  await request('POST',`/shipments/${riceTrip}/dispatch`,{
    dispatched_at:at(-30),receipt_no:code('CCMR-RICE-DISPATCH'),driver_name:'Test Driver',driver_phone:'9999999999'
  });
  await request('POST',`/shipments/${riceTrip}/deliver`,{
    delivered_at:at(-20),accepted_quantity:qty(136),receipt_no:code('CCMR-RICE-DELIVERY'),gps_override_reason:'Scheme isolation test arrival override'
  });
  const godown=await one(pool,"SELECT on_hand_g FROM stocks WHERE facility_id=? AND season_id=? AND scheme_id=(SELECT id FROM schemes WHERE code='CCMR') AND commodity_id=(SELECT id FROM commodities WHERE code='RICE')",[ids.godown,ids.season]);
  assert.equal(godown.on_hand_g,136000);
  const ledger=await rows(pool,'SELECT DISTINCT sc.code scheme_code FROM stock_ledger l JOIN schemes sc ON sc.id=l.scheme_id WHERE reference_type IN (\'RESERVE\',\'DISPATCH\',\'DELIVERY\') AND reference_id=?',[riceTrip]);
  assert.deepEqual(ledger.map(row=>row.scheme_code),['CCMR']);
  const invalid=await request('POST','/integrations/euparjan/procurements',{
    records:[{...procure('BAD-COMMODITY'),commodity_code:'RICE'}]
  },{apiKey:process.env.EUPARJAN_API_KEY,status:400});
  assert.equal(invalid.ok,false);
  const unknown=await request('POST','/integrations/euparjan/procurements',{
    records:[{...procure('UNKNOWN-SCHEME'),scheme_code:'UNKNOWN'}]
  },{apiKey:process.env.EUPARJAN_API_KEY,status:404});
  assert.equal(unknown.error.code,'SCHEME_NOT_FOUND');
  assert.match(unknown.error.message,/^scheme_code=UNKNOWN: not found or inactive\.$/);
  const missingSource=await request('POST','/integrations/euparjan/procurements',{
    records:[{...procure('MISSING-SOURCE'),facility_code:code('MISSING-LAMPS')}]
  },{apiKey:process.env.EUPARJAN_API_KEY,status:404});
  assert.equal(missingSource.error.code,'PADDY_SOURCE_NOT_FOUND');
  assert(missingSource.error.message.includes('facility_code='+code('MISSING-LAMPS')+':'));
  const mismatches=await rows(pool,`SELECT s.facility_id FROM stocks s LEFT JOIN (
    SELECT facility_id,season_id,scheme_id,commodity_id,SUM(on_hand_delta_g) h,SUM(reserved_delta_g) r
    FROM stock_ledger GROUP BY facility_id,season_id,scheme_id,commodity_id
    ) l ON l.facility_id=s.facility_id AND l.season_id=s.season_id AND l.scheme_id=s.scheme_id AND l.commodity_id=s.commodity_id
    WHERE s.season_id=? AND (s.on_hand_g<>COALESCE(l.h,0) OR s.reserved_g<>COALESCE(l.r,0))`,[ids.season]);
  assert.equal(mismatches.length,0);
});

test('Procurement corrections update reference/quantity once, preserve retries and protect used stock',async()=>{
  const original=procure('CORRECTION',100);
  const apiKey=process.env.EUPARJAN_API_KEY;
  const procurementId=(await request('POST','/integrations/euparjan/procurements',{records:[original]},{apiKey})).data.records[0].id;
  const path=`/integrations/euparjan/procurements/${procurementId}`;
  const balance=()=>one(pool,'SELECT * FROM stocks WHERE facility_id=? AND season_id=? AND scheme_id=(SELECT id FROM schemes WHERE code=?) AND commodity_id=(SELECT id FROM commodities WHERE code=?)',[ids.pacs,ids.season,'SCMR','PADDY']);
  const start=await balance();
  const newRef=code('CORRECTED-REFERENCE'),idem=key();
  const patch={external_ref:newRef,quantity:qty(200),reason:'Correct source purchase reference and weight'};
  const first=await request('PATCH',path,patch,{apiKey,idem});
  const replay=await request('PATCH',path,patch,{apiKey,idem});
  assert.equal(first.data.id,procurementId);assert.equal(replay.replayed,true);
  assert.equal(first.data.quantity_g,200000);assert.equal((await balance()).on_hand_g,start.on_hand_g+100000);
  for(const record of [original,{...original,external_ref:newRef,quantity:qty(200)}]){
    const retried=await request('POST','/integrations/euparjan/procurements',{records:[record]},{apiKey});
    assert.equal(retried.data.records[0].id,procurementId);assert.equal(retried.data.records[0].duplicate,true);
  }
  assert.equal((await balance()).on_hand_g,start.on_hand_g+100000);
  const found=await request('GET',`/procurements?external_ref=${encodeURIComponent(original.external_ref)}`);
  assert.equal(found.data.length,1);assert.equal(found.data[0].external_ref,newRef);
  const otherRef=code('OTHER-PURCHASE');
  await request('POST','/integrations/euparjan/procurements',{records:[{...procure('OTHER-PURCHASE',5)}]},{apiKey});
  const collision=await request('PATCH',path,{external_ref:otherRef,reason:'Attempt duplicate reference'},{apiKey,status:409});
  assert.equal(collision.error.code,'EXTERNAL_REF_CONFLICT');
  await request('PATCH',`/procurements/${procurementId}`,{quantity:qty(150),reason:'Unauthorized Miller correction'},{auth:millerToken,status:403});
  const trip=(await request('POST','/shipments',{
    ...paddy('CORRECTION-RESERVATION',ids.vehicle1,60),lots:[{procurement_id:procurementId,quantity:qty(60)}]
  },{auth:millerToken})).data.id;
  const reserved=await request('PATCH',path,{quantity:qty(50),reason:'Below reservation'},{apiKey,status:409});
  assert.equal(reserved.error.code,'PROCUREMENT_QUANTITY_IN_USE');assert.match(reserved.error.message,/60 QTL|0.6 QTL/);
  await request('PATCH',`/procurements/${procurementId}`,{quantity:qty(180),reason:'Correct remaining purchase weight'});
  await request('POST',`/shipments/${trip}/dispatch`,{dispatched_at:at(-45),receipt_no:code('CORRECTION-DISPATCH'),driver_name:'Test Driver',driver_phone:'9999999999'});
  const used=await request('PATCH',path,{quantity:qty(50),reason:'Below dispatched weight'},{apiKey,status:409});
  assert.equal(used.error.code,'PROCUREMENT_QUANTITY_IN_USE');
  await request('PATCH',path,{quantity:qty(80),reason:'Final corrected purchase weight'},{apiKey});
  const beforeFailure=await balance();
  const failedRef=code('CAPACITY-ROLLBACK');
  await request('PATCH',path,{external_ref:failedRef,quantity:qty(2000,'MT'),reason:'Exceeds facility capacity'},{apiKey,status:409});
  assert.equal((await balance()).on_hand_g,beforeFailure.on_hand_g);
  assert.equal((await one(pool,'SELECT COUNT(*) n FROM procurement_references WHERE external_ref=?',[failedRef])).n,0);
  const record=await one(pool,'SELECT * FROM procurement WHERE id=?',[procurementId]);
  assert.equal(record.external_ref,newRef);assert.equal(record.quantity_g,80000);assert.equal(record.available_g,20000);assert.equal(record.reserved_g,0);
  const beforeRename=await one(pool,"SELECT COUNT(*) n FROM stock_ledger WHERE reference_type='PROCUREMENT_CORRECTION'");
  const refOnly=code('REFERENCE-ONLY');
  await request('PATCH',path,{external_ref:refOnly,reason:'Correct reference only'},{apiKey});
  const noOp=await request('PATCH',path,{external_ref:refOnly,quantity:qty(80),reason:'Same correction again'},{apiKey});
  assert.equal(noOp.data.updated,false);
  assert.equal((await one(pool,"SELECT COUNT(*) n FROM stock_ledger WHERE reference_type='PROCUREMENT_CORRECTION'")).n,beforeRename.n);
  const history=await rows(pool,'SELECT * FROM procurement_corrections WHERE procurement_id=? ORDER BY id',[procurementId]);
  assert.equal(history.length,4);assert.equal(history[0].created_by_actor,'integration');assert.equal(history[0].old_quantity_g,100000);assert.equal(history[0].new_quantity_g,200000);
  assert.equal(history[1].created_by_actor,`user:${history[1].created_by}`);
  await request('POST',`/shipments/${trip}/deliver`,{accepted_quantity:qty(60),delivered_at:at(-40),receipt_no:code('CORRECTION-DELIVERY'),gps_override_reason:'Correction test arrival override'});
  const mismatch=await rows(pool,`SELECT s.id FROM stocks s LEFT JOIN (
    SELECT facility_id,season_id,scheme_id,commodity_id,SUM(on_hand_delta_g) h,SUM(reserved_delta_g) r
    FROM stock_ledger GROUP BY facility_id,season_id,scheme_id,commodity_id
    ) l ON l.facility_id=s.facility_id AND l.season_id=s.season_id AND l.scheme_id=s.scheme_id AND l.commodity_id=s.commodity_id
    WHERE s.season_id=? AND (s.on_hand_g<>COALESCE(l.h,0) OR s.reserved_g<>COALESCE(l.r,0))`,[ids.season]);
  assert.equal(mismatch.length,0);
});

test('CMR submission stores master IDs and preserves date, lots, driver and vehicle history through receiving',async()=>{
  const storeId=await insert(pool,'tbl_store_location_master',{store_type:2,store_id:code('GODOWN'),store_name:'Test submission store',district_id:ids.district,status:1});
  await request('PATCH',`/facilities/${ids.godown}`,{core_store_id:storeId});
  const submittedOn=new Date().toISOString().slice(0,10);
  const response=await request('POST','/cmr/submissions',{
    season_id:ids.season,order_id:ids.SFCorder,destination_id:ids.godown,district_id:ids.district,
    store_location_id:storeId,scheme_type:'SCMR',commodity_type:'RICE',vehicle_id:ids.vehicle1,
    quantity:qty(1),expected_completion_at:at(90),submitted_on:submittedOn,lot_count:2,stenciling_code:code('STENCIL'),
    gunny_bag_year:2026,gunny_bag_type:'New jute',total_bags:2,driver_name:'CMR Test Driver',driver_phone:'9999999999'
  },{auth:millerToken});
  const shipmentId=response.data.id;
  const shipment=(await request('GET',`/shipments/${shipmentId}`,undefined,{auth:millerToken})).data;
  assert.equal(shipment.scheme_code,'SCMR');assert.equal(shipment.commodity_code,'RICE');
  assert.equal(shipment.scheme_id,response.data.scheme_id);assert.equal(shipment.commodity_id,response.data.commodity_id);
  assert.equal(shipment.cmr_lot_count,2);assert.equal(shipment.submitted_on.slice(0,10),submittedOn);
  assert.equal(shipment.driver_name,'CMR Test Driver');assert.equal(shipment.vehicle_type_id,ids.vehicleType);
  assert(shipment.expected_completion_at);assert.equal(shipment.trip_status,0);
  const newType=(await request('POST','/vehicle-types',{code:code('NEW-TYPE'),name:'Later vehicle type'})).data.id;
  try {
    await rows(pool,'UPDATE vehicles SET vehicle_type_id=? WHERE id=?',[newType,ids.vehicle1]);
    const historical=(await request('GET',`/shipments/${shipmentId}`)).data;
    assert.equal(historical.vehicle_type_id,ids.vehicleType);assert.equal(historical.vehicle_type,'Test truck');
  }finally{await rows(pool,'UPDATE vehicles SET vehicle_type_id=? WHERE id=?',[ids.vehicleType,ids.vehicle1]);}
  const user={role:'CORE_RECEIVER',actor:'core:depot:77',core_user_id:77,core_user_type:'depot',stores:[{store_id:storeId,district_id:ids.district}]};
  const context={user,params:{id:shipmentId},query:{}};
  const detail=await receiving.getShipment(context);
  assert.equal(detail.body.data.scheme_code,'SCMR');assert.equal(detail.body.data.commodity_code,'RICE');
  const pending=await receiving.listShipments(context);assert(pending.body.data.some(row=>row.id===shipmentId&&row.scheme_code==='SCMR'));
  await request('POST',`/shipments/${shipmentId}/dispatch`,{dispatched_at:at(-5),receipt_no:code('CMR-ID-DISPATCH')},{auth:millerToken});
  const accepted=await transaction(c=>receiving.receiveCMR(c,receivingSchema.parse({
    decision:'ACCEPTED',receipt_no:code('CMR-ID-RECEIPT'),received_at:new Date().toISOString(),
    stacks:[{stack_no:code('ID-STACK'),received_quantity_qtl:'0.01000',bags:2}],gross_weight_kg:'2.160',empty_bag_weight_kg:'0.580',
    red_grains_percent:0,chalky_grains_percent:0,moisture_percent:12,broken_rice_percent:1,
    other_standards:'Test receipt',compliance_confirmed:true,remarks:'',gps_override_reason:'Integration test arrival override'
  }),context));
  assert.equal(accepted.net_g,1000);
  const received=await receiving.listStock(context);
  assert(received.body.data.some(row=>row.shipment_no===shipment.shipment_no&&row.scheme_code==='SCMR'));
});
