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
import {ensureTenRecords} from '../scripts/push-api-examples.js';
if (!process.env.DB_NAME?.endsWith('_test')) throw new Error('Use a migrated DB_NAME ending in _test');
const suffix = crypto.randomBytes(4).toString('hex'),
  ids = {};
let server, url, admin, millerToken, pacsToken, otherToken, transporterToken;
const pass = 'Only-for-integration-tests-2026';
const key = () => crypto.randomUUID();
const at = minutes => new Date(Date.now() + minutes * 60000).toISOString();
let receivingGpsSequence=0;
async function arriveForReceipt(shipmentId){
  const s=await one(pool,`SELECT s.source_lat,s.source_lng,s.destination_lat,s.destination_lng,i.imei
    FROM shipments s JOIN gps_devices d ON d.vehicle_id=s.vehicle_id JOIN imeis i ON i.id=d.imei_id
    WHERE s.id=?`,[shipmentId]);
  const time=Date.now()-120000+(++receivingGpsSequence)*5000;
  await request('POST','/gps/packets',{packets:[
    {imei:s.imei,gps_at:new Date(time).toISOString(),latitude:Number(s.source_lat)+0.01,longitude:Number(s.source_lng),gps_fix:true},
    {imei:s.imei,gps_at:new Date(time+1000).toISOString(),latitude:Number(s.destination_lat),longitude:Number(s.destination_lng),gps_fix:true}
  ]},{apiKey:process.env.GPS_API_KEY});
  assert.equal((await one(pool,'SELECT status FROM shipments WHERE id=?',[shipmentId])).status,'ARRIVED');
}
const qty = (value, unit = 'KG') => ({
  value,
  unit
});
const code = name => `${name}-${suffix}`;
async function request(method, path, body, {
  auth = method === 'POST' && path === '/shipments' ? (body?.leg === 'PADDY' ? pacsToken : millerToken) : admin,
  apiKey,
  pushMode,
  idem = key(),
  status
} = {}) {
  const headers = {
    'Content-Type': 'application/json'
  };
  if(idem)headers['Idempotency-Key']=idem;
  if (auth) headers.Authorization = `Bearer ${auth}`;
  if (apiKey) headers['X-API-Key'] = apiKey;
  if (pushMode) headers['X-Push-Mode'] = pushMode;
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

test('Integration key pushes season and both mappings without login',async()=>{
  const apiKey=process.env.EUPARJAN_API_KEY;
  const payload={code:code('PUSH-SEASON'),name:'External season',start_date:'2026-01-01',end_date:'2099-12-31',recovery_percent:68};
  await request('POST','/integrations/euparjan/masters/seasons',payload,{auth:null,status:401});
  const idem=key();
  const season=await request('POST','/integrations/euparjan/masters/seasons',payload,{auth:null,apiKey,idem});
  const replay=await request('POST','/integrations/euparjan/masters/seasons',payload,{auth:null,apiKey,idem,status:200});
  assert.equal(replay.data.id,season.data.id);
});
test('Shipment schema keeps master IDs and meaningful CMR metadata',async()=>{
  const fields=new Set((await rows(pool,'SHOW COLUMNS FROM shipments')).map(row=>row.Field));
  for(const field of ['scheme_code','commodity_code','vehicle_type_id','submitted_on','cmr_lot_count','trip_status','trip_started_at','trip_completed_at','expected_completion_at','quantity_kg','accepted_kg','shortage_kg','received_bags'])assert(fields.has(field));
  assert(!fields.has('quantity_g'));
  assert(!fields.has('delivery_receipt'));
  for(const field of ['scheme_id','commodity_id','scheme_type','commodity_type','submitted_vehicle_type','submitted_count'])assert(!fields.has(field));
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
    district_id: ids.district
  })).data.id;
  for (const [source_id, destination_id] of [[ids.pacs, ids.miller], [ids.miller, ids.godown], [ids.miller, ids.fci]]) await request('POST', '/route-tags', {
    season_id: ids.season,
    source_id,
    destination_id
  });
  for (const [facilityId,store_type] of [[ids.godown,2],[ids.fci,1]]) {
    const store_id=await insert(pool,'tbl_store_location_master',{store_type,store_id:code('STORE'),store_name:'Assignment test store',district_id:ids.district,status:1});
    await request('PATCH',`/facilities/${facilityId}`,{core_store_id:store_id});
    const assigned=await request('POST','/miller-store-assignments',{season_id:ids.season,miller_id:ids.miller,store_id});
    assert.equal(Number(assigned.data.store_id),Number(store_id));
  }
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
  await request('POST', '/users', {
    name: 'PACS shipment creator', email: code('pacs') + '@test.invalid', password: pass,
    role: 'PACS', facility_id: ids.pacs
  });
  pacsToken = await login(code('pacs') + '@test.invalid');
  otherToken = await login(code('other') + '@test.invalid');
  await request('POST', '/users', {
    name: 'Transport user',
    email: code('transport') + '@test.invalid',
    password: pass,
    role: 'TRANSPORTER'
  });
  transporterToken = await login(code('transport') + '@test.invalid');
  ids.vehicleType = (await request('POST','/vehicle-types',{code:code('TRUCK'),name:'Test truck'})).data.id;
  for (const i of [1, 2]) {
    ids['vehicle' + i] = (await request('POST', '/vehicles', {
      transporter_name:'Test transporter',
      transporter_contact_no:'9999999999',
      district_id:ids.district,
      registration_no: `JH${suffix.toUpperCase()}${i}`,
      capacity: qty(20, 'MT'),
      vehicle_type_id: ids.vehicleType
    }, {
      auth: transporterToken
    })).data.id;
    ids['imei' + i] = `${String(Date.now()).slice(-11)}${i}${Math.floor(Math.random() * 900 + 100)}`;
    ids['imeiMaster' + i] = (await request('POST', '/imeis', {
      imei: ids['imei' + i], provider: 'Test GPS', district_id: ids.district
    })).data.id;
    await request('POST', '/gps-devices', {
      vehicle_id: ids['vehicle' + i],
      imei_id: ids['imeiMaster' + i],
      district_id: ids.district
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
    miller_id: ids.miller,
    procured_at: at(-60),
    quantity: qty(value)
  };
}
test('Postman setup resolves a coherent mapping and never chooses an ambiguous setup',async()=>{
  for(const name of ['seasons','schemes','commodities']){
    const dropdown=await request('GET',`/cmr/dropdowns/${name}`,undefined,{auth:millerToken});
    assert.deepEqual(Object.keys(dropdown.data),[name]);
    assert(Array.isArray(dropdown.data[name]));
  }
  const unassignedDistrict=await insert(pool,'tbl_district_master',{id_old:999998,district_name:'Unassigned active district',status:1});
  const inactiveDistrict=await insert(pool,'tbl_district_master',{id_old:999997,district_name:'Inactive district',status:0});
  const simpleDistricts=await request('GET','/cmr/districts',undefined,{auth:millerToken});
  assert.deepEqual(Object.keys(simpleDistricts.data),['districts']);
  assert(simpleDistricts.data.districts.some(d=>d.id===ids.district));
  assert(simpleDistricts.data.districts.some(d=>d.id===unassignedDistrict));
  assert(!simpleDistricts.data.districts.some(d=>d.id===inactiveDistrict));
  const mappings=await request('GET',`/pacs-mappings?season_id=${ids.season}`,undefined,{auth:pacsToken});
  assert.equal(mappings.data.length,1);
  assert.equal(mappings.data[0].miller_id,ids.miller);
  assert.equal(mappings.data[0].source_id,ids.pacs);
  await request('GET','/pacs-mappings?facility_id='+ids.other,undefined,{auth:pacsToken,status:403});
  await request('GET','/pacs-mappings',undefined,{auth:millerToken,status:403});
  const query=new URLSearchParams({season_code:code('KMS'),miller_code:code('MILLER'),
    destination_code:code('GODOWN'),source_code:code('PACS')});
  const vehicle=await one(pool,'SELECT registration_no FROM vehicles WHERE id=?',[ids.vehicle1]);
  query.set('vehicle_no',vehicle.registration_no);
  const result=await request('GET','/setup/postman?'+query);
  assert.equal(result.data.ready_for_orders,true);assert.equal(result.data.ready_for_shipments,true);
  assert.equal(result.data.context.miller_id,ids.miller);
  assert.equal(result.data.context.destination_id,ids.godown);
  assert.equal(result.data.context.pacs_id,ids.pacs);
  assert.equal(result.data.vehicle.vehicle_id,ids.vehicle1);
  const all=await request('GET','/setup/postman');
  assert.equal(all.data.context,null);assert.equal(all.data.ready_for_orders,false);
  await request('GET','/setup/postman',undefined,{auth:millerToken,status:403});
  const missing=await request('GET','/setup/postman?miller_code=DOES-NOT-EXIST');
  assert.equal(missing.data.ready_for_orders,false);assert(missing.data.missing.length>0);
});
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
  const stock = await one(pool, 'SELECT on_hand_kg FROM stocks WHERE facility_id=? AND season_id=?', [ids.pacs, ids.season]);
  assert.equal(stock.on_hand_kg, 10000);
});
test('Reject invalid API key and atomically roll back partly invalid push batches', async () => {
  await request('POST', '/integrations/euparjan/procurements', ids.procBody, {
    apiKey: 'bad',
    status: 401
  });
  const body = {
    records: [procure('ROLLBACK'), {
      ...ids.procBody.records[0],
      quantity:qty(9999)
    }]
  };
  await request('POST', '/integrations/euparjan/procurements', body, {
    apiKey: process.env.EUPARJAN_API_KEY,
    status: 409
  });
  assert.equal((await one(pool, 'SELECT COUNT(*) n FROM procurement WHERE external_ref=?', [code('ROLLBACK')])).n, 0);
});
test('Reserve paddy, reject over-allocation and protect cross-miller data', async () => {
  await request('POST', '/shipments', paddy('OVERLOAD', ids.vehicle1, 21000), {
    status: 409
  });
  ids.paddy = (await request('POST', '/shipments', paddy('PADDY'), {
    auth:pacsToken
  })).data.id;
  const driver=await one(pool,'SELECT driver_name,driver_phone FROM shipments WHERE id=?',[ids.paddy]);
  assert.deepEqual(driver,{driver_name:'Paddy Test Driver',driver_phone:'9999999999'});
  const planned=(await request('GET',`/shipments/${ids.paddy}`)).data;
  assert.equal(planned.trip_status,0);assert.equal(planned.trip_started_at,null);assert.equal(planned.trip_completed_at,null);
  assert.equal(planned.expected_completion_at,null);
  const stored=await one(pool,`SELECT s.scheme_code,s.commodity_code,s.vehicle_type_id
    FROM shipments s WHERE s.id=?`,[ids.paddy]);
  assert.equal(stored.scheme_code,'SCMR');assert.equal(stored.commodity_code,'PADDY');
  assert.equal(stored.vehicle_type_id,(await one(pool,'SELECT vehicle_type_id FROM vehicles WHERE id=?',[ids.vehicle1])).vehicle_type_id);
  const listed=await request('GET',`/shipments?scheme_code=${stored.scheme_code}&commodity_code=${stored.commodity_code}`,undefined,{auth:millerToken});
  assert(listed.data.some(row=>row.id===ids.paddy&&row.scheme_code===stored.scheme_code&&row.commodity_code==='PADDY'));
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
  const dispatchedDriver=await one(pool,'SELECT driver_name,driver_phone FROM shipments WHERE id=?',[ids.paddy]);
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
  const eta=await one(pool,`SELECT s.expected_completion_at,TIMESTAMPADD(MINUTE,r.duration_minutes,s.trip_started_at) calculated
    FROM shipments s JOIN shipment_routes r ON r.id=s.route_id WHERE s.id=?`,[ids.paddy]);
  assert.equal(new Date(eta.expected_completion_at).getTime(),new Date(eta.calculated).getTime());
  assert.equal(s.data.events.filter(e => e.event_type === 'ARRIVED').length, 1);
});
test('Accept paddy and freeze 68% rice obligation despite later configuration change', async () => {
  await request('PATCH', `/facilities/${ids.miller}`, {
    recovery_percent: 67
  });
  const delivered = await request('POST', `/shipments/${ids.paddy}/deliver`, {
    received_bags: 10, ...qty(10000)
  }, {
    auth: millerToken,idem:null
  });
  assert.equal(delivered.data.expected_rice_kg, 6800);
  assert.equal(delivered.data.trip_status,2);assert.equal(delivered.data.trip_completed_at,ids.paddyTripCompleted);
  await request('PATCH', `/facilities/${ids.miller}`, {
    recovery_percent: 68
  });
  await request('POST', `/shipments/${ids.paddy}/deliver`, {
    received_bags: 10, ...qty(10000)
  }, {
    status: 409
  });
});
test('Milling remains informational and cannot duplicate a batch or post extra stock', async () => {
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
  const s = await one(pool, "SELECT COUNT(*) entries FROM stock_ledger WHERE reference_type='MILLING'");
  assert.equal(s.entries, 0);
  await request('POST', '/milling-batches', {
    miller_id: ids.miller,
    season_id: ids.season,
    batch_no: code('BATCH'),
    scheme_code: 'SCMR',
    paddy_quantity: qty(1),
    milled_at: at(-34)
  }, {
    status: 409
  });
});
test('Import CMR orders for both SFC and FCI, reserve rice and release on cancellation', async () => {
  const mismatch=await request('POST','/integrations/euparjan/cmr-orders',{
    records:[{external_ref:code('BAD-ORDER-DISTRICT'),season_id:ids.season,miller_id:ids.miller,
      destination_id:ids.godown,order_no:code('BAD-ORDER-DISTRICT'),ordered_at:at(-34),
      due_date:'2099-12-31',scheme_code:'SCMR',commodity_code:'RICE',rice_quantity:qty(1),district_id:ids.district+10000}]
  },{apiKey:process.env.EUPARJAN_API_KEY,status:201});
  assert(mismatch.data.records[0].id);
  for (const [label, destination] of [['SFC', 'GODOWN'], ['FCI', 'FCI']]) {
    const r = await request('POST', '/integrations/euparjan/cmr-orders', {
      records: [{
        external_ref: code(label),
        season_id: ids.season,
        miller_id: ids.miller,
        destination_id: destination==='GODOWN'?ids.godown:ids.fci,
        order_no: code(label),
        district_id:ids.district,
        lot_count:2,
        stenciling_code:code('STENCIL-'+label),
        gunny_bag_year:2026,gunny_bag_type:'NEW',
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
    const listed=await request('GET','/cmr-orders?order_no='+encodeURIComponent(code(label)));
    assert.equal(listed.data[0].district_id,ids.district);
    assert.equal(listed.data[0].lot_count,2);
    assert.equal(listed.data[0].gunny_bag_year,2026);assert.equal(listed.data[0].gunny_bag_type,'NEW');
    assert.equal(listed.data[0].stenciling_code,code('STENCIL-'+label));
    const dropdown=await request('GET',`/cmr/submission-options?only=orders&season_id=${ids.season}&scheme_type=SCMR&destination_id=${label==='SFC'?ids.godown:ids.fci}`,undefined,{auth:millerToken});
    assert(dropdown.data.orders.some(o=>o.id===ids[label+'order']));
    assert(dropdown.data.orders.every(o=>o.destination_id===(label==='SFC'?ids.godown:ids.fci)));
    assert(!Object.hasOwn(dropdown.data,'stores'));
    const named=await request('GET',`/cmr/dropdowns/orders?season_id=${ids.season}&scheme_type=SCMR&destination_id=${label==='SFC'?ids.godown:ids.fci}`,undefined,{auth:millerToken});
    assert(named.data.orders.some(o=>o.id===ids[label+'order']));
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
  const o = await one(pool, 'SELECT committed_kg FROM cmr_orders WHERE id=?', [ids.FCIorder]);
  assert.equal(o.committed_kg, 0);
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
test('Direct CMR receipt requires operator and GPS arrival; shortage reopens balance', async () => {
  const dispatched=await request('POST', `/shipments/${ids.rice}/dispatch`, {
    dispatched_at: at(-30),
    receipt_no: 'RICE-DISPATCH',
    driver_name:'Test driver',driver_phone:'9999999999'
  }, {
    auth: transporterToken
  });
  assert.equal(dispatched.data.expected_completion_at,null);
  assert.equal(dispatched.data.trip_status,0);
  const receipt = {
    received_bags: 10, ...qty(6790)
  };
  await request('POST', `/shipments/${ids.rice}/deliver`, receipt, {
    auth: millerToken,
    status: 403
  });
  await request('POST', `/shipments/${ids.rice}/deliver`, receipt, {
    status: 409
  });
  await arriveForReceipt(ids.rice);
  await request('POST', `/shipments/${ids.rice}/deliver`, receipt);
  const overrideTrip=(await request('GET',`/shipments/${ids.rice}`)).data;
  assert.equal(overrideTrip.trip_status,2);assert(overrideTrip.trip_started_at);
  assert(new Date(overrideTrip.delivered_at)>=new Date(overrideTrip.trip_completed_at));
  const o = await one(pool, 'SELECT delivered_kg,committed_kg,status FROM cmr_orders WHERE id=?', [ids.SFCorder]);
  assert.equal(o.delivered_kg, 6790);
  assert.equal(o.committed_kg, 0);
  assert.equal(o.status, 'OPEN');
  const report = (await request('GET', `/reports/millers/${ids.miller}/reconciliation?season_id=${ids.season}`, undefined, {
    auth: millerToken
  })).data;
  assert.equal(report.totals.rice_obligation_balance_kg, 10);
  assert.equal(report.totals.rice_shortage_kg, 10);
  assert.equal(report.totals.production_variance_kg, 0);
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
        Authorization: `Bearer ${pacsToken}`,
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
  const s = await one(pool, 'SELECT on_hand_kg,reserved_kg FROM stocks WHERE facility_id=? AND season_id=?', [ids.pacs, ids.season]);
  assert.equal(s.on_hand_kg, 1000);
  assert.equal(s.reserved_kg, 0);
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
  const mismatches = await rows(pool, `SELECT s.facility_id FROM stocks s LEFT JOIN (SELECT facility_id,season_id,scheme_code,commodity_code,SUM(on_hand_delta_kg) h,SUM(reserved_delta_kg) r FROM stock_ledger GROUP BY facility_id,season_id,scheme_code,commodity_code) l ON l.facility_id=s.facility_id AND l.season_id=s.season_id AND l.commodity_code=s.commodity_code AND l.scheme_code=s.scheme_code WHERE s.season_id=? AND (s.on_hand_kg<>COALESCE(l.h,0) OR s.reserved_kg<>COALESCE(l.r,0))`, [ids.season]);
  assert.equal(mismatches.length, 0);
});

test('Scheme and commodity stay isolated from procurement through Miller milling and godown delivery',async()=>{
  const pushed=await request('POST','/integrations/euparjan/procurements',{
    records:[{...procure('CCMR-PADDY',300),scheme_code:'CCMR'}]
  },{apiKey:process.env.EUPARJAN_API_KEY});
  const procurementId=pushed.data.records[0].id;
  const stockAudit=await one(pool,'SELECT * FROM stocks WHERE facility_id=? AND season_id=? AND scheme_code=? AND commodity_code=?',[ids.pacs,ids.season,'CCMR','PADDY']);
  assert(stockAudit.id>0);
  assert.equal(stockAudit.status,1);
  assert.equal(stockAudit.created_by,null);
  assert.equal(stockAudit.created_by_actor,'integration');
  assert.equal(stockAudit.updated_by_actor,'integration');
  assert(stockAudit.created_at instanceof Date&&stockAudit.updated_at instanceof Date);
  const procurementLedger=await one(pool,"SELECT * FROM stock_ledger WHERE reference_type='PROCUREMENT' AND reference_id=?",[procurementId]);
  assert.equal(procurementLedger.scheme_code,stockAudit.scheme_code);
  assert.equal(procurementLedger.commodity_code,stockAudit.commodity_code);
  assert.equal(procurementLedger.created_by_actor,'integration');
  assert.equal(procurementLedger.updated_by,null);
  assert.equal(procurementLedger.updated_at,null);
  assert(!Object.hasOwn(procurementLedger,'commodity'));
  assert(Object.hasOwn(procurementLedger,'scheme_code'));
  const stored=await one(pool,'SELECT * FROM procurement WHERE id=?',[procurementId]);
  const schemeMaster={code:'CCMR'};
  const commodityMaster={code:'PADDY'};
  assert.equal(stored.scheme_code,schemeMaster.code);
  assert.equal(stored.commodity_code,commodityMaster.code);
  assert(Object.hasOwn(stored,'scheme_code'));
  assert(!Object.hasOwn(stored,'commodity'));
  const listed=await request('GET',`/procurements?scheme_code=${schemeMaster.code}&commodity_code=${commodityMaster.code}`);
  assert(listed.data.some(row=>row.id===procurementId&&row.scheme_code==='CCMR'&&row.commodity==='PADDY'));
  const lots=await request('GET',`/procurements/available-lots?facility_id=${ids.pacs}&season_id=${ids.season}`);
  assert(lots.data.some(row=>row.id===procurementId&&row.scheme_code===schemeMaster.code));
  const ccBody={...paddy('CCMR-TOO-MUCH',ids.vehicle1,301),scheme_code:'CCMR'};
  const denied=await request('POST','/shipments',ccBody,{auth:pacsToken,status:409});
  assert.equal(denied.error.code,'INSUFFICIENT_STOCK');
  await request('POST','/shipments',{
    ...ccBody,shipment_no:code('CROSS-SCHEME-LOT'),quantity:qty(100),
    lots:[{procurement_id:ids.procurement,quantity:qty(100)}]
  },{auth:pacsToken,status:400});
  const reservation=(await request('POST','/shipments',{
    ...ccBody,shipment_no:code('CCMR-CANCEL'),quantity:qty(200)
  },{auth:pacsToken})).data.id;
  const reservedAudit=await one(pool,'SELECT * FROM stocks WHERE id=?',[stockAudit.id]);
  assert.equal(reservedAudit.id,stockAudit.id);
  assert.equal(reservedAudit.created_by_actor,'integration');
  assert(reservedAudit.updated_by>0);
  assert.equal(reservedAudit.updated_by_actor,`user:${reservedAudit.updated_by}`);
  await request('POST',`/shipments/${reservation}/cancel`,{reason:'Verify scheme reservation release'},{auth:millerToken});
  const sourceBalance=await one(pool,"SELECT * FROM stocks WHERE facility_id=? AND season_id=? AND scheme_code='CCMR' AND commodity_code='PADDY'",[ids.pacs,ids.season]);
  assert.equal(sourceBalance.reserved_kg,0);
  await rows(pool,'UPDATE stocks SET status=0 WHERE id=?',[stockAudit.id]);
  const inactive=await request('POST','/shipments',{
    ...ccBody,shipment_no:code('INACTIVE-BALANCE'),quantity:qty(100)
  },{auth:pacsToken,status:409});
  assert.equal(inactive.error.code,'STOCK_INACTIVE');
  await rows(pool,'UPDATE stocks SET status=1 WHERE id=?',[stockAudit.id]);
  const trip=(await request('POST','/shipments',{
    ...ccBody,shipment_no:code('CCMR-PADDY-TRIP'),quantity:qty(200)
  },{auth:pacsToken})).data.id;
  const links=await rows(pool,'SELECT * FROM shipment_lots WHERE shipment_id=?',[trip]);
  assert.equal(links.length,1);
  assert.equal(links[0].procurement_id,procurementId);
  await request('POST',`/shipments/${trip}/dispatch`,{
    dispatched_at:at(-45),receipt_no:code('CCMR-PADDY-DISPATCH'),driver_name:'Test Driver',driver_phone:'9999999999'
  });
  await arriveForReceipt(trip);
  await request('POST',`/shipments/${trip}/deliver`,{received_bags:10,...qty(200)});
  await request('POST','/milling-batches',{
    miller_id:ids.miller,season_id:ids.season,scheme_code:'CCMR',batch_no:code('CCMR-MILLING'),paddy_quantity:qty(200),milled_at:at(-35)
  },{auth:millerToken});
  // An unrelated SCMR balance must not fund a CCMR reservation.
  await transaction(async c=>{
    await lockFacilities(c,[ids.miller]);
    await stock(c,ids.miller,ids.season,'RICE',1000,0,'SCHEME_TEST',ids.miller,'SCMR');
  });
  const order=(await request('POST','/integrations/euparjan/cmr-orders',{
    records:[{external_ref:code('CCMR-ORDER'),season_id:ids.season,miller_id:ids.miller,destination_id:ids.godown,
      order_no:code('CCMR-ORDER'),ordered_at:at(-34),due_date:'2099-12-31',scheme_code:'CCMR',commodity_code:'RICE',rice_quantity:qty(300)}]
  },{apiKey:process.env.EUPARJAN_API_KEY})).data.records[0].id;
  const riceBody={shipment_no:code('CCMR-RICE-OVER'),leg:'CMR',season_id:ids.season,scheme_code:'CCMR',miller_id:ids.miller,
    source_id:ids.miller,destination_id:ids.godown,vehicle_id:ids.vehicle1,order_id:order,quantity:qty(301)};
  await request('POST','/shipments',riceBody,{auth:millerToken,status:409});
  await request('POST','/shipments',{...riceBody,scheme_code:'SCMR'},{auth:millerToken,status:400});
  const riceTrip=(await request('POST','/shipments',{
    ...riceBody,shipment_no:code('CCMR-RICE-TRIP'),quantity:qty(136)
  },{auth:millerToken})).data.id;
  await request('POST',`/shipments/${riceTrip}/dispatch`,{
    dispatched_at:at(-30),receipt_no:code('CCMR-RICE-DISPATCH'),driver_name:'Test Driver',driver_phone:'9999999999'
  });
  await arriveForReceipt(riceTrip);
  await request('POST',`/shipments/${riceTrip}/deliver`,{received_bags:10,...qty(136)});
  const godown=await one(pool,"SELECT COUNT(*) entries FROM stock_ledger WHERE facility_id=? AND season_id=? AND scheme_code='CCMR' AND reference_type='DELIVERY'",[ids.godown,ids.season]);
  assert.equal(godown.entries,0);
  const riceBalance=await one(pool,"SELECT on_hand_kg,reserved_kg FROM stocks WHERE facility_id=? AND season_id=? AND scheme_code='CCMR' AND commodity_code='RICE'",[ids.miller,ids.season]);
  assert.equal(riceBalance.on_hand_kg,164);assert.equal(riceBalance.reserved_kg,0);
  const ledger=await rows(pool,'SELECT DISTINCT l.scheme_code FROM stock_ledger l WHERE reference_type IN (\'RESERVE\',\'DISPATCH\',\'DELIVERY\') AND reference_id=?',[riceTrip]);
  assert.deepEqual(ledger.map(row=>row.scheme_code),['CCMR']);
  const invalid=await request('POST','/integrations/euparjan/procurements',{
    records:[{...procure('BAD-COMMODITY'),commodity_code:'RICE'}]
  },{apiKey:process.env.EUPARJAN_API_KEY,status:400});
  assert.equal(invalid.ok,false);
  const unknown=await request('POST','/integrations/euparjan/procurements',{
    records:[{...procure('UNKNOWN-SCHEME'),scheme_code:'UNKNOWN'}]
  },{apiKey:process.env.EUPARJAN_API_KEY,status:201});
  assert.equal(unknown.ok,true); // Scheme codes are direct labels since migration 071.
  const missingSource=await request('POST','/integrations/euparjan/procurements',{
    records:[{...procure('MISSING-SOURCE'),facility_code:code('MISSING-LAMPS')}]
  },{apiKey:process.env.EUPARJAN_API_KEY,status:201});
  assert(missingSource.data.records[0].id);
  const mismatches=await rows(pool,`SELECT s.facility_id FROM stocks s LEFT JOIN (
    SELECT facility_id,season_id,scheme_code,commodity_code,SUM(on_hand_delta_kg) h,SUM(reserved_delta_kg) r
    FROM stock_ledger GROUP BY facility_id,season_id,scheme_code,commodity_code
    ) l ON l.facility_id=s.facility_id AND l.season_id=s.season_id AND l.scheme_code=s.scheme_code AND l.commodity_code=s.commodity_code
    WHERE s.season_id=? AND (s.on_hand_kg<>COALESCE(l.h,0) OR s.reserved_kg<>COALESCE(l.r,0))`,[ids.season]);
  assert.equal(mismatches.length,0);
});

test('Procurement corrections update reference/quantity once, preserve retries and protect used stock',async()=>{
  const original=procure('CORRECTION',100);
  const apiKey=process.env.EUPARJAN_API_KEY;
  const procurementId=(await request('POST','/integrations/euparjan/procurements',{records:[original]},{apiKey})).data.records[0].id;
  const path=`/integrations/euparjan/procurements/${procurementId}`;
  const balance=()=>one(pool,'SELECT * FROM stocks WHERE facility_id=? AND season_id=? AND scheme_code=? AND commodity_code=?',[ids.pacs,ids.season,'SCMR','PADDY']);
  const start=await balance();
  const newRef=code('CORRECTED-REFERENCE'),idem=key();
  const patch={external_ref:newRef,quantity:qty(200),reason:'Correct source purchase reference and weight'};
  const first=await request('PATCH',path,patch,{apiKey,idem});
  const replay=await request('PATCH',path,patch,{apiKey,idem});
  assert.equal(first.data.id,procurementId);assert.equal(replay.replayed,true);
  assert.equal(first.data.quantity_kg,200);assert.equal((await balance()).on_hand_kg,start.on_hand_kg+100);
  for(const record of [original,{...original,external_ref:newRef,quantity:qty(200)}]){
    const retried=await request('POST','/integrations/euparjan/procurements',{records:[record]},{apiKey});
    assert.equal(retried.data.records[0].id,procurementId);assert.equal(retried.data.records[0].duplicate,true);
  }
  assert.equal((await balance()).on_hand_kg,start.on_hand_kg+100);
  const found=await request('GET',`/procurements?external_ref=${encodeURIComponent(original.external_ref)}`);
  assert.equal(found.data.length,1);assert.equal(found.data[0].external_ref,newRef);
  const otherRef=code('OTHER-PURCHASE');
  await request('POST','/integrations/euparjan/procurements',{records:[{...procure('OTHER-PURCHASE',5)}]},{apiKey});
  const collision=await request('PATCH',path,{external_ref:otherRef,reason:'Attempt duplicate reference'},{apiKey,status:409});
  assert.equal(collision.error.code,'EXTERNAL_REF_CONFLICT');
  await request('PATCH',`/procurements/${procurementId}`,{quantity:qty(150),reason:'Unauthorized Miller correction'},{auth:millerToken,status:403});
  const trip=(await request('POST','/shipments',{
    ...paddy('CORRECTION-RESERVATION',ids.vehicle1,60),lots:[{procurement_id:procurementId,quantity:qty(60)}]
  },{auth:pacsToken})).data.id;
  const reserved=await request('PATCH',path,{quantity:qty(50),reason:'Below reservation'},{apiKey,status:409});
  assert.equal(reserved.error.code,'PROCUREMENT_QUANTITY_IN_USE');assert.match(reserved.error.message,/60 kg/);
  await request('PATCH',`/procurements/${procurementId}`,{quantity:qty(180),reason:'Correct remaining purchase weight'});
  await request('POST',`/shipments/${trip}/dispatch`,{dispatched_at:at(-45),receipt_no:code('CORRECTION-DISPATCH'),driver_name:'Test Driver',driver_phone:'9999999999'});
  const used=await request('PATCH',path,{quantity:qty(50),reason:'Below dispatched weight'},{apiKey,status:409});
  assert.equal(used.error.code,'PROCUREMENT_QUANTITY_IN_USE');
  await request('PATCH',path,{quantity:qty(80),reason:'Final corrected purchase weight'},{apiKey});
  const beforeFailure=await balance();
  const failedRef=code('CAPACITY-ROLLBACK');
  await request('PATCH',path,{external_ref:failedRef,quantity:qty(2000,'MT'),reason:'Exceeds facility capacity'},{apiKey,status:409});
  assert.equal((await balance()).on_hand_kg,beforeFailure.on_hand_kg);
  assert.equal((await one(pool,'SELECT COUNT(*) n FROM procurement WHERE external_ref=?',[failedRef])).n,0);
  assert.equal((await one(pool,'SELECT COUNT(*) n FROM procurement_corrections WHERE new_external_ref=?',[failedRef])).n,0);
  const record=await one(pool,'SELECT * FROM procurement WHERE id=?',[procurementId]);
  assert.equal(record.external_ref,newRef);assert.equal(record.quantity_kg,80);assert.equal(record.available_kg,20);assert.equal(record.reserved_kg,0);
  const beforeRename=await one(pool,"SELECT COUNT(*) n FROM stock_ledger WHERE reference_type='PROCUREMENT_CORRECTION'");
  const refOnly=code('REFERENCE-ONLY');
  await request('PATCH',path,{external_ref:refOnly,reason:'Correct reference only'},{apiKey});
  const noOp=await request('PATCH',path,{external_ref:refOnly,quantity:qty(80),reason:'Same correction again'},{apiKey});
  assert.equal(noOp.data.updated,false);
  assert.equal((await one(pool,"SELECT COUNT(*) n FROM stock_ledger WHERE reference_type='PROCUREMENT_CORRECTION'")).n,beforeRename.n);
  const history=await rows(pool,'SELECT * FROM procurement_corrections WHERE procurement_id=? ORDER BY id',[procurementId]);
  assert.equal(history.length,4);assert.equal(history[0].created_by_actor,'integration');assert.equal(history[0].old_quantity_kg,100);assert.equal(history[0].new_quantity_kg,200);
  assert.equal(history[1].created_by_actor,`user:${history[1].created_by}`);
  await arriveForReceipt(trip);
  await request('POST',`/shipments/${trip}/deliver`,{received_bags:10,...qty(60)});
  const mismatch=await rows(pool,`SELECT s.id FROM stocks s LEFT JOIN (
    SELECT facility_id,season_id,scheme_code,commodity_code,SUM(on_hand_delta_kg) h,SUM(reserved_delta_kg) r
    FROM stock_ledger GROUP BY facility_id,season_id,scheme_code,commodity_code
    ) l ON l.facility_id=s.facility_id AND l.season_id=s.season_id AND l.scheme_code=s.scheme_code AND l.commodity_code=s.commodity_code
    WHERE s.season_id=? AND (s.on_hand_kg<>COALESCE(l.h,0) OR s.reserved_kg<>COALESCE(l.r,0))`,[ids.season]);
  assert.equal(mismatch.length,0);
});

test('RO allotment isolates Miller lifting, blocks reassignment in use and allows audited legacy correction',async()=>{
  const apiKey=process.env.EUPARJAN_API_KEY;
  const record={...procure('ALLOTTED-OTHER',10),miller_id:ids.other};
  const invalid=await request('POST','/integrations/euparjan/procurements',{
    records:[{...record,external_ref:code('NOT-A-MILLER'),miller_id:ids.pacs,facility_code:code('UNLINKED-PACS')}]
  },{apiKey,status:201});
  assert(invalid.data.records[0].id);
  await request('POST','/route-tags',{season_id:ids.season,source_id:ids.pacs,destination_id:ids.other});
  const imported=await request('POST','/integrations/euparjan/procurements',{records:[record]},{apiKey});
  const procurementId=imported.data.records[0].id;
  const patchPath=`/integrations/euparjan/procurements/${procurementId}`;
  const before=await one(pool,"SELECT reserved_kg FROM stocks WHERE facility_id=? AND season_id=? AND scheme_code='SCMR' AND commodity_code='PADDY'",[ids.pacs,ids.season]);
  const wrong=await request('POST','/shipments',{
    ...paddy('WRONG-RO-MILLER',ids.vehicle1,1),lots:[{procurement_id:procurementId,quantity:qty(1)}]
  },{status:409});
  assert.equal(wrong.error.code,'PROCUREMENT_MILLER_MISMATCH');
  const after=await one(pool,"SELECT reserved_kg FROM stocks WHERE facility_id=? AND season_id=? AND scheme_code='SCMR' AND commodity_code='PADDY'",[ids.pacs,ids.season]);
  assert.equal(after.reserved_kg,before.reserved_kg);
  const dropdown=await request('GET',`/procurements/available-lots?facility_id=${ids.pacs}&season_id=${ids.season}`,undefined,{auth:otherToken});
  assert(dropdown.data.length>0&&dropdown.data.every(row=>row.miller_id===ids.other));
  const mapped=await request('GET',`/paddy/mapped-sources?season_id=${ids.season}`,undefined,{auth:otherToken});
  assert.equal(mapped.data.find(row=>row.source_id===ids.pacs&&row.scheme_code==='SCMR').available_kg,10);
  const allocated=await request('POST','/shipments',{
    ...paddy('CORRECT-RO-MILLER',ids.vehicle1,1),miller_id:ids.other,destination_id:ids.other
  });
  const detail=await request('GET',`/shipments/${allocated.data.id}`);
  assert.deepEqual(detail.data.lots.map(l=>l.procurement_id),[procurementId]);
  const inUse=await request('PATCH',patchPath,{miller_id:ids.miller,reason:'Verified operator allocation correction'},{apiKey,status:409});
  assert.equal(inUse.error.code,'PROCUREMENT_MILLER_IN_USE');
  await request('POST',`/shipments/${allocated.data.id}/cancel`,{reason:'Cancel test reservation before reassignment'});
  const reassigned=await request('PATCH',patchPath,{miller_id:ids.miller,reason:'Verified operator allocation correction'},{apiKey});
  assert.equal(reassigned.data.miller_id,ids.miller);
  await request('POST','/integrations/euparjan/procurements',{records:[record]},{apiKey,status:409});
  const audit=await one(pool,'SELECT old_miller_id,new_miller_id FROM procurement_corrections WHERE procurement_id=? ORDER BY id DESC LIMIT 1',[procurementId]);
  assert.equal(audit.old_miller_id,ids.other);assert.equal(audit.new_miller_id,ids.miller);
  // Simulate unresolved legacy metadata without inventing an allocation.
  await rows(pool,'UPDATE procurement SET miller_id=NULL WHERE id=?',[procurementId]);
  const missing=await request('POST','/shipments',{
    ...paddy('UNASSIGNED-RO',ids.vehicle1,1),lots:[{procurement_id:procurementId,quantity:qty(1)}]
  },{status:409});
  assert.equal(missing.error.code,'PROCUREMENT_MILLER_REQUIRED');
  await request('PATCH',patchPath,{miller_id:ids.miller,reason:'Resolve verified legacy RO miller'},{apiKey});
});

test('CMR submission stores master IDs and preserves date, lots, driver and vehicle history through receiving',async()=>{
  const previousOrder=await one(pool,'SELECT rice_quantity_kg FROM cmr_orders WHERE id=?',[ids.SFCorder]);
  await request('PATCH',`/cmr-orders/${ids.SFCorder}`,{rice_quantity:qty(previousOrder.rice_quantity_kg+1),reason:'Add one KG for next shipment; shortage must not release dispatched stock'});
  const storeId=await insert(pool,'tbl_store_location_master',{store_type:2,store_id:code('GODOWN'),store_name:'Test submission store',district_id:ids.district,status:1});
  await request('PATCH',`/facilities/${ids.godown}`,{core_store_id:storeId});
  const submittedOn=new Date().toISOString().slice(0,10);
  const response=await request('POST','/cmr/submissions',{
    season_id:ids.season,order_id:ids.SFCorder,destination_id:ids.godown,district_id:ids.district,
    vehicle_id:ids.vehicle1,quantity:qty(1),total_bags:2,driver_name:'CMR Test Driver',driver_phone:'9999999999'
  },{auth:millerToken,idem:null});
  const shipmentId=response.data.id;
  const shipment=(await request('GET',`/shipments/${shipmentId}`,undefined,{auth:millerToken})).data;
  assert.equal(shipment.scheme_code,'SCMR');assert.equal(shipment.commodity_code,'RICE');
  assert.equal(shipment.scheme_code,response.data.scheme_code);assert.equal(shipment.commodity_code,response.data.commodity_code);
  const selectedOrder=await one(pool,'SELECT lot_count FROM cmr_orders WHERE id=?',[ids.SFCorder]);
  assert.equal(shipment.cmr_lot_count,selectedOrder.lot_count);assert.equal(shipment.submitted_on.slice(0,10),new Date(Date.now()+19800000).toISOString().slice(0,10));
  assert.equal(shipment.gunny_bag_year,2026);assert.equal(shipment.gunny_bag_type,'NEW');
  assert.equal(shipment.driver_name,'CMR Test Driver');assert.equal(shipment.vehicle_type_id,ids.vehicleType);
  assert.equal(shipment.expected_completion_at,null);assert.equal(shipment.trip_status,0);
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
    stacks:[{stack_no:code('ID-STACK'),received_quantity_kg: '1.000',bags:2}],gross_weight_kg:'2.160',empty_bag_weight_kg:'0.580',
    red_grains_percent:0,chalky_grains_percent:0,moisture_percent:12,broken_rice_percent:1,
    other_standards:'Test receipt',compliance_confirmed:true,remarks:'',gps_override_reason:'Integration test arrival override'
  }),context));
  assert.equal(accepted.net_kg,1);
  const received=await receiving.listStock(context);
  assert(received.body.data.some(row=>row.shipment_no===shipment.shipment_no&&row.scheme_code==='SCMR'));
  const stored=await one(pool,'SELECT accepted_kg,received_bags,total_bags FROM shipments WHERE id=?',[shipmentId]);
  assert.equal(stored.accepted_kg,1);
  assert.equal(stored.received_bags,2);
});

test('fractional kg RO, lifting and receiving preserve one-gram shortage and independent bags',async()=>{
  const record={...procure('FRACTIONAL-KG'),quantity:{value:'426.47'},ro_no:code('RO-KG'),ro_date:'2026-02-26'};
  const wrongDistrict=await request('POST','/integrations/euparjan/procurements',{
    records:[{...record,external_ref:code('WRONG-DISTRICT'),ro_no:code('RO-UNLINKED-DISTRICT'),facility_code:code('UNLINKED-DISTRICT-PACS'),district_id:ids.district+1}]
  },{apiKey:process.env.EUPARJAN_API_KEY,status:201});
  assert(wrongDistrict.data.records[0].id);
  const ro=await request('POST','/integrations/euparjan/procurements',{
    records:[record]
  },{apiKey:process.env.EUPARJAN_API_KEY});
  assert.equal(ro.data.records[0].quantity_kg,426.47);
  const listed=await request('GET','/procurements?district_id='+ids.district+'&ro_no='+encodeURIComponent(record.ro_no));
  assert.equal(listed.data.length,1);
  assert.equal(listed.data[0].ro_no,record.ro_no);
  assert.equal(listed.data[0].ro_date,'2026-02-26');
  assert(!Object.hasOwn(listed.data[0],'receipt_no'));
  assert.equal(listed.data[0].district_id,ids.district);
  const duplicate=await request('POST','/integrations/euparjan/procurements',{
    records:[{...record,district_id:ids.district}]
  },{apiKey:process.env.EUPARJAN_API_KEY});
  assert.equal(duplicate.data.records[0].duplicate,true);
  await request('POST','/integrations/euparjan/procurements',{
    records:[{...record,ro_date:'2026-02-25'}]
  },{apiKey:process.env.EUPARJAN_API_KEY,status:409});
  const created=await request('POST','/shipments',{
    ...paddy('FRACTIONAL-KG',ids.vehicle1),quantity:{value:'0.300'},
    lots:[{procurement_id:ro.data.records[0].id,quantity:{value:'0.300'}}]
  });
  const shipmentId=created.data.id;
  const details=await request('GET',`/shipments/${shipmentId}`);
  assert.equal(details.data.lots[0].ro_no,record.ro_no);
  assert.equal(details.data.lots[0].ro_date,'2026-02-26');
  await request('POST',`/shipments/${shipmentId}/dispatch`,{
    dispatched_at:at(-5),receipt_no:code('FRACTIONAL-DISPATCH')
  });
  await arriveForReceipt(shipmentId);
  const receipt={value:'0.299',unit:'KG'};
  await request('POST',`/shipments/${shipmentId}/deliver`,{...receipt,received_bags:0},{status:400});
  const idem=key(),beforeReceipt=Date.now();
  const result=await request('POST',`/shipments/${shipmentId}/deliver`,{...receipt,received_bags:1},{idem});
  const replay=await request('POST',`/shipments/${shipmentId}/deliver`,{...receipt,received_bags:1},{idem});
  assert.equal(replay.replayed,true);assert.equal(replay.data.delivered_at,result.data.delivered_at);
  assert(new Date(result.data.delivered_at).getTime()>=beforeReceipt-1000);
  assert(new Date(result.data.delivered_at).getTime()<=Date.now());
  assert.equal(result.data.accepted_kg,0.299);
  assert.equal(result.data.shortage_kg,0.001);
  assert.equal(result.data.received_bags,1);
  const shipment=await one(pool,'SELECT quantity_kg,accepted_kg,shortage_kg,received_bags,total_bags FROM shipments WHERE id=?',[shipmentId]);
  assert.equal(shipment.quantity_kg,0.3);
  assert.equal(shipment.accepted_kg,0.299);
  assert.equal(shipment.shortage_kg,0.001);
  assert.equal(shipment.received_bags,1);
  assert.equal(shipment.total_bags,null);
  const mismatch=await rows(pool,`SELECT s.id FROM stocks s LEFT JOIN
    (SELECT facility_id,season_id,scheme_code,commodity_code,SUM(on_hand_delta_kg) h,SUM(reserved_delta_kg) r
     FROM stock_ledger GROUP BY facility_id,season_id,scheme_code,commodity_code) l
    ON l.facility_id=s.facility_id AND l.season_id=s.season_id AND l.scheme_code=s.scheme_code AND l.commodity_code=s.commodity_code
    WHERE s.season_id=? AND (s.on_hand_kg<>COALESCE(l.h,0) OR s.reserved_kg<>COALESCE(l.r,0))`,[ids.season]);
  assert.equal(mismatch.length,0);
});

test('Push both mapping types and ten-record procurement/CMR batches using only API key',async()=>{
  const options={auth:null,apiKey:process.env.EUPARJAN_API_KEY};
  const season=(await request('POST','/integrations/euparjan/masters/seasons',{
    code:code('PUSH-MAPPINGS'),name:'Push mappings',start_date:'2026-01-01',end_date:'2099-12-31',recovery_percent:68
  },options)).data;
  const tag=await request('POST','/integrations/euparjan/masters/route-tags',{
    season_id:season.id,source_id:ids.pacs,destination_id:ids.miller
  },options);
  assert(tag.data.id);
  const mapping=await request('POST','/integrations/euparjan/miller-store-assignments',{
    season_id:season.id,miller_id:ids.miller,store_id:ids.godown
  },options);
  assert.equal(mapping.data.store_id,ids.godown);
  assert.equal(mapping.data.created_by,null);
  const procurementRecords=ensureTenRecords([{...procure('PUSH-TEN',1),ro_no:code('RO-PUSH-TEN')}],'procurement');
  const purchases=await request('POST','/integrations/euparjan/procurements',{records:procurementRecords},options);
  assert.equal(new Set(purchases.data.records.map(r=>r.id)).size,10);
  const records=ensureTenRecords([{
    external_ref:code('CMR-PUSH-TEN'),season_id:ids.season,miller_id:ids.miller,
    destination_id:ids.godown,order_no:code('ORDER-PUSH-TEN'),ordered_at:at(-30),
    due_date:'2099-12-31',scheme_code:'SCMR',commodity_code:'RICE',rice_quantity:qty(1)
  }],'cmr');
  const idem=key();
  const orders=await request('POST','/integrations/euparjan/cmr-orders',{records},{...options,idem});
  assert.equal(new Set(orders.data.records.map(r=>r.id)).size,10);
  const retry=await request('POST','/integrations/euparjan/cmr-orders',{records},{...options,idem,status:200});
  assert.equal(retry.replayed,true);
});


test('Push APIs insert directly into original tables without linked master records',async()=>{
  const options={auth:null,apiKey:process.env.EUPARJAN_API_KEY};
  const refs={season_code:code('NO-SEASON'),facility_code:code('NO-PACS'),farmer_code:code('NO-FARMER')};
  const record={...procure('UNLINKED-PROC',5),...refs,miller_id:4000000000,district_id:999999,ro_no:code('UNLINKED-RO')};
  const result=await request('POST','/integrations/euparjan/procurements',{records:[record]},options);
  const stored=await one(pool,'SELECT * FROM procurement WHERE id=?',[result.data.records[0].id]);
  assert.equal(stored.season_id,null);assert.equal(stored.facility_id,null);assert.equal(stored.farmer_id,null);
  assert.equal(stored.miller_id,4000000000);assert.equal(stored.season_code,refs.season_code);
  assert.equal(stored.facility_code,refs.facility_code);assert.equal(stored.farmer_code,refs.farmer_code);
  assert.equal(Number(stored.quantity_kg),5);
  await request('POST','/integrations/euparjan/procurements',{records:[{...record,external_ref:code('UNLINKED-DUPLICATE-RO')}]},{...options,status:409});
  const repeat=await request('POST','/integrations/euparjan/procurements',{records:[record]},options);
  assert.equal(repeat.data.records[0].id,stored.id);assert.equal(repeat.data.records[0].duplicate,true);
  const order={external_ref:code('UNLINKED-CMR'),season_id:4000000000,miller_id:4000000001,
    destination_id:4000000002,scheme_code:'SCMR',commodity_code:'RICE',order_no:code('UNLINKED-ORDER'),
    ordered_at:at(-15),due_date:'2099-12-31',rice_quantity:qty(5)};
  const imported=await request('POST','/integrations/euparjan/cmr-orders',{records:[order]},options);
  const cmr=await one(pool,'SELECT * FROM cmr_orders WHERE id=?',[imported.data.records[0].id]);
  assert.equal(cmr.season_id,order.season_id);assert.equal(cmr.miller_id,order.miller_id);assert.equal(cmr.destination_id,order.destination_id);
  for(const field of ['season_code','miller_code','destination_code'])assert(!Object.hasOwn(cmr,field));
  await request('POST','/integrations/euparjan/cmr-orders',{records:[{...order,external_ref:code('UNLINKED-DUPLICATE-ORDER')}]},{...options,status:409});
  for(const [path,table,body] of [
    ['masters/route-tags','route_tags',{season_id:4000000000,source_id:4000000001,destination_id:4000000002}],
    ['miller-store-assignments','miller_store_assignments',{season_id:4000000000,miller_id:4000000002,store_id:4000000003}]
  ]){
    const saved=await request('POST','/integrations/euparjan/'+path,body,options);
    const row=await one(pool,'SELECT * FROM '+table+' WHERE id=?',[saved.data.id]);
    assert.equal(row.season_id,body.season_id);
    await request('POST','/integrations/euparjan/'+path,body,{...options,status:409});
  }
  const list=await request('GET','/procurements?ro_no='+encodeURIComponent(record.ro_no));
  assert(list.data.some(row=>row.id===stored.id));
  const constraints=await rows(pool,`SELECT TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('procurement','cmr_orders','route_tags','miller_store_assignments')
    AND REFERENCED_TABLE_NAME IN ('seasons','facilities','farmers')`);
  assert.equal(constraints.length,0);
});

test('Driver Paddy summary counts assigned trips, excludes CMR/cancelled, and cannot read another driver',async()=>{
  const driverId=await insert(pool,'users',{name:'Summary driver',email:code('summary-driver')+'@test.invalid',phone:'9111111101',role:'DRIVER',active:1,password_hash:await passwordHash(pass),facility_id:ids.pacs});
  const otherDriverId=await insert(pool,'users',{name:'Other summary driver',email:code('other-summary-driver')+'@test.invalid',phone:'9111111102',role:'DRIVER',active:1,password_hash:await passwordHash(pass),facility_id:ids.pacs});
  const driverLogin=await request('POST','/auth/login',{phone:'9111111101',password:pass},{auth:null});
  const auth=driverLogin.data.token;
  assert.deepEqual((await request('POST','/tripsummary_for_driver',{}, {auth})).data,{total_trips:0,active_trips:0,completed_trips:0});
  const vehicle=(await request('POST','/vehicles',{transporter_name:'Summary transporter',transporter_contact_no:'9111111101',district_id:ids.district,vehicle_type_id:ids.vehicleType,registration_no:'SUM'+suffix.toUpperCase(),capacity:qty(20,'MT')})).data.id;
  const examples=await rows(pool,"SELECT id,leg FROM shipments WHERE status IN ('DELIVERED','CANCELLED') ORDER BY id");
  const paddyRows=examples.filter(row=>row.leg==='PADDY').slice(0,5);
  const cmrRow=examples.find(row=>row.leg==='CMR');
  assert.equal(paddyRows.length,5);assert(cmrRow);
  const assignments=[
    [paddyRows[0].id,driverId,1,'IN_TRANSIT'],[paddyRows[1].id,driverId,2,'DELIVERED'],
    [paddyRows[2].id,driverId,2,'DELIVERED'],[paddyRows[3].id,driverId,1,'CANCELLED'],
    [paddyRows[4].id,otherDriverId,2,'DELIVERED'],[cmrRow.id,driverId,2,'DELIVERED']
  ];
  for(const [shipmentId,userId,tripStatus,status] of assignments)
    await rows(pool,'UPDATE shipments SET driver_user_id=?,trip_status=?,status=?,vehicle_id=IF(?=1 AND ?=\'IN_TRANSIT\',?,vehicle_id) WHERE id=?',[userId,tripStatus,status,tripStatus,status,vehicle,shipmentId]);
  const result=await request('POST','/tripsummary_for_driver',{}, {auth});
  assert.deepEqual(result.data,{total_trips:3,active_trips:1,completed_trips:2});
  assert.deepEqual((await request('POST','/tripsummary_for_driver',{driver_id:driverId},{auth})).data,result.data);
  await request('POST','/tripsummary_for_driver',{driver_id:otherDriverId},{auth,status:403});
  await request('POST','/tripsummary_for_driver',{}, {auth:null,status:401});
  await request('POST','/tripsummary_for_driver',{}, {status:403});
  const active=await request('GET','/shipments?leg=PADDY&trip_status=1&exclude_cancelled=true',undefined,{auth});
  assert.equal(active.data.length,1);assert.equal(active.data[0].id,paddyRows[0].id);
  await request('GET','/shipments/'+paddyRows[4].id,undefined,{auth,status:404});
});

test('Driver profile, active trip, history and persistent alerts enforce the Paddy session scope',async()=>{
  const driver=await one(pool,'SELECT id FROM users WHERE phone=?',['9111111101']);
  const other=await one(pool,'SELECT id FROM users WHERE phone=?',['9111111102']);
  const auth=(await request('POST','/auth/login',{phone:'9111111101',password:pass},{auth:null})).data.token;
  const options={auth};
  const profile=await request('POST','/driver_detailsList',{},options);
  assert.equal(profile.data.driver_id,driver.id);assert.equal(profile.data.contact,'9111111101');
  assert.equal(profile.data.total_trips,3);assert.equal(profile.data.dl_no,null);
  assert(!Object.hasOwn(profile.data,'password'));assert(!Object.hasOwn(profile.data,'password_hash'));
  const active=await request('POST','/active_tripList',{},options);
  assert.equal(active.data.driver_id,driver.id);assert.equal(active.data.trip_status,1);
  assert.equal(active.data.quantity_unit,'KG');assert(!Object.hasOwn(active.data,'subtrips'));
  const history=await request('POST','/getTripDetailsForDriver',{page:1,limit:1},options);
  assert.equal(history.count,1);assert.equal(history.pagination.total,3);
  const detail=await request('POST','/getTripDetailsForDriver',{trip_id:active.data.id},options);
  assert.equal(detail.data[0].trip_id,active.data.id);assert(!Object.hasOwn(detail.data[0],'subtrips'));
  const otherTrip=await one(pool,'SELECT id FROM shipments WHERE driver_user_id=? LIMIT 1',[other.id]);
  await request('POST','/getTripDetailsForDriver',{trip_id:otherTrip.id},{auth,status:404});
  const empty=await request('POST','/getTripDetailsForDriver',{from_date:'2099-01-01'},options);
  assert.equal(empty.count,0);
  await request('POST','/getTripDetailsForDriver',{from_date:'2026-11-05',to_date:'2026-11-01'},{auth,status:400});
  const old=new Date(Date.now()-3*3600000),eta=new Date(Date.now()-2*3600000);
  await rows(pool,'UPDATE shipments SET trip_started_at=?,last_gps_at=?,expected_completion_at=? WHERE id=?',[old,old,eta,active.data.id]);
  const alerts=await request('POST','/alert_report_for_driver',{page:1,limit:20},options);
  assert.equal(alerts.count,2);
  assert.deepEqual(alerts.data.map(row=>row.alert_name).sort(),['ETA Delayed','GPS Offline']);
  for(const row of alerts.data){assert.equal(row.driver_id,driver.id);assert.equal(row.trip_id,active.data.id);assert(row.alert_message);}
  const again=await request('POST','/alert_report_for_driver',{},options);
  assert.equal(again.count,2);
  const otherAuth=(await request('POST','/auth/login',{phone:'9111111102',password:pass},{auth:null})).data.token;
  assert.equal((await request('POST','/alert_report_for_driver',{}, {auth:otherAuth})).count,0);
  await rows(pool,"UPDATE shipments SET status='ARRIVED',trip_status=2 WHERE id=?",[active.data.id]);
  assert.equal((await request('POST','/active_tripList',{},options)).data,null);
  assert.equal((await request('POST','/alert_report_for_driver',{},options)).count,2);
  const now=new Date();
  await rows(pool,"UPDATE shipments SET status='IN_TRANSIT',trip_status=1,last_gps_at=?,expected_completion_at=? WHERE id=?",[now,new Date(Date.now()+3600000),active.data.id]);
  assert.equal((await request('POST','/alert_report_for_driver',{},options)).count,2);
  await rows(pool,'UPDATE shipments SET last_gps_at=? WHERE id=?',[new Date(Date.now()-20*60000),active.data.id]);
  assert.equal((await request('POST','/alert_report_for_driver',{},options)).count,3);
  for(const endpoint of ['/driver_detailsList','/active_tripList','/getTripDetailsForDriver','/alert_report_for_driver']){
    await request('POST',endpoint,{driver_id:other.id},{auth,status:403});
    await request('POST',endpoint,{}, {auth:null,status:401});
    await request('POST',endpoint,{}, {status:403});
  }
});

test('CMR order stock posts IN once, applies only correction differences and reverses cancellation in the ledger',async()=>{
  const scheme=code('ORDER-STOCK');
  const body={records:[{external_ref:code('ORDER-STOCK'),order_no:code('ORDER-STOCK'),season_id:ids.season,miller_id:ids.miller,destination_id:ids.godown,
    scheme_code:scheme,commodity_code:'RICE',ordered_at:at(-5),due_date:'2099-12-31',rice_quantity:qty(50)}]};
  const first=await request('POST','/integrations/euparjan/cmr-orders',body,{apiKey:process.env.EUPARJAN_API_KEY});
  const order=first.data.records[0].id;
  const balance=()=>one(pool,'SELECT on_hand_kg,reserved_kg FROM stocks WHERE facility_id=? AND season_id=? AND scheme_code=? AND commodity_code=?',[ids.miller,ids.season,scheme,'RICE']);
  assert.equal((await balance()).on_hand_kg,50);
  const duplicate=await request('POST','/integrations/euparjan/cmr-orders',body,{apiKey:process.env.EUPARJAN_API_KEY});
  assert.equal(duplicate.data.records[0].duplicate,true);assert.equal((await balance()).on_hand_kg,50);
  await request('PATCH','/cmr-orders/'+order,{rice_quantity:qty(60),reason:'Increase source order quantity by ten KG'});
  await request('PATCH','/cmr-orders/'+order,{rice_quantity:qty(60),reason:'Retry same corrected source order quantity'});
  assert.equal((await balance()).on_hand_kg,60);
  await request('PATCH','/cmr-orders/'+order,{rice_quantity:qty(40),reason:'Reduce source order quantity by twenty KG'});
  assert.equal((await balance()).on_hand_kg,40);
  await request('POST','/cmr-orders/'+order+'/cancel',{reason:'Cancel unused source order and reverse its credit'});
  await request('POST','/cmr-orders/'+order+'/cancel',{reason:'Repeat cancellation without a second stock reversal'});
  assert.equal((await balance()).on_hand_kg,0);
  const ledger=await request('GET','/reports/ledger?scheme_code='+encodeURIComponent(scheme),undefined,{auth:millerToken});
  assert.equal(ledger.data.length,4);
  assert.deepEqual(ledger.data.map(r=>r.on_hand_delta_kg),[-40,-20,10,50]);
  assert.deepEqual(ledger.data.map(r=>r.balance_kg),[0,40,60,50]);
  assert(ledger.data.every(r=>r.reference_no===code('ORDER-STOCK')));
  const stockRow=await one(pool,'SELECT id FROM stocks WHERE facility_id=? AND season_id=? AND scheme_code=? AND commodity_code=?',[ids.miller,ids.season,scheme,'RICE']);
  assert(ledger.data.every(r=>Number(r.stock_id)===Number(stockRow.id)));
  const unused=await one(pool,'SELECT COALESCE(MAX(id),0)+1 id FROM stocks');
  await assert.rejects(transaction(c=>rows(c,'INSERT INTO stock_ledger(stock_id,facility_id,season_id,scheme_code,commodity_code,on_hand_delta_kg,reserved_delta_kg,reference_type,reference_id) VALUES (?,?,?,?,?,0,0,?,?)',[unused.id,ids.miller,ids.season,scheme,'RICE','INVALID_LINK_TEST',order])),error=>error.code==='ER_NO_REFERENCED_ROW_2');

  const report=await request('GET','/reports/stocks?scheme_code='+encodeURIComponent(scheme),undefined,{auth:millerToken});
  assert.equal(report.data[0].total_in_kg,60);assert.equal(report.data[0].total_out_kg,60);
});
