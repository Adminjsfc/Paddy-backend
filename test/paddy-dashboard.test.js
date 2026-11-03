import test from 'node:test';
import assert from 'node:assert/strict';
import {pool} from '../src/config/database.js';
import {sourceLiftingSummary} from '../src/services/paddy-orders.service.js';
import {listProcurements} from '../src/services/procurement.service.js';
import {listAvailableLots} from '../src/services/reports.service.js';

test('PACS and LAMPS procurement and available lots are limited to their own Paddy source',async()=>{
  const original=pool.execute,calls=[];
  pool.execute=async(sql,args)=>{calls.push({sql,args});return [sql.includes('COUNT(')?[{total:0}]:[]];};
  try {
    for(const role of ['PACS','LAMPS'])for(const read of [listProcurements,listAvailableLots])for(const facility_id of [undefined,'153']) {
      calls.length=0;
      await read({user:{role,facility_id:153},query:{season_id:'2',scheme_code:'SCMR',...(facility_id?{facility_id}:{})}});
      assert.equal(calls.length,read===listAvailableLots?1:2);
      for(const {sql,args} of calls) {
        assert.match(sql,/p.facility_id=\?/);assert.match(sql,/p.commodity_code='PADDY'/);
        assert.deepEqual(args.map(String),read===listAvailableLots?['153','2']:['153','2','SCMR']);
        assert.equal((sql.match(/\?/g)||[]).length,args.length);
        assert.doesNotMatch(sql,/FROM route_tags/);
      }
      assert.match(calls.at(-1).sql,/unreserved_g/);
      if(read===listAvailableLots)assert.match(calls[0].sql,/p.available_g>p.reserved_g/);
    }
    calls.length=0;
    for(const role of ['PACS','LAMPS'])for(const read of [listProcurements,listAvailableLots]){
      await assert.rejects(read({user:{role,facility_id:153},query:{facility_id:'999',season_id:'2'}}),e=>e.status===403);
      await assert.rejects(read({user:{role},query:{season_id:'2'}}),e=>e.status===403);
    }
    assert.equal(calls.length,0);
  }finally{pool.execute=original;}
});

test('Miller available procurement still requires a source mapping',async()=>{
  const original=pool.execute,calls=[];
  pool.execute=async(sql,args)=>{calls.push({sql,args});return [[]];};
  try{
    await assert.rejects(listAvailableLots({user:{role:'MILLER',miller_id:3},query:{facility_id:'153',season_id:'2'}}),e=>e.status===404);
    assert.equal(calls.length,1);assert.match(calls[0].sql,/FROM route_tags/);assert.deepEqual(calls[0].args,[153,3,2]);
  }finally{pool.execute=original;}
});

test('Available Paddy dropdown returns all lots across schemes without pagination',async t=>{
  const records=Array.from({length:75},(_,index)=>({id:index+1,scheme_code:index%2?'SCMR':'CCMR'}));
  const calls=[];
  t.mock.method(pool,'execute',async(sql,args)=>{calls.push({sql,args});return [records];});
  const {body}=await listAvailableLots({user:{role:'PACS',facility_id:153},query:{season_id:'2',scheme_code:'SCMR',page:'1',limit:'50'}});
  assert.equal(body.data.length,75);
  assert(body.data.some(row=>row.scheme_code==='CCMR'));
  assert.equal(Object.hasOwn(body,'pagination'),false);
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].args,[153,2]);
  assert.doesNotMatch(calls[0].sql,/\bLIMIT\b|\bOFFSET\b|p\.scheme_code=\?/);
});

test('Paddy report returns procurement records once even when several Millers are mapped',async()=>{
 const original=pool.execute,calls=[];
 pool.execute=async(sql,args)=>{
  calls.push({sql,args});
  if(sql.startsWith('SELECT COUNT(p.id)'))return [[{procurement_count:3,quantity_g:600000,available_g:500000,reserved_g:100000,unreserved_g:400000}]];
  if(sql.includes('FROM route_tags r'))return [[{route_tag_id:1,season_id:2,miller_id:3,miller_name:'Mill A'},
   {route_tag_id:2,season_id:2,miller_id:4,miller_name:'Mill B'},
   {route_tag_id:3,season_id:2,miller_id:4,miller_name:'Mill B'}]];
  return [[{id:11,facility_id:153,season_id:2,scheme_code:'SCMR',quantity_g:100000},
   {id:12,facility_id:153,season_id:2,scheme_code:'SCMR',quantity_g:200000},
   {id:13,facility_id:153,season_id:3,scheme_code:'CCMR',quantity_g:300000}]];
 };
 try{
  const {body}=await sourceLiftingSummary({user:{role:'PACS',facility_id:153},query:{source_id:'999'}});
  assert.equal(body.quantity_scope,'SOURCE_PROCUREMENT');assert.equal(body.pagination.total,3);
  assert.deepEqual(body.data.map(row=>row.id),[11,12,13]);
  assert.deepEqual(body.data.map(row=>row.procurement_ids),[[11],[12],[13]]);
  assert.deepEqual(body.data[0].mapped_millers.map(m=>m.miller_id),[3,4]);
  assert.deepEqual(body.data[1].mapped_millers.map(m=>m.miller_id),[3,4]);
  assert.deepEqual(body.data[2].mapped_millers,[]);assert.equal(body.data[2].has_route_tag,false);
  assert.equal(body.totals.quantity_g,600000);assert.equal(body.totals.unreserved_g,400000);
  assert.equal(calls.length,3);assert.deepEqual(calls[0].args,[153]);assert.deepEqual(calls[1].args,[153]);assert.deepEqual(calls[2].args,[153,2,3]);
  for(const {sql,args} of calls){assert.doesNotMatch(sql,/shipment|lifted_g|pending_g/i);assert.equal((sql.match(/\?/g)||[]).length,args.length);}
  assert.doesNotMatch(calls[0].sql,/route_tags/);assert.doesNotMatch(calls[1].sql,/route_tags|GROUP BY/);
 }finally{pool.execute=original;}
});

test('Procurement report keeps source scope with optional season/scheme filters',async()=>{
 const original=pool.execute,calls=[];
 pool.execute=async(sql,args)=>{calls.push({sql,args});return [sql.startsWith('SELECT COUNT(p.id)')?[{procurement_count:0,quantity_g:0}]:[]];};
 try{
  for(const role of ['PACS','LAMPS'])for(const [query,expected] of [[{},[153]],[{season_id:'',scheme_code:''},[153]],[{season_id:'2'},[153,2]],[{scheme_code:'CCMR'},[153,'CCMR']],[{season_id:'2',scheme_code:'SCMR'},[153,2,'SCMR']]]){
   calls.length=0;const result=await sourceLiftingSummary({user:{role,facility_id:153},query});assert.equal(result.body.ok,true);assert.equal(calls.length,2);
   for(const {sql,args} of calls){assert.deepEqual(args,expected);assert.equal((sql.match(/\?/g)||[]).length,args.length);assert.equal(sql.includes('p.season_id=?'),Boolean(query.season_id));assert.equal(sql.includes('p.scheme_code=?'),Boolean(query.scheme_code));assert.match(sql,/p.facility_id=\?/);assert.match(sql,/p.commodity_code='PADDY'/);}
  }
  calls.length=0;
  for(const user of [{role:'MILLER',miller_id:3},{role:'ADMIN'},{role:'PACS'}])await assert.rejects(sourceLiftingSummary({user,query:{}}),e=>e.status===403);
  for(const query of [{season_id:'bad'},{season_id:'2',limit:201}])await assert.rejects(sourceLiftingSummary({user:{role:'PACS',facility_id:153},query}));
  assert.equal(calls.length,0);
 }finally{pool.execute=original;}
});

test('Unmapped procurements stay visible and pagination counts receipts instead of Miller mappings',async()=>{
 const original=pool.execute,calls=[];
 pool.execute=async(sql,args)=>{calls.push({sql,args});return [sql.startsWith('SELECT COUNT(p.id)')?[{procurement_count:5,quantity_g:500000,available_g:500000,reserved_g:0,unreserved_g:500000}]:sql.includes('FROM route_tags r')?[]:[{id:91,facility_id:153,season_id:7,scheme_code:'SCMR'}]];};
 try{
  const {body}=await sourceLiftingSummary({user:{role:'LAMPS',facility_id:153},query:{page:'2',limit:'1'}});
  assert.equal(body.data.length,1);assert.equal(body.data[0].id,91);assert.deepEqual(body.data[0].mapped_millers,[]);assert.equal(body.data[0].has_route_tag,false);
  assert.equal(body.pagination.total,5);assert.equal(body.pagination.page,2);assert.equal(body.totals.quantity_g,500000);
  assert.match(calls[1].sql,/ORDER BY p.procured_at DESC,p.id DESC LIMIT 1 OFFSET 1/);
 }finally{pool.execute=original;}
});
import {dashboardVehicles} from '../src/repositories/reports.repository.js';
import {liftingMillers,liftingVehicles} from '../src/services/paddy-orders.service.js';
import {listMappedSources} from '../src/repositories/paddy-orders.repository.js';
import {listStocks,listLedger} from '../src/services/reports.service.js';
import {getSubmissionOptionsFindStocks,getSubmissionOptionsListCmrOrders} from '../src/repositories/cmr-submissions.repository.js';

test('PACS and LAMPS stock and ledger reports keep facility scope with scheme filters',async()=>{
  const original=pool.execute,calls=[];
  pool.execute=async(sql,args)=>{calls.push({sql,args});return [sql.includes('COUNT(')?[{total:0}]:[]];};
  try {
    for(const role of ['PACS','LAMPS']){
      for(const read of [listStocks,listLedger]){
        calls.length=0;
        await read({user:{role,facility_id:153},query:{facility_id:'999',scheme_code:'CCMR'}});
        assert.equal(calls.length,2);
        for(const call of calls){
          assert.deepEqual(call.args,[153,'999','CCMR']);
          assert.equal((call.sql.match(/facility_id=\?/g)||[]).length,2);
          assert.match(call.sql,/[sl].scheme_code=\?/);
        }
      }
    }
    await assert.rejects(listLedger({user:{role:'PACS'},query:{}}),e=>e.status===403);
  }finally{pool.execute=original;}
});

test('CMR options select the chosen scheme for both stock and orders',async()=>{
  const original=pool.execute,calls=[];
  pool.execute=async(sql,args)=>{calls.push({sql,args});return [[]];};
  try {
    const context={user:{role:'MILLER',miller_id:3}};
    await getSubmissionOptionsFindStocks(context,2,'CCMR');
    await getSubmissionOptionsListCmrOrders(context,2,'CCMR');
    for(const call of calls){
      assert.deepEqual(call.args,[3,2,'CCMR']);
      assert.match(call.sql,/(?:s.scheme_code|o.scheme_code)=\?/);
      assert.equal((call.sql.match(/\?/g)||[]).length,call.args.length);
    }
  }finally{pool.execute=original;}
});

test('PACS vehicle lookup validates the source, season and mapped Miller without an RO',async()=>{
  const original=pool.execute,calls=[];
  let mapped=true;
  pool.execute=async(sql,args)=>{
    calls.push({sql,args});
    return [sql.includes('SELECT r.id')?(mapped?[{id:1}]:[]):[{id:4}]];
  };
  try {
    const context={user:{role:'PACS',facility_id:153},query:{miller_id:'3',season_id:'2'}};
    await liftingMillers(context);
    assert.deepEqual(calls[0].args,[153,2]);
    const result=await liftingVehicles(context);
    assert.equal(result.body.data[0].id,4);
    assert.deepEqual(calls[1].args,[153,3,2]);
    assert.deepEqual(calls[2].args,[]);
    mapped=false;
    await assert.rejects(liftingVehicles(context),e=>e.status===403);
    assert.equal(calls.length,4);
    await assert.rejects(liftingVehicles({...context,user:{role:'MILLER',miller_id:3}}),e=>e.status===403);
    await assert.rejects(liftingVehicles({...context,query:{miller_id:'3'}}));
    assert.equal(calls.length,4);
  }finally{pool.execute=original;}
});

test('Paddy overview uses procurement stock and counts all dispatched trips without RO links',async()=>{
  const original=pool.execute,calls=[];
  pool.execute=async(sql,args)=>{calls.push({sql,args});return [sql.includes('COUNT(')?[{total:1}]:[]];};
  try {
    await listMappedSources(3,2,{limit:20,offset:0});
    for(const {sql,args} of calls){
      assert.doesNotMatch(sql,/release_order/);
      assert.match(sql,/FROM procurement/);
      assert.match(sql,/lr.destination_id=m.destination_id/);
      assert.deepEqual(args,[3,2]);
    }
    assert.match(calls[1].sql,/available_g liftable_g/);
  }finally{pool.execute=original;}
});

test('Vehicle dashboard reads separate IMEI master and scopes totals and rows to the Miller',async()=>{
  const original=pool.execute, calls=[];
  pool.execute=async(sql,args)=>{calls.push({sql,args});return [sql.includes('COUNT(')?[{total:1}]:[{id:4,imei:'123456789012345',provider:'test'}]];};
  try {
    const result=await dashboardVehicles(7,2,{limit:20,offset:0});
    assert.equal(result.data[0].imei,'123456789012345');
    assert.equal(calls.length,2);
    for(const call of calls){
      assert.match(call.sql,/JOIN imeis i ON i.id=d.imei_id/);
      assert.match(call.sql,/assigned.miller_id=\?/);
      assert.deepEqual(call.args,[7,2,7]);
    }
    assert.match(calls[1].sql,/i.imei,i.provider/);
    assert.doesNotMatch(calls[1].sql,/d.imei,/);
  }finally{pool.execute=original;}
});
