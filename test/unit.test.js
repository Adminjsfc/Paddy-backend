import {requireStockMasters} from '../src/repositories/stock-masters.repository.js';
import {removeSchemeCommodityMasters} from '../scripts/remove-scheme-commodity-masters.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { grams, recoveryGrams, hash, distanceMeters, gpsTransition, passwordHash, verifyPassword, millerAccess, vehicleAccess } from "../src/utils/core.js";
import * as S from "../src/validators/schemas.js";
import { normalizeMqtt } from "../src/services/gps.service.js";
import { millerRegistrationSchema } from "../src/validators/millers.schema.js";
import { registerMiller } from "../src/services/millers.service.js";
import { createUser } from '../src/services/auth.service.js';
import { ensureUniqueUserPhone } from '../src/services/user-phone.service.js';
import { errorHandler } from '../src/middlewares/errors.js';
import {capacityFields,capacityGrams} from '../src/utils/core.js';
import {stock} from '../src/services/stock.service.js';
import { visibility } from '../src/services/masters.service.js';
import { secondPrecision, dateJsonReplacer, secondsJsonReplacer } from '../src/utils/datetime.js';
import { respond, respondReport } from '../src/utils/http.js';
import { timestamp } from '../src/utils/core.js';
import { rows } from '../src/repositories/database.js';
import { profilePatches,configs } from '../src/config/masters.js';
import {createMaster,visibility as masterVisibility} from '../src/services/masters.service.js';
import {requireVehicleTrackingAccess} from '../src/repositories/gps.repository.js';
import {pool} from '../src/config/database.js';

test('All operational roles register independent vehicles with validated district and contact',async()=>{
  const data=S.vehicle.parse({transporter_name:'Test Transport',transporter_contact_no:'9999999999',district_id:3,vehicle_type_id:1,registration_no:'JH01TEST123',capacity:{value:10,unit:'MT'}});
  assert.equal(configs.transporters,undefined);
  assert(!configs.vehicles.roles.includes('DRIVER'));
  for(const role of ['ADMIN','OPERATOR','MILLER','PACS','LAMPS','TRANSPORTER']){
    assert(configs.vehicles.roles.includes(role));let saved;
    const db={execute:async(sql,args)=>{
      assert(!/\btransporters\b|\bmiller_id\b|\btransporter_id\b/.test(sql));
      if(sql.startsWith('SELECT'))return [[{id:1}]];
      if(sql.startsWith('INSERT INTO vehicles')){const fields=sql.match(/\(([^)]+)\)/)[1].split(',');saved=Object.fromEntries(fields.map((f,i)=>[f,args[i]]));return [{insertId:8}];}
      throw Error('Unexpected query');
    }};
    await createMaster(db,'vehicles',data,{role,id:5});
    assert.equal(saved.transporter_name,data.transporter_name);assert.equal(saved.transporter_contact_no,data.transporter_contact_no);
    assert.equal(saved.district_id,3);assert.equal(saved.created_by,5);
    assert.equal(saved.capacity_value,10);
    assert.equal(saved.capacity_unit,'MT');
  }
});

test('Independent vehicle editing is creator-scoped while Core DM stays district-scoped',()=>{
  assert.deepEqual(masterVisibility('vehicles',{role:'PACS',id:7}),{sql:'',args:[]});
  assert.deepEqual(masterVisibility('vehicles',{role:'PACS',id:7},true),{sql:' AND x.created_by=?',args:[7]});
  assert.deepEqual(masterVisibility('vehicles',{role:'CORE_DM',district_ids:[3]},true),{sql:' AND x.district_id IN (?)',args:[3]});
  assert.throws(()=>masterVisibility('vehicles',{role:'CORE_DM',district_ids:[]}),e=>e.status===403);
});

test('Shared vehicle selection does not grant unrelated accounts GPS tracking access',async()=>{
  const original=pool.execute;let allowed=false,calls=0;
  pool.execute=async(sql,args)=>{calls++;assert.match(sql,/s.miller_id=\?/);assert.deepEqual(args,[4,3]);return [allowed?[{id:1}]:[]];};
  try{
    await assert.rejects(requireVehicleTrackingAccess({role:'MILLER',id:2,miller_id:3},{id:4,created_by:9}),e=>e.status===403);
    allowed=true;await requireVehicleTrackingAccess({role:'MILLER',id:2,miller_id:3},{id:4,created_by:9});
    const before=calls;await requireVehicleTrackingAccess({role:'TRANSPORTER',id:9},{id:4,created_by:9});assert.equal(calls,before);
  }finally{pool.execute=original;}
});
import {ensureLocation} from '../src/services/masters.service.js';

test('Location schemas require district only and reject the retired block field', async () => {
  const samples = [
    [S.facility, {code:'PACS-TEST',kind:'PACS',name:'Test PACS',address:'Test address',district_id:3,latitude:23,longitude:85,capacity:{value:100,unit:'MT'}}],
    [S.farmer, {code:'FARMER-TEST',name:'Test farmer',village:'Test village',district_id:3}],
    [S.imeiMaster, {imei:'867123456789012',provider:'Test provider',district_id:3}],
    [S.device, {vehicle_id:1,imei_id:1,district_id:3}]
  ];
  for (const [schema,data] of samples) {
    assert.equal(schema.safeParse(data).success,true);
    assert.equal(schema.safeParse({...data,block_id:1}).success,false);
    assert.equal(schema.safeParse({...data,district_id:undefined}).success,false);
  }
  const queries=[];
  await ensureLocation({execute:async(sql,args)=>{queries.push({sql,args});return [[{id:3}]];}},3);
  assert.equal(queries.length,1);
  assert.match(queries[0].sql,/tbl_district_master/);
  assert.deepEqual(queries[0].args,[3]);
});
test('Stock labels validate direct codes without querying removed masters', async () => {
 const connection={execute:async()=>{throw Error('Master lookup is no longer allowed');}};
 assert.deepEqual(await requireStockMasters(connection,'SCMR','PADDY'),{scheme_code:'SCMR',commodity_code:'PADDY'});
 assert.deepEqual(await requireStockMasters(connection,'CUSTOM','RICE'),{scheme_code:'CUSTOM',commodity_code:'RICE'});
 await assert.rejects(requireStockMasters(connection,'{{scheme_code}}','PADDY'));
 await assert.rejects(requireStockMasters(connection,'SCMR','WHEAT'),e=>e.status===400);
 assert.equal(profilePatches.schemes,undefined);assert.equal(profilePatches.commodities,undefined);
});

test('Master removal stops before dropping tables when a historical code cannot be resolved', async () => {
  const statements=[];
  const connection={
    execute:async()=>[[{COLUMN_NAME:'scheme_id'},{COLUMN_NAME:'commodity_id'},{COLUMN_NAME:'scheme_code'},{COLUMN_NAME:'commodity_code'}]],
    query:async(sql)=>{statements.push(sql);return [sql.startsWith('SELECT id')?[{id:17}]:[]];}
  };
  await assert.rejects(removeSchemeCommodityMasters(connection),/unresolved scheme\/commodity codes/);
  assert(statements.some(sql=>sql.includes('JOIN `schemes`')));
  assert(!statements.some(sql=>/DROP TABLE|DROP COLUMN/.test(sql)));
});
test('Timestamps keep ISO input and UTC storage with IST display in nested JSON responses', async () => {
  const date = new Date('2026-10-21T18:30:39.984Z');
  assert.equal(secondPrecision(date).toISOString(), '2026-10-21T18:30:39.000Z');
  assert.equal(date.getUTCMilliseconds(), 984);
  assert.equal(timestamp.parse('2026-10-22T00:00:39.984+05:30').getTime(), secondPrecision(date).getTime());
  let stored;
  await rows({ execute: async (sql, values) => { stored = values; return [[]]; } }, 'SELECT ?', [date, null, 'keep']);
  assert.equal(stored[0].getUTCMilliseconds(), 0);
  assert.deepEqual(stored.slice(1), [null, 'keep']);
  const result = JSON.parse(JSON.stringify({ created_at: date, nested: [{ at: date.toISOString() }], replay: '2026-10-22T00:00:39.984+05:30', quantity: 12.984, note: 'Value 39.984', empty: null }, dateJsonReplacer));
  assert.equal(result.created_at, '22-10-2026 12:00:39 AM');
  assert.equal(result.nested[0].at, '22-10-2026 12:00:39 AM');
  assert.equal(result.replay, '22-10-2026 12:00:39 AM');
  assert.equal(result.quantity, 12.984);
  assert.equal(result.note, 'Value 39.984');
  assert.equal(result.empty, null);
});

test('Date display handles noon, year rollover, date-only values and non-date strings', () => {
  assert.equal(dateJsonReplacer('', '2026-11-02T09:55:40Z'), '02-11-2026 03:25:40 PM');
  assert.equal(dateJsonReplacer('', '2026-11-02T06:30:00Z'), '02-11-2026 12:00:00 PM');
  assert.equal(dateJsonReplacer('', '2026-12-31T20:30:00Z'), '01-01-2027 02:00:00 AM');
  assert.equal(dateJsonReplacer('', '2026-11-02'), '02-11-2026');
  for (const value of ['2026-02-30', 'invalid', '2026-99-02T01:00:00Z', '02-11-2026 03:25:40 PM']) {
    assert.equal(dateJsonReplacer('', value), value);
  }
});

test('Only reports format timestamps while normal API responses and original dates stay unchanged', () => {
  const created = new Date('2026-11-02T09:55:40.123Z');
  const result = {status: 200, body: {data: [{created_at: created, due_date: '2026-11-02'}]}};
  const response = () => ({status(code) {assert.equal(code, 200); return this;}, json(body) {return JSON.parse(JSON.stringify(body, secondsJsonReplacer));}});
  const report = respondReport(response(), result);
  assert.equal(report.data[0].created_at, '02-11-2026 03:25:40 PM');
  assert.equal(report.data[0].due_date, '02-11-2026');
  const normal = respond(response(), result);
  assert.equal(normal.data[0].created_at, '2026-11-02T09:55:40Z');
  assert.equal(normal.data[0].due_date, '2026-11-02');
  assert.equal(result.body.data[0].created_at, created);
  assert.equal(created.toISOString(), '2026-11-02T09:55:40.123Z');
});
test('IMEI identity is separate from GPS vehicle and location registration', () => {
  const identity = { imei: '867123456789012', provider: 'GPS provider', district_id: 3};
  assert.deepEqual(S.imeiMaster.parse(identity), identity);
  assert.equal(S.imeiMaster.safeParse({ ...identity, mapping_status: 'MAPPED' }).success, false);
  assert.throws(() => S.imeiMaster.parse({ imei: 'invalid', provider: 'GPS provider' }));
  const assignment = { imei_id: 1, vehicle_id: 2, district_id: 3};
  assert.equal(S.device.parse(assignment).imei_id, 1);
  for (const key of Object.keys(assignment)) assert.equal(S.device.safeParse({ ...assignment, [key]: undefined }).success, false);
  assert.equal(S.device.safeParse({ ...assignment, imei: '867123456789012', provider: 'GPS provider' }).success, false);
  assert.deepEqual(visibility('imeis', { role: 'ADMIN' }), { sql: '', args: [] });
  assert.throws(() => visibility('imeis', { role: 'MILLER' }), { code: 'FORBIDDEN' });
});
test('Combined Miller registration validates facility type and account credentials', () => {
  const data = {
    facility: {
      kind: 'MILLER',
      name: 'Test Mill',
      address: 'Mill address',
      district_id: 1,
      latitude: 23,
      longitude: 85,
      capacity: {
        value: 100,
        unit: 'MT'
      }
    },
    user: {
      name: 'Owner',
      email: 'owner@example.org'
    }
  };
  assert.equal(millerRegistrationSchema.parse(data).facility.kind, 'MILLER');
  assert.throws(() => millerRegistrationSchema.parse({
    ...data,
    facility: {
      ...data.facility,
      code: 'CLIENT-CODE'
    }
  }));
  assert.throws(() => millerRegistrationSchema.parse({
    ...data,
    facility: {
      ...data.facility,
      kind: 'PACS'
    }
  }));
  assert.throws(() => millerRegistrationSchema.parse({
    ...data,
    user: {
      ...data.user,
      password: 'client-password'
    }
  }));
  assert.throws(() => millerRegistrationSchema.parse({
    ...data,
    user: {
      ...data.user,
      role: 'ADMIN'
    }
  }));
});
test('Vehicle registration requires contact and district without Miller or transporter master IDs', () => {
 const vehicle={transporter_name:'Test Transport',transporter_contact_no:'9999999999',district_id:3,vehicle_type_id:1,registration_no:'JH01CMR0001',capacity:{value:10,unit:'MT'}};
 assert.equal(S.vehicle.parse(vehicle).district_id,3);
 for(const key of ['transporter_name','transporter_contact_no','district_id'])assert.equal(S.vehicle.safeParse({...vehicle,[key]:undefined}).success,false);
 assert.equal(S.vehicle.safeParse({...vehicle,miller_id:3}).success,false);
 assert.equal(S.vehicle.safeParse({...vehicle,transporter_id:7}).success,false);
 assert.equal(S.vehicle.safeParse({...vehicle,transporter_contact_no:'invalid'}).success,false);
});
test('Miller registration hashes the backend default password and links the account', async () => {
  let account, facility;
  const c = {
    async execute(sql, values) {
      if (sql.startsWith('SELECT')) return [[{
        id: 1
      }]];
      if (sql.startsWith('INSERT INTO users')) {
        const fields = sql.match(/\(([^)]+)\)/)[1].split(',');
        account = Object.fromEntries(fields.map((field, index) => [field, values[index]]));
        return [{
          insertId: 52
        }];
      }
      if (sql.startsWith('INSERT INTO facilities')) {
        const fields = sql.match(/\(([^)]+)\)/)[1].split(',');
        facility = Object.fromEntries(fields.map((field, index) => [field, values[index]]));
        return [{
          insertId: 51
        }];
      }
      throw Error('Unexpected registration query');
    }
  };
  const data = millerRegistrationSchema.parse({
    facility: {
      kind: 'MILLER',
      name: 'Test Mill',
      address: 'Mill address',
      district_id: 1,
      latitude: 23,
      longitude: 85,
      capacity: {
        value: 100,
        unit: 'MT'
      }
    },
    user: {
      name: 'Owner',
      email: 'owner@example.org'
    }
  });
  const result = await registerMiller(c, data, {
    actor: 'core-dm:7',
    core_user_id: 7,
    core_user_type: 3
  });
  assert.equal(facility.created_by, null);
  assert.equal(facility.created_by_core_user_id, 7);
  assert.equal(facility.created_by_user_type, 3);
  assert.match(facility.code, /^MILL-[A-F0-9-]{36}$/);
  assert.equal(result.miller_code, facility.code);
  assert.equal(result.id, 52);
  assert.equal(account.miller_id, 51);
  assert.equal(account.facility_id, 51);
  assert.notEqual(account.password_hash, '123456789');
  assert.equal(await verifyPassword('123456789', account.password_hash), true);
});
test('User and Miller registration reject duplicate mobile numbers before inserting records', async () => {
  const queries=[];
  const connection={execute:async(sql,args)=>{queries.push({sql,args});return [[{id:7}]];}};
  const duplicate=e=>e.status===409&&e.code==='MOBILE_ALREADY_EXISTS';
  await assert.rejects(createUser(connection,{role:'OPERATOR',phone:'9999999999'},{user:{id:1}}),duplicate);
  await assert.rejects(registerMiller(connection,{facility:{phone:'9999999999'}},{id:1}),duplicate);
  assert.equal(queries.length,2);
  assert(queries.every(q=>q.sql==='SELECT id FROM users WHERE phone=?'));
  assert(queries.every(q=>q.args[0]==='9999999999'));
});

test('Mobile validation permits missing contacts and saves unique mobile numbers on user and Miller accounts', async () => {
  const writes=[];
  const connection={execute:async(sql,args)=>{
    if(sql==='SELECT id FROM users WHERE phone=?')return [[]];
    if(sql.startsWith('SELECT'))return [[{id:1}]];
    writes.push({sql,args});return [{insertId:52}];
  }};
  await ensureUniqueUserPhone({execute:()=>assert.fail('No lookup for missing phone')},null);
  const user=S.user.parse({name:'Operator',email:'operator@test.invalid',password:'TestPassword123',role:'OPERATOR',phone:'9999999999'});
  assert.equal(S.user.safeParse({...user,phone:'invalid'}).success,false);
  await createUser(connection,user,{user:{id:1}});
  const data=millerRegistrationSchema.parse({facility:{kind:'MILLER',name:'Mill',address:'Mill address',district_id:1,latitude:23,longitude:85,capacity:{value:10,unit:'MT'},phone:'8888888888'},user:{name:'Miller',email:'miller@test.invalid'}});
  await registerMiller(connection,data,{id:1});
  const numbers=writes.filter(q=>q.sql.startsWith('INSERT INTO users')).map(q=>q.args[q.sql.match(/\(([^)]+)\)/)[1].split(',').indexOf('phone')]);
  assert.deepEqual(numbers,['9999999999','8888888888']);
});

test('Concurrent duplicate mobile registration produces a clear conflict without exposing SQL', () => {
  let status,body;
  const response={status(value){status=value;return this;},json(value){body=value;}};
  errorHandler({code:'ER_DUP_ENTRY',sqlMessage:"Duplicate entry '9999999999' for key 'users.uq_users_phone'"},{method:'POST',url:'/api/v1/millers',requestId:'test'},response,()=>assert.fail());
  assert.equal(status,409);
  assert.equal(body.error.code,'MOBILE_ALREADY_EXISTS');
  assert.equal(body.error.message,'Mobile number already registered.');
});

test('Capacity preserves input value and unit while checks compare the same weight',()=>{
  for(const q of [{value:10,unit:'MT'},{value:1,unit:'QTL'},{value:'0.001',unit:'KG'}]){
    const fields=capacityFields(q);
    assert.equal(fields.capacity_value,Number(q.value));
    assert.equal(fields.capacity_unit,q.unit);
    assert.equal(capacityGrams(fields),grams(q));
  }
  assert.deepEqual(capacityFields(null,true),{milling_capacity_value_per_day:null,milling_capacity_unit:null});
  assert.equal(capacityGrams({capacity_value:0.000001,capacity_unit:'MT'}),1);
});

test('Storage capacity in kg is checked against gram stock across all seasons',async()=>{
  let changed=false;
  const connection={execute:async(sql)=>{
    if(sql.startsWith('SELECT id,on_hand_g'))return [[{id:1,on_hand_g:500,reserved_g:0,status:1}]];
    if(sql.startsWith('SELECT capacity_value'))return [[{capacity_value:1.001,capacity_unit:'KG'}]];
    if(sql.startsWith('SELECT COALESCE(SUM(on_hand_g)'))return [[{amount:1000}]];
    if(sql.startsWith('UPDATE stocks'))changed=true;
    return [{insertId:1}];
  }};
  await stock(connection,1,1,'PADDY',1,0,'TEST',1,'SCMR',{id:1,role:'ADMIN'});
  assert(changed);
  changed=false;
  await assert.rejects(stock(connection,1,1,'PADDY',2,0,'TEST',1,'SCMR',{id:1,role:'ADMIN'}),e=>e.code==='CAPACITY_EXCEEDED');
  assert.equal(changed,false);
});

test('100 QTL paddy yields 68 QTL rice at configurable 68%', () => {
  assert.equal(grams({
    value: 100,
    unit: 'QTL'
  }), 10000000);
  assert.equal(recoveryGrams(10000000, 68), 6800000);
  assert.equal(recoveryGrams(10000000, 67), 6700000);
});
test('Exact decimal quantity conversions and invalid precision', () => {
  assert.equal(grams({
    value: '0.001',
    unit: 'KG'
  }), 1);
  assert.equal(grams({
    value: '1.125',
    unit: 'MT'
  }), 1125000);
  assert.throws(() => grams({
    value: '1.0001',
    unit: 'KG'
  }));
  assert.throws(() => grams({
    value: 0,
    unit: 'KG'
  }));
  assert.equal(grams({
    value: 0,
    unit: 'KG'
  }, true), 0);
  assert.throws(() => grams({
    value: 1e15,
    unit: 'MT'
  }));
});
test('Canonical payload hash ignores JSON key order but detects changed quantities', () => {
  assert.equal(hash({
    b: 2,
    a: 1
  }), hash({
    a: 1,
    b: 2
  }));
  assert.notEqual(hash({
    value: 1
  }), hash({
    value: 2
  }));
});
test('Passwords use salted scrypt and verify safely', async () => {
  const h = await passwordHash('A-unique-passphrase-2026');
  assert(await verifyPassword('A-unique-passphrase-2026', h));
  assert.equal(await verifyPassword('wrong', h), false);
  assert.notEqual(h, await passwordHash('A-unique-passphrase-2026'));
});
test('Shipment Miller scope remains while independent vehicle use is role based', () => {
 assert.throws(()=>millerAccess({role:'MILLER',miller_id:2},1));
 for(const role of ['ADMIN','OPERATOR','MILLER','PACS','LAMPS','TRANSPORTER'])assert.doesNotThrow(()=>vehicleAccess({role},{id:4,district_id:3}));
 assert.throws(()=>vehicleAccess({role:'DRIVER'},{id:4}));
 assert.throws(()=>vehicleAccess({role:'CORE_DM',district_ids:[3]},{id:4,district_id:5}));
 millerAccess({role:'ADMIN'},1);
});
const s = {
  status: 'DISPATCHED',
  dispatched_at: new Date('2026-10-01T08:00:00Z'),
  last_gps_at: null,
  source_lat: 23.3,
  source_lng: 85.3,
  source_radius_m: 200,
  destination_lat: 23.4,
  destination_lng: 85.4,
  destination_radius_m: 200,
  source_geofence: 'UNKNOWN',
  destination_geofence: 'UNKNOWN'
};
test('GPS remains DISPATCHED inside source, starts outside, arrives in destination', () => {
  const inside=gpsTransition(s, {
    gps_at: new Date('2026-10-01T08:01:00Z'),
    latitude: 23.3,
    longitude: 85.3
  });
  assert.equal(inside.status,'DISPATCHED');assert.equal(inside.trip_status,0);
  assert.equal(inside.trip_started_at,null);assert.equal(inside.trip_completed_at,null);
  const departed = gpsTransition(s, {
    gps_at: new Date('2026-10-01T08:02:00Z'),
    latitude: 23.35,
    longitude: 85.35
  });
  assert.equal(departed.status, 'IN_TRANSIT');
  assert.equal(departed.trip_status,1);assert.equal(departed.trip_started_at.toISOString(),'2026-10-01T08:02:00.000Z');
  assert.equal(departed.trip_completed_at,null);
  const arrived = gpsTransition({
    ...s,
    status: 'IN_TRANSIT',trip_status:1,trip_started_at:departed.trip_started_at
  }, {
    gps_at: new Date('2026-10-01T08:10:00Z'),
    latitude: 23.4,
    longitude: 85.4
  });
  assert.equal(arrived.status, 'ARRIVED');
  assert.equal(arrived.trip_status,2);assert.equal(arrived.trip_started_at,departed.trip_started_at);
  assert.equal(arrived.trip_completed_at.toISOString(),'2026-10-01T08:10:00.000Z');
  assert(!arrived.events.includes('DELIVERED'));
});
test('First offline destination packet can record departure and arrival', () => {
  const transition = gpsTransition(s, {
    gps_at: new Date('2026-10-01T08:10:00Z'),
    latitude: 23.4,
    longitude: 85.4
  });
  assert(transition.events.includes('DEPARTED'));
  assert(transition.events.includes('ARRIVED'));
  assert.equal(transition.trip_status,2);assert.equal(transition.trip_started_at,transition.trip_completed_at);
});
test('Later GPS preserves completed trip state and first arrival/departure times',()=>{
  const started=new Date('2026-10-01T08:02:00Z'),completed=new Date('2026-10-01T08:10:00Z');
  const change=gpsTransition({...s,status:'ARRIVED',trip_status:2,trip_started_at:started,trip_completed_at:completed,departed_at:started,arrived_at:completed},
    {gps_at:new Date('2026-10-01T08:12:00Z'),latitude:23.5,longitude:85.5});
  assert.equal(change.trip_status,2);assert.equal(change.trip_started_at,started);assert.equal(change.trip_completed_at,completed);
});
test('Duplicate, old, pre-dispatch and terminal GPS cannot roll back trip', () => {
  assert.equal(gpsTransition(s, {
    gps_at: new Date('2026-10-01T07:59:00Z')
  }), null);
  assert.equal(gpsTransition({
    ...s,
    last_gps_at: new Date('2026-10-01T08:05:00Z')
  }, {
    gps_at: new Date('2026-10-01T08:05:00Z')
  }), null);
  assert.equal(gpsTransition({
    ...s,
    status: 'DELIVERED'
  }, {
    gps_at: new Date('2026-10-01T08:10:00Z')
  }), null);
});
test('Distance calculation and strict timestamp/GPS validation', () => {
  assert.equal(distanceMeters(23, 85, 23, 85), 0);
  assert(distanceMeters(23, 85, 24, 85) > 110000);
  assert.throws(() => S.gps.parse({
    imei: '123456789012345',
    gps_at: '2026-10-01 08:00:00',
    latitude: 23,
    longitude: 85,
    gps_fix: true
  }));
  assert.throws(() => S.gps.parse({
    imei: '123456789012345',
    gps_at: '2026-10-01T08:00:00Z',
    latitude: 23,
    longitude: 85,
    gps_fix: false
  }));
  const normalized = normalizeMqtt({
    imei_no: '123456789012345',
    date_time: '2026-10-01 08:00:00',
    latitude: '23',
    longitude: '85',
    gps_fix: '1',
    speed: '10',
    packet_header: '$PVT'
  });
  assert.equal(normalized.gps_at.toISOString(), '2026-10-01T08:00:00.000Z');
  assert.equal(normalized.speed_kph, 10);
  assert.throws(() => normalizeMqtt({
    gps_timestamp: 'bad'
  }));
  assert.throws(() => normalizeMqtt(null));
});
