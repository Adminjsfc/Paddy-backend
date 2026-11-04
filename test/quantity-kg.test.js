import test from 'node:test';
import assert from 'node:assert/strict';
import {kilograms, recoveryKg, addKg, capacityKg} from '../src/utils/core.js';
import {delivery} from '../src/validators/schemas.js';
import {kilogramResponse} from '../src/utils/quantity-response.js';

test('source quantities default to kg and preserve gram precision without scaling by 100', () => {
  assert.equal(kilograms({value:'426.47'}),426.47);
  assert.equal(kilograms({value:'0.001',unit:'KG'}),0.001);
  assert.equal(kilograms({value:'1.125',unit:'MT'}),1125);
  assert.equal(kilograms({value:'1',unit:'QTL'}),100);
  assert.equal(recoveryKg(426.47,68),290);
  assert.equal(addKg(0.1,0.2),0.3);
  assert.equal(addKg(0.3,-0.1,-0.2),0);
  assert.equal(capacityKg({capacity_value:1.5,capacity_unit:'MT'}),1500);
  assert.throws(()=>kilograms({value:'0.0001'}));
});

test('receiving requires an independent whole-number bags count', () => {
  const body={value:'426.47'};
  assert.equal(delivery.safeParse(body).success,false);
  assert.equal(delivery.safeParse({...body,received_bags:12.5}).success,false);
  assert.equal(delivery.safeParse({...body,received_bags:-1}).success,false);
  assert.equal(delivery.parse({...body,received_bags:854}).unit,'KG');
  assert.equal(delivery.safeParse({accepted_quantity:body,received_bags:854}).success,false);
  for(const removed of ['delivered_at','receipt_no','gps_override_reason','remarks'])
    assert.equal(delivery.safeParse({...body,received_bags:854,[removed]:'removed'}).success,false);
});

test('old idempotency replays return kg fields without changing stored JSON', () => {
  const old={records:[{quantity_g:426470,accepted_g:null}],id:2,gps_at:'unchanged'};
  assert.deepEqual(kilogramResponse(old),{records:[{quantity_kg:426.47,accepted_kg:null}],id:2,gps_at:'unchanged'});
  assert.equal(old.records[0].quantity_g,426470);
  assert.deepEqual(kilogramResponse({quantity_kg:426.47}),{quantity_kg:426.47});
});
