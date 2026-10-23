import test from 'node:test';
import assert from 'node:assert/strict';
import {listMappedSources} from '../src/services/paddy-orders.service.js';
import {validateMappedVehicle} from '../src/services/paddy-orders.service.js';
import {scopedWhere} from '../src/utils/core.js';
import {shipment as shipmentSchema} from '../src/validators/schemas.js';
import {grams} from '../src/utils/core.js';
import {liftingSummary,dashboardVehicles} from '../src/services/reports.service.js';
import {moduleForRequest} from '../src/middlewares/module-access.js';
import {listMappings} from '../src/services/miller-mappings.service.js';

test('Miller vehicle dashboard is scoped and uses dashboard view permission',async()=>{
  assert.equal(moduleForRequest({path:'/reports/dashboard/vehicles'}),'dashboard');
  for(const user of [{role:'ADMIN'},{role:'PACS',facility_id:1},{role:'MILLER'}])
    await assert.rejects(dashboardVehicles({user,query:{}}),e=>e.status===403);
  await assert.rejects(dashboardVehicles({user:{role:'MILLER',miller_id:1},query:{season_id:'invalid'}}));
});

test('Mapping details require scoped Miller identity and validate type and season',async()=>{
  for(const user of [{role:'PACS',facility_id:1},{role:'ADMIN'},{role:'MILLER'}])
    await assert.rejects(listMappings({user,query:{}}),e=>e.status===403);
  await assert.rejects(listMappings({user:{role:'MILLER',miller_id:1},query:{type:'OTHER'}}),e=>e.status===400);
  await assert.rejects(listMappings({user:{role:'MILLER',miller_id:1},query:{season_id:'invalid'}}));
});

test('Lifting summaries enforce Miller scope, flow and ledger permission mapping',async()=>{
  await assert.rejects(liftingSummary({user:{role:'PACS'},query:{}}),e=>e.status===403);
  await assert.rejects(liftingSummary({user:{role:'MILLER'},query:{}}),e=>e.status===403);
  await assert.rejects(liftingSummary({user:{role:'MILLER',miller_id:1},query:{flow:'OTHER'}}),e=>e.status===400);
  assert.equal(moduleForRequest({path:'/reports/lifting-summary'}),'ledger');
});

test('Mapped PACS overview requires a scoped Miller and validates filters',async()=>{
  for(const user of [{role:'PACS',facility_id:1},{role:'ADMIN'},{role:'MILLER'}])
    await assert.rejects(listMappedSources({user,query:{}}),e=>e.status===403);
  await assert.rejects(listMappedSources({user:{role:'MILLER',miller_id:1},query:{season_id:'bad'}}));
  await assert.rejects(listMappedSources({user:{role:'MILLER',miller_id:1},query:{limit:201}}));
});

test('Lifting vehicles must be active and belong to the mapped Miller',()=>{
  assert.doesNotThrow(()=>validateMappedVehicle({active:1,owner_miller_id:3},3));
  for(const vehicle of [null,{active:0,owner_miller_id:3},{active:1,owner_miller_id:4}])
    assert.throws(()=>validateMappedVehicle(vehicle,3),e=>e.code==='INVALID_VEHICLE');
});


test('Common shipment schema supports both legs and scopes PACS to its PADDY source',()=>{
 const body={shipment_no:'TEST-1',leg:'PADDY',scheme_code:'SCMR',season_id:2,miller_id:3,source_id:153,destination_id:3,vehicle_id:4,quantity:{value:'10.125',unit:'QTL'}};
 assert.equal(grams(shipmentSchema.parse(body).quantity),1012500);
 assert.equal(shipmentSchema.parse({...body,leg:'CMR',order_id:5}).order_id,5);
 assert.throws(()=>shipmentSchema.parse({...body,lifted_g:0}));
 assert.deepEqual(scopedWhere({role:'PACS',facility_id:153}),{sql:" AND s.leg='PADDY' AND s.source_id=?",params:[153]});
 assert.throws(()=>scopedWhere({role:'LAMPS'}),e=>e.status===403);
 assert.throws(()=>shipmentSchema.parse({...body,release_order_id:1}));
});
