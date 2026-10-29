import test from 'node:test';
import assert from 'node:assert/strict';
import {pool} from '../src/config/database.js';
import {sourceLiftingSummary} from '../src/services/paddy-orders.service.js';

test('Source Paddy summary scopes all queries and separates shared totals from miller rows',async()=>{
  const original=pool.execute,calls=[];
  pool.execute=async(sql,args)=>{
    calls.push({sql,args});
    if(sql.startsWith('SELECT COALESCE(SUM(target_g)')) return [[{target_g:1000000,lifted_g:300000,pending_g:700000}]];
    if(sql.startsWith('SELECT COUNT(')) return [[{total:2}]];
    return [[{miller_id:3,target_g:1000000,pending_g:700000,lifted_g:200000},
      {miller_id:4,target_g:1000000,pending_g:700000,lifted_g:100000}]];
  };
  try {
    for(const role of ['PACS','LAMPS']) {
      calls.length=0;
      const {body}=await sourceLiftingSummary({user:{role,facility_id:153},query:{season_id:'2',source_id:'999',scheme_code:'SCMR'}});
      assert.equal(body.totals.target_g,1000000);
      assert.equal(body.pagination.total,2);
      assert.equal(body.data.length,2);
      assert.equal(body.quantity_scope,'SOURCE_SEASON_SCHEME');
      for(const {sql,args} of calls) {
        assert.deepEqual(args,[153,2,'SCMR']);
        assert.equal((sql.match(/\?/g)||[]).length,args.length);
        assert.match(sql,/co.code='PADDY'/);
        assert.match(sql,/status IN \('DISPATCHED','IN_TRANSIT','ARRIVED','DELIVERED'\)/);
      }
      assert.doesNotMatch(calls[0].sql,/JOIN facilities m/);
      assert.match(calls[2].sql,/m.address miller_address/);
    }
    calls.length=0;
    for(const user of [{role:'MILLER',miller_id:3},{role:'ADMIN'},{role:'PACS'}])
      await assert.rejects(sourceLiftingSummary({user,query:{season_id:'2'}}),e=>e.status===403);
    for(const query of [{},{season_id:'bad'},{season_id:'2',limit:201}])
      await assert.rejects(sourceLiftingSummary({user:{role:'PACS',facility_id:153},query}));
    assert.equal(calls.length,0);
  } finally {pool.execute=original;}
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
          assert.match(call.sql,/sc.code=\?/);
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
      assert.match(call.sql,/(?:sc.code|o.scheme_code)=\?/);
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
    assert.deepEqual(calls[2].args,[3]);
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
      assert.match(sql,/l.destination_id=m.destination_id/);
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
      assert.match(call.sql,/WHERE COALESCE\(v.miller_id,t.miller_id\)=\?/);
      assert.deepEqual(call.args,[2,7]);
    }
    assert.match(calls[1].sql,/i.imei,i.provider/);
    assert.doesNotMatch(calls[1].sql,/d.imei,/);
  }finally{pool.execute=original;}
});
