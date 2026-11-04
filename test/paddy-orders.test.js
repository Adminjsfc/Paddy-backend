import test from 'node:test';
import assert from 'node:assert/strict';
import {listMappedSources} from '../src/services/paddy-orders.service.js';
import {validateMappedVehicle} from '../src/services/paddy-orders.service.js';
import {scopedWhere} from '../src/utils/core.js';
import {shipment as shipmentSchema} from '../src/validators/schemas.js';
import {grams} from '../src/utils/core.js';
import {liftingSummary,dashboardVehicles} from '../src/services/reports.service.js';
import {moduleForRequest} from '../src/middlewares/module-access.js';
import {listMappings,listSourceMappings} from '../src/services/miller-mappings.service.js';
import {pool} from '../src/config/database.js';

test('PACS/LAMPS mapping report is limited to the logged-in source for both roles',async t=>{
  const calls=[];
  t.mock.method(pool,'execute',async(sql,args)=>{calls.push({sql,args});return [sql.includes('COUNT(')?[{total:1}]:[{mapping_id:4,miller_id:3}]];});
  for(const role of ['PACS','LAMPS']){
    calls.length=0;
    const result=await listSourceMappings({user:{role,facility_id:153},query:{season_id:'2'}});
    assert.equal(result.body.pagination.total,1);
    assert.equal(result.body.data[0].miller_id,3);
    assert.equal(calls.length,2);
    for(const {sql,args} of calls){assert.match(sql,/a.source_id=\?/);assert.match(sql,/a.active=1/);assert.deepEqual(args,[153,2]);}
    await assert.rejects(listSourceMappings({user:{role,facility_id:153},query:{facility_id:'999'}}),e=>e.status===403);
  }
  for(const user of [{role:'MILLER',miller_id:3},{role:'ADMIN'},{role:'PACS'}])
    await assert.rejects(listSourceMappings({user,query:{}}),e=>e.status===403);
  await assert.rejects(listSourceMappings({user:{role:'PACS',facility_id:153},query:{season_id:'bad'}}));
});

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

test('Lifting accepts any active registered vehicle without Miller ownership',()=>{
  assert.doesNotThrow(()=>validateMappedVehicle({active:1},3));
  assert.doesNotThrow(()=>validateMappedVehicle({active:1,created_by:99},3));
  for(const vehicle of [null,{active:0}])
    assert.throws(()=>validateMappedVehicle(vehicle,3),e=>e.code==='INVALID_VEHICLE');
});


test('Common shipment schema supports both legs and scopes PACS to its PADDY source',()=>{
 const body={shipment_no:'TEST-1',leg:'PADDY',scheme_code:'SCMR',season_id:2,miller_id:3,source_id:153,destination_id:3,vehicle_id:4,quantity:{value:'10.125',unit:'QTL'}};
 assert.equal(grams(shipmentSchema.parse(body).quantity),1012500);
 assert.equal(shipmentSchema.parse({...body,leg:'CMR',order_id:5}).order_id,5);
 assert.throws(()=>shipmentSchema.parse({...body,lifted_kg:0}));
 assert.deepEqual(scopedWhere({role:'PACS',facility_id:153}),{sql:" AND s.leg='PADDY' AND EXISTS (SELECT 1 FROM shipment_routes scope_route WHERE scope_route.id=s.route_id AND scope_route.source_id=?)",params:[153]});
 assert.throws(()=>scopedWhere({role:'LAMPS'}),e=>e.status===403);
 assert.throws(()=>shipmentSchema.parse({...body,release_order_id:1}));
});
