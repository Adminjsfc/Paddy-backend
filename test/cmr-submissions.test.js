import test from 'node:test';
import assert from 'node:assert/strict';
import { cmrSubmissionSchema } from "../src/validators/cmr-submissions.schema.js";
import { moduleForRequest } from "../src/middlewares/module-access.js";
import { schemeStoreType, storeMatchesFacility } from "../src/services/store-locations.service.js";
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
  }, {
    ...submission,
    store_location_id: undefined
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
