import test from 'node:test';
import assert from 'node:assert/strict';
import { grams, recoveryGrams, hash, distanceMeters, gpsTransition, passwordHash, verifyPassword, millerAccess, vehicleAccess } from "../src/utils/core.js";
import * as S from "../src/validators/schemas.js";
import { normalizeMqtt } from "../src/services/gps.service.js";
import { millerRegistrationSchema } from "../src/validators/millers.schema.js";
import { registerMiller } from "../src/services/millers.service.js";
import { visibility } from '../src/services/masters.service.js';
import { secondPrecision, secondsJsonReplacer } from '../src/utils/datetime.js';
import { timestamp } from '../src/utils/core.js';
import { rows } from '../src/repositories/database.js';
import { profilePatches } from '../src/config/masters.js';
test('Scheme and commodity masters validate names and keep codes immutable on update', () => {
  for (const [schema, patch, field] of [[S.schemeMaster, profilePatches.schemes, 'scheme_name'], [S.commodityMaster, profilePatches.commodities, 'commodity_name']]) {
    assert.equal(schema.parse({ code: 'SAMPLE', [field]: ' Sample name ' })[field], 'Sample name');
    assert.equal(schema.safeParse({ code: 'SAMPLE', [field]: '' }).success, false);
    assert.equal(patch.safeParse({ code: 'NEW-CODE' }).success, false);
    assert.equal(patch.parse({ [field]: 'Updated' })[field], 'Updated');
  }
});
test('Timestamps use seconds in input, database writes and nested JSON responses', async () => {
  const date = new Date('2026-10-21T18:30:39.984Z');
  assert.equal(secondPrecision(date).toISOString(), '2026-10-21T18:30:39.000Z');
  assert.equal(date.getUTCMilliseconds(), 984);
  assert.equal(timestamp.parse('2026-10-22T00:00:39.984+05:30').getTime(), secondPrecision(date).getTime());
  let stored;
  await rows({ execute: async (sql, values) => { stored = values; return [[]]; } }, 'SELECT ?', [date, null, 'keep']);
  assert.equal(stored[0].getUTCMilliseconds(), 0);
  assert.deepEqual(stored.slice(1), [null, 'keep']);
  const result = JSON.parse(JSON.stringify({ created_at: date, nested: [{ at: date.toISOString() }], replay: '2026-10-22T00:00:39.984+05:30', quantity: 12.984, note: 'Value 39.984', empty: null }, secondsJsonReplacer));
  assert.equal(result.created_at, '2026-10-21T18:30:39Z');
  assert.equal(result.nested[0].at, '2026-10-21T18:30:39Z');
  assert.equal(result.replay, '2026-10-22T00:00:39+05:30');
  assert.equal(result.quantity, 12.984);
  assert.equal(result.note, 'Value 39.984');
  assert.equal(result.empty, null);
});
test('IMEI identity is separate from GPS vehicle and location registration', () => {
  const identity = { imei: '867123456789012', provider: 'GPS provider', district_id: 3, block_id: 4 };
  assert.deepEqual(S.imeiMaster.parse(identity), identity);
  assert.equal(S.imeiMaster.safeParse({ ...identity, mapping_status: 'MAPPED' }).success, false);
  assert.throws(() => S.imeiMaster.parse({ imei: 'invalid', provider: 'GPS provider' }));
  const assignment = { imei_id: 1, vehicle_id: 2, district_id: 3, block_id: 4 };
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
      block_id: 1,
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
test('Vehicle registration supports direct Miller ownership and retained transporter payloads', () => {
  const vehicle = {
    miller_id: 3,
    vehicle_type_id: 1,
    registration_no: 'JH01CMR0001',
    capacity: {
      value: 10,
      unit: 'MT'
    }
  };
  assert.equal(S.vehicle.parse(vehicle).transporter_id, undefined);
  assert.equal(S.vehicle.parse({ ...vehicle, transporter_id: null }).transporter_id, null);
  assert.equal(S.vehicle.parse({
    ...vehicle,
    miller_id: undefined,
    transporter_id: 7
  }).transporter_id, 7);
  assert.throws(() => S.vehicle.parse({
    ...vehicle,
    miller_id: undefined
  }));
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
      block_id: 1,
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
test('Miller and transporter ownership enforcement', () => {
  assert.throws(() => millerAccess({
    role: 'MILLER',
    miller_id: 2
  }, 1));
  assert.throws(() => vehicleAccess({
    role: 'TRANSPORTER',
    miller_id: 1,
    transporter_id: 3
  }, {
    miller_id: 1,
    transporter_id: 4
  }));
  millerAccess({
    role: 'ADMIN'
  }, 1);
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
