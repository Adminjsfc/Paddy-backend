import test from 'node:test';
import assert from 'node:assert/strict';
import { cmrSubmissionSchema } from "../src/validators/cmr-submissions.schema.js";
import { moduleForRequest } from "../src/middlewares/module-access.js";
import { schemeStoreType, storeMatchesFacility } from "../src/services/store-locations.service.js";
import {getSubmissionOptions} from '../src/services/cmr-submissions.service.js';
import {pool} from '../src/config/database.js';

test('district dropdown is independent of season, scheme and Miller mappings',async t=>{
  const calls=[];
  t.mock.method(pool,'execute',async(sql,args)=>{calls.push({sql,args});return [[{id:1,district_name:'District A'},{id:2,district_name:'District B'}]];});
  const result=await getSubmissionOptions({user:{role:'MILLER',miller_id:3},query:{only:'districts',season_id:'invalid',scheme_type:'invalid'}});
  assert.equal(result.body.data.districts.length,2);
  assert.equal(calls.length,1);assert.deepEqual(calls[0].args,[]);
  assert.match(calls[0].sql,/WHERE status=1/);
  assert.doesNotMatch(calls[0].sql,/JOIN|season|miller|scheme/i);
});

test('CMR order-only dropdown filters destination and does not query core stores',async t=>{
  const calls=[];
  t.mock.method(pool,'execute',async(sql,args)=>{
    calls.push({sql,args});
    if(sql.includes('FROM cmr_orders'))return [[{id:1,destination_id:8,district_id:5},{id:2,destination_id:9,district_id:6}]];
    if(sql.includes('FROM stocks'))return [[{available_kg:100}]];
    throw new Error('Unexpected dropdown query: '+sql);
  });
  const result=await getSubmissionOptions({user:{role:'MILLER',miller_id:3},query:{only:'orders',season_id:'1',destination_id:'8',scheme_type:'invalid'}});
  assert.deepEqual(Object.keys(result.body.data).sort(),['orders','rice_stock']);
  assert.deepEqual(result.body.data.orders.map(o=>o.id),[1]);
  for(const call of calls){assert.doesNotMatch(call.sql,/scheme_code\s*=\s*\?/);assert.deepEqual(call.args,[3,1]);}
  await assert.rejects(getSubmissionOptions({user:{role:'MILLER',miller_id:3},query:{only:'stores',season_id:'1'}}),/district_id is required/);
});
const submission = {
  season_id: 1,
  order_id: 1,
  destination_id: 2,
  district_id: 364,
  store_location_id: 38,
  scheme_type: 'SCMR',
  vehicle_id: 1,
  quantity: {
    value: '10',
    unit: 'QTL'
  },
  submitted_on: '2025-01-27',
  commodity_type: 'RICE',
  lot_count: 1,
  stenciling_code: 'STENCIL001',
  gunny_bag_year: 2025,
  gunny_bag_type: 'New jute',
  total_bags: 20,
  driver_name: 'Test Driver',
  driver_phone: '9999999999'
};
test('CMR submission accepts one vehicle and validates dispatch-independent form details', () => {
  assert.equal(cmrSubmissionSchema.parse(submission).vehicle_id, 1);
  for (const invalid of [{
    ...submission,
    expected_completion_at:'2026-11-04T18:00:00Z'
  }, {
    ...submission,
    vehicles: [1, 2]
  }, {
    ...submission,
    vehicle_id: [1, 2]
  }, {
    ...submission,
    total_bags: 0
  }, {
    ...submission,
    lot_count: 0
  }, {
    ...submission,
    commodity_type: 'PADDY'
  }, {
    ...submission,
    driver_phone: 'invalid'
  }, {
    ...submission,
    submitted_on: '2999-01-01'
  }, {
    ...submission,
    stenciling_code: ''
  }, {
    ...submission,
    scheme_type: 'INVALID'
  }]) assert.throws(() => cmrSubmissionSchema.parse(invalid));
});
test('Scheme and core store mapping enforce district, store type and independent IDs', () => {
  assert.equal(schemeStoreType.SCMR, 2);
  assert.equal(schemeStoreType.CCMR, 1);
  const store = {
    id: 38,
    store_code: 'BKR01',
    store_type: 2,
    district_id: 355
  };
  const facility = {
    id: 999,
    code: 'BKR01',
    kind: 'SFC_GODOWN',
    district_id: 355,
    active: 1,
    core_store_id: null
  };
  assert.equal(storeMatchesFacility(store, facility), true);
  assert.equal(storeMatchesFacility(store, {
    ...facility,
    district_id: 364
  }), false);
  assert.equal(storeMatchesFacility(store, {
    ...facility,
    kind: 'FCI'
  }), false);
  assert.equal(storeMatchesFacility(store, {
    ...facility,
    active: 0
  }), false);
  assert.equal(storeMatchesFacility(store, {
    ...facility,
    code: 'OTHER',
    core_store_id: 38
  }), true);
  assert.equal(storeMatchesFacility(store, {
    ...facility,
    core_store_id: 999
  }), false);
  assert.equal(storeMatchesFacility({
    ...store,
    store_type: 1
  }, {
    ...facility,
    kind: 'FCI'
  }), true);
});
test('CMR form and lookup APIs share the CMR module permission', () => {
  for (const path of ['/cmr/submissions', '/cmr/submission-options', '/cmr/vehicle']) assert.equal(moduleForRequest({
    path
  }), 'cmr');
});

test('CMR submission accepts the minimal order-based payload',()=>{
  const {season_id,order_id,destination_id,district_id,vehicle_id,quantity,total_bags,driver_name,driver_phone}=submission;
  assert.equal(cmrSubmissionSchema.parse({season_id,order_id,destination_id,district_id,vehicle_id,quantity,total_bags,driver_name,driver_phone}).order_id,1);
});
