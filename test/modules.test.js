import test from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from '../src/middlewares/errors.js';
import { allowedModule, moduleForRequest } from "../src/middlewares/module-access.js";
test('Facility duplicates identify facility code or core store without exposing database errors', () => {
  for (const [kind, sqlMessage, expected] of [
    ['MILLER', 'Duplicate entry for key code', 'Miller facility with this code already exists. Use a unique facility code.'],
    ['PACS', 'Duplicate entry for key code', 'PACS facility with this code already exists. Use a unique facility code.'],
    ['LAMPS', 'Duplicate entry for key code', 'LAMPS facility with this code already exists. Use a unique facility code.'],
    [undefined, 'Duplicate entry for key code', 'Facility with this code already exists. Use a unique facility code.'],
    ['SFC_GODOWN', 'Duplicate entry for key facilities.uq_facility_core_store', 'A facility is already linked to this core store.']
  ]) {
    for (const [method, originalUrl] of [['POST', '/api/v1/facilities'], ['PATCH', '/api/v1/facilities/12']]) {
      let status, body;
      const res = { status(value) { status = value; return this; }, json(value) { body = value; } };
      errorHandler({ code: 'ER_DUP_ENTRY', sqlMessage }, { method, originalUrl, body: { kind }, requestId: 'test' }, res, () => {});
      assert.equal(status, 409);
      assert.equal(body.error.code, 'DUPLICATE_RECORD');
      assert.equal(body.error.message, expected);
    }
  }
});
test('Vehicle type duplicate errors identify the code on create and update', () => {
  for (const [method, originalUrl, expected] of [
    ['POST', '/api/v1/vehicle-types', 'Vehicle type with this code already exists.'],
    ['PATCH', '/api/v1/vehicle-types/12?test=1', 'Vehicle type with this code already exists.'],
    ['POST', '/api/v1/vehicles', 'Vehicle with this registration number already exists.'],
    ['POST', '/api/v1/shipments', 'Unique code, reference, device, vehicle or active vehicle assignment already exists.']
  ]) {
    let status, body;
    const res = { status(value) { status = value; return this; }, json(value) { body = value; } };
    errorHandler({ code: 'ER_DUP_ENTRY', message: 'Database details' }, { method, originalUrl, requestId: 'test' }, res, () => {});
    assert.equal(status, 409);
    assert.equal(body.error.code, 'DUPLICATE_RECORD');
    assert.equal(body.error.message, expected);
  }
});
test('Module permissions deny missing or hidden modules and distinguish view, add and edit', () => {
  assert.equal(allowedModule(undefined, 'GET'), false);
  assert.equal(allowedModule({
    can_view: 0,
    can_add: 1,
    can_edit: 1
  }, 'POST'), false);
  const viewOnly = {
    can_view: 1,
    can_add: 0,
    can_edit: 0
  };
  assert.equal(allowedModule(viewOnly, 'GET'), true);
  assert.equal(allowedModule(viewOnly, 'POST'), false);
  assert.equal(allowedModule(viewOnly, 'PATCH'), false);
  assert.equal(allowedModule({
    ...viewOnly,
    can_add: 1
  }, 'POST'), true);
  assert.equal(allowedModule({
    ...viewOnly,
    can_edit: 1
  }, 'PATCH'), true);
});
test('Operational paths map to the same modules used by navigation', () => {
  for (const [path, key] of [['/reports/dashboard', 'dashboard'], ['/reports/stocks', 'stocks'], ['/reports/ledger', 'ledger'], ['/reports/millers/42/reconciliation', 'reconciliation'], ['/vehicles/7', 'vehicles'], ['/transporters/12/status', 'transporters'], ['/gps-devices', 'gps-devices']]) {
    assert.equal(moduleForRequest({
      path
    }), key);
  }
  assert.equal(moduleForRequest({
    path: '/profile'
  }), undefined);
});
