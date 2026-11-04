import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {savedDefaults,saveResponseReferences,saveCmrDropdownReferences} from '../scripts/postman-saved-runtime.js';
import {cmrOrder} from '../src/validators/schemas.js';
import {errorHandler} from '../src/middlewares/errors.js';

function sandbox(collection={},environment={}){
  const c=new Map(Object.entries(collection)),e=new Map(Object.entries(environment));
  const scope=m=>({get:k=>m.get(k),set:(k,v)=>m.set(k,v),has:k=>m.has(k),unset:k=>m.delete(k)});
  const pm={collectionVariables:scope(c),environment:scope(e),variables:{
    get:k=>e.has(k)?e.get(k):c.get(k),
    replaceIn:s=>s.replace(/\{\{([^}]+)\}\}/g,(all,k)=>String(e.has(k)?e.get(k):c.get(k)??all))},
    request:{method:'GET',url:{toString:()=>'/api/v1/setup/postman'},body:{raw:'{}'}},
    response:{code:200,json:()=>({ok:true,data:{}})},execution:{skipRequest:()=>{pm.skipped=true;}}};
  return {pm,c,e,run:fn=>vm.runInNewContext(`(${fn.toString()})();`,{pm,console:{warn:()=>{},info:()=>{}}})};
}

test('saved setup replaces stale environment IDs and clears old core store and busy vehicle references',()=>{
  const s=sandbox({miller_id:9,vehicle_id:77,store_location_id:88},{miller_id:999,season_id:888});
  s.pm.response.json=()=>({ok:true,data:{ready_for_orders:true,ready_for_shipments:false,
    context:{miller_id:3,season_id:2,season_code:'KMS',miller_code:'MILL',destination_id:4,
      destination_code:'DEPOT',destination_kind:'FCI',district_id:5,pacs_id:6,pacs_code:'PACS'},
    vehicle:null,missing:['Vehicle busy']}});
  s.run(saveResponseReferences);
  assert.equal(s.e.get('miller_id'),3);assert.equal(s.e.get('season_id'),2);
  assert.equal(s.c.has('store_location_id'),false);assert.equal(s.c.has('vehicle_id'),false);
  assert.equal(s.c.get('setup_ready'),'true');assert.equal(s.c.get('setup_shipments_ready'),'false');
});

test('defaults persist a source order number and do not reset the run identity',()=>{
  const s=sandbox({run_id:'existing',cmr_order_no:'20095/CAPL/25-26/M53626'});
  s.run(savedDefaults);s.run(savedDefaults);
  assert.equal(s.c.get('run_id'),'existing');assert.equal(s.c.get('cmr_order_no'),'20095/CAPL/25-26/M53626');
});

test('repeated Admin login preserves existing vehicle, dates and setup IDs',()=>{
  const collection=JSON.parse(fs.readFileSync('postman/SFC_CMR.postman_collection.json','utf8'));
  const login=collection.item.find(i=>i.name==='Login').item.find(i=>/Login administrator/.test(i.name));
  const script=login.event.find(e=>e.listen==='prerequest').script.exec.join('\n');
  const s=sandbox({run_id:'persist',vehicle_no:'JH10AF5535',order_at:'2026-02-26T10:00:00Z'});
  for(let i=0;i<2;i++)vm.runInNewContext(script,{pm:s.pm,console});
  assert.equal(s.c.get('run_id'),'persist');assert.equal(s.c.get('vehicle_no'),'JH10AF5535');
  assert.equal(s.c.get('order_at'),'2026-02-26T10:00:00Z');
});

test('push requests are independent of failed saved setup; shipment guards remain',()=>{
  const s=sandbox({setup_attempted:'true',setup_ready:'false'});
  s.pm.request.method='POST';s.pm.request.url.toString=()=>'/api/v1/integrations/euparjan/cmr-orders';
  assert.doesNotThrow(()=>s.run(savedDefaults));assert.notEqual(s.pm.skipped,true);
  s.pm.request.url.toString=()=>'/api/v1/integrations/euparjan/procurements';
  assert.doesNotThrow(()=>s.run(savedDefaults));assert.notEqual(s.pm.skipped,true);
  s.pm.request.url.toString=()=>'/api/v1/shipments';
  assert.throws(()=>s.run(savedDefaults),/Load saved setup first/);assert.equal(s.pm.skipped,true);
});

test('CMR order accepts full source LotNo as order_no and validates new metadata',()=>{
  const body={external_ref:'CMR-1',scheme_code:'SCMR',commodity_code:'RICE',season_id:1,
    miller_id:3,destination_id:4,order_no:'20095/CAPL/25-26/M53626',
    ordered_at:'2026-02-25T10:00:00Z',due_date:'2026-02-26',rice_quantity:{value:290},
    district_id:5,lot_count:2,stenciling_code:'GML/JSFC/COR/004/2025-26'};
  assert.equal(cmrOrder.parse(body).order_no,body.order_no);
  assert.equal(cmrOrder.safeParse({...body,lot_count:0}).success,false);
  assert.equal(cmrOrder.safeParse({...body,lot_no:body.order_no}).success,false);
});

test('foreign-key errors identify the missing field without exposing SQL or database name',()=>{
  let status,body;
  const res={headersSent:false,status:n=>(status=n,res),json:v=>{body=v;},set:()=>{}};
  errorHandler({code:'ER_NO_REFERENCED_ROW_2',sqlMessage:'FOREIGN KEY (`miller_id`) REFERENCES `private_db`.`facilities` (`id`)'},
    {requestId:'test',method:'POST',url:'/api/v1/example'},res,()=>{});
  assert.equal(status,400);assert.equal(body.error.code,'REFERENCE_NOT_FOUND');
  assert.match(body.error.message,/miller_id.*facilities/);assert.doesNotMatch(body.error.message,/private_db|FOREIGN KEY/);
  errorHandler({code:'ER_ROW_IS_REFERENCED_2'},{requestId:'test'},res,()=>{});
  assert.equal(status,409);assert.equal(body.error.code,'RECORD_IN_USE');
});

test('CMR season change preserves independent district and clears stale store/order references across both scopes',()=>{
  const s=sandbox({season_id:2,scheme_code:'SCMR',district_id:10,destination_id:20,store_location_id:30,
    order_id:40,cmr_order_id:40,cmr_dropdown_context:JSON.stringify({season_id:1,scheme_code:'SCMR',district_id:10,destination_id:20})},{order_id:999});
  s.pm.request.url.toString=()=>'/api/v1/cmr/submission-options?only=districts&season_id=2&scheme_type=SCMR';
  s.pm.response.json=()=>({ok:true,data:{districts:[{id:10,district_name:'Selected district'},{id:11,district_name:'Other district'}]}});
  s.run(saveCmrDropdownReferences);
  assert.equal(s.c.get('district_id'),10);assert.equal(s.c.has('store_location_id'),false);
  assert.equal(s.c.has('order_id'),false);assert.equal(s.e.has('order_id'),false);
});

test('CMR store selection saves core store ID and local destination separately; empty order list clears old IDs',()=>{
  const s=sandbox({season_id:1,scheme_code:'SCMR',district_id:5,store_location_id:101,destination_id:9,order_id:77});
  s.pm.request.url.toString=()=>'/api/v1/cmr/submission-options?only=stores&season_id=1&district_id=5&scheme_type=SCMR';
  s.pm.response.json=()=>({ok:true,data:{stores:[{id:101,facility_id:8},{id:102,facility_id:9}]}});
  s.run(saveCmrDropdownReferences);
  assert.equal(s.c.get('store_location_id'),101);assert.equal(s.c.get('destination_id'),8);
  s.pm.request.url.toString=()=>'/api/v1/cmr/submission-options?only=orders&season_id=1&destination_id=8&scheme_type=SCMR';
  s.pm.response.json=()=>({ok:true,data:{orders:[]}});s.run(saveCmrDropdownReferences);
  assert.equal(s.c.has('order_id'),false);assert.equal(s.c.has('cmr_order_id'),false);
});
