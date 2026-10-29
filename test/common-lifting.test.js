import test from 'node:test';
import assert from 'node:assert/strict';
import {createShipment,dispatchShipment} from '../src/services/shipments.service.js';
import {migrateCommonLifting,removeLegacyLiftingTable} from '../scripts/common-lifting-migration.js';
import {shipment} from '../src/validators/schemas.js';
import {procurementBatch} from '../src/validators/schemas.js';
import {importProcurements} from '../src/services/procurement.service.js';

test('Procurement import identifies the only the missing field and supplied value',async()=>{
 const record={external_ref:'MISSING-MASTER',scheme_code:'SCMR',commodity_code:'PADDY',season_code:'KMS',facility_code:'LAMPS-REAL-CODE',procured_at:new Date('2026-01-02T10:00:00Z'),quantity:{value:200,unit:'QTL'},receipt_no:'TEST',moisture_percent:null};
 for(const [table,errorCode,field] of [['schemes','SCHEME_NOT_FOUND','scheme_code'],['commodities','COMMODITY_NOT_FOUND','commodity_code'],['seasons','SEASON_NOT_FOUND','season_code'],['facilities','PADDY_SOURCE_NOT_FOUND','facility_code']]){
  const connection={execute:async(sql)=>{
   if(sql.includes('FROM procurement')||sql.includes('FROM '+table))return [[]];
   if(sql.includes('FROM seasons'))return [[{id:1,start_date:'2026-01-01',end_date:'2026-12-31'}]];
   return [[{id:1}]];
  }};
  await assert.rejects(importProcurements(connection,{records:[record]}),error=>{
   assert.equal(error.code,errorCode);assert.equal(error.status,404);
   assert(error.message.startsWith(field+'='+record[field]+':'));
   assert(!error.message.includes('records['));assert(!error.message.includes('external_ref'));
   return true;
  });
 }
});

test('Repeated procurement reference reports stored and received quantity on conflict',async()=>{
 const connection={execute:async()=>[[{id:1,payload_hash:'different',quantity_g:10000000}]]};
 await assert.rejects(importProcurements(connection,{records:[{external_ref:'ALREADY-IMPORTED',quantity:{value:200,unit:'QTL'}}]}),error=>{
  assert.equal(error.code,'EXTERNAL_REF_CONFLICT');
  assert.match(error.message,/^quantity mismatch: stored=100 QTL, received=200 QTL\.$/);
  return true;
 });
});

test('Star-wrapped Postman codes identify the invalid field with a useful hint',()=>{
 const result=procurementBatch.safeParse({records:[{external_ref:'TEST',season_code:'*KMS*',scheme_code:'*SCMR*',facility_code:'LAMPS-REAL',commodity_code:'PADDY',procured_at:'2026-01-02T10:00:00Z',quantity:{value:200,unit:'QTL'},receipt_no:'TEST'}]});
 assert.equal(result.success,false);
 for(const field of ['season_code','scheme_code']){
  const issue=result.error.issues.find(row=>row.path.join('.')==='records.0.'+field);
  assert(issue);assert.match(issue.message,/asterisks/);
 }
});

const body=()=>shipment.parse({shipment_no:'RO-1',leg:'PADDY',scheme_code:'SCMR',season_id:2,miller_id:3,source_id:153,destination_id:3,vehicle_id:4,quantity:{value:'10',unit:'QTL'}});
test('Shipment accepts driver details at creation and rejects incomplete contacts',()=>{
 const parsed=shipment.parse({...body(),driver_name:'Paddy Driver',driver_phone:'9999999999'});
 assert.equal(parsed.driver_name,'Paddy Driver');assert.equal(parsed.driver_phone,'9999999999');
 assert.throws(()=>shipment.parse({...body(),driver_name:'Paddy Driver'}));
 assert.throws(()=>shipment.parse({...body(),driver_phone:'9999999999'}));
 assert.throws(()=>shipment.parse({...body(),driver_name:'Paddy Driver',driver_phone:'wrong'}));
});
test('Expected completion accepts offset timestamps and trip actuals remain server controlled',()=>{
 const expected='2026-10-22T18:30:00+05:30';
 const parsed=shipment.parse({...body(),expected_completion_at:expected});
 assert.equal(parsed.expected_completion_at.toISOString(),'2026-10-22T13:00:00.000Z');
 assert.throws(()=>shipment.parse({...body(),expected_completion_at:'2026-10-22 18:30:00'}));
 for(const field of ['trip_status','trip_started_at','trip_completed_at'])assert.throws(()=>shipment.parse({...body(),[field]:1}));
});
function database({mapped=true,stock=2000000,lots=2000000}={}) {
 const queries=[];
 const connection={execute:async(sql,args)=>{
  queries.push({sql,args});
  if(sql.startsWith('SELECT id,latitude,longitude FROM facilities'))return [[{id:153,latitude:23,longitude:85},{id:3,latitude:23,longitude:85}]];
  if(sql.includes('FROM shipment_routes'))return [[{id:9,status:1,source_lat:23,source_lng:85,destination_lat:23,destination_lng:85,
   encoded_polyline:'_p~iF~ps|U_ulLnnqC_mqNvxq`@',geometry:{type:'LineString',coordinates:[[85,23],[85.01,23.01]]},distance_km:1.2,duration_minutes:3,created_at:new Date()}]];
  if(sql.includes('JOIN shipment_routes r'))return [[{distance_km:1.2,duration_minutes:3}]];
  if(sql.includes('FROM schemes')||sql.includes('FROM commodities'))return [[{id:1}]];
  if(sql.includes(' FROM seasons '))return [[{id:2,recovery_percent:68}]];
  if(sql==='SELECT id FROM facilities WHERE id=? FOR UPDATE')return [[{id:args[0]}]];
  if(sql.includes(' FROM facilities '))return [[{id:args[0],kind:args[0]===153?'PACS':'MILLER',district_id:1,block_id:1,latitude:23,longitude:85,radius_m:200}]];
  if(sql.includes('FROM route_tags'))return [mapped?[{id:1}]:[]];
  if(sql.includes('FROM vehicles'))return [[{id:4,vehicle_type_id:7,miller_id:3,active:1,transporter_active:1,capacity_g:3000000}]];
  if(sql.includes('FROM gps_devices'))return [[{id:1}]];
  if(sql.includes('FROM shipment_details'))return [[]];
  if(sql.includes(' FROM stocks '))return [[{id:1,status:1,on_hand_g:stock,reserved_g:0}]];
  if(sql.startsWith('SELECT p.id,p.available_g'))return [[{id:8,available_g:lots,reserved_g:0}]];
  if(sql.includes('FROM procurement p '))return [[{id:8,facility_id:153,season_id:2,scheme_id:1,commodity_id:1,scheme_code:'SCMR',commodity:'PADDY',available_g:lots,reserved_g:0}]];
  if(sql.startsWith('INSERT')||sql.startsWith('UPDATE'))return [{insertId:20}];
  throw new Error('Unexpected query: '+sql);
 }};
 return {connection,queries};
}
test('PACS and Miller create PADDY from mapped procurement stock without a release order',async()=>{
 for(const user of [{role:'PACS',facility_id:153},{role:'LAMPS',facility_id:153},{role:'MILLER',miller_id:3}]){
  const {connection,queries}=database();
  const result=await createShipment(connection,body(),{user:{...user,id:1}});
  assert.equal(result.status,'PLANNED');
  assert.equal(result.trip_status,0);assert.equal(result.trip_started_at,null);assert.equal(result.trip_completed_at,null);
  assert.equal(result.quantity_g,1000000);
  assert.equal(result.scheme_id,1);assert.equal(result.commodity_id,1);assert.equal(result.vehicle_type_id,7);
  const saved=queries.find(q=>q.sql.startsWith('INSERT INTO shipments '));
  assert(saved.sql.includes('scheme_id')&&saved.sql.includes('commodity_id')&&saved.sql.includes('vehicle_type_id'));
  assert(!/scheme_code|scheme_type|commodity_type|submitted_vehicle_type/.test(saved.sql));
  assert(queries.some(q=>q.sql.startsWith('INSERT INTO shipment_lots')&&q.args.includes(8)));
  assert(queries.some(q=>q.sql.startsWith('UPDATE procurement SET reserved_g')));
  assert(!queries.some(q=>/release_order/.test(q.sql)));
 }
});
test('PACS cannot create CMR or lift another facility stock',async()=>{
 const connection={execute:async()=>{throw new Error('Unexpected query');}};
 for(const [data,user] of [[{...body(),leg:'CMR'},{role:'PACS',facility_id:153}],[body(),{role:'LAMPS',facility_id:149}],[body(),{role:'PACS'}]])
  await assert.rejects(createShipment(connection,data,{user}),e=>e.status===403);
});

test('Shipment auto-creates and links driver accounts using the original creator scope',async()=>{
 for(const user of [{id:1,role:'PACS',facility_id:153},{id:2,role:'LAMPS',facility_id:153},{id:3,role:'MILLER',miller_id:3}]){
  const {connection,queries}=database();
  const execute=connection.execute;
  connection.execute=async(sql,args)=>sql.includes('FROM users WHERE phone=')?[[]]:execute(sql,args);
  const result=await createShipment(connection,{...body(),driver_name:'Trip Driver',driver_phone:'9999999999'},{user});
  assert.equal(result.driver_account.created,true);
  assert.equal(result.driver_user_id,20);
  const saved=queries.find(q=>q.sql.startsWith('INSERT INTO shipments '));
  const fields=saved.sql.match(/\(([^)]+)\)/)[1].split(',');
  assert.equal(fields.includes('source_id'),false);assert.equal(fields.includes('destination_id'),false);
  assert.equal(saved.args[fields.indexOf('route_id')],9);
  assert.equal(saved.args[fields.indexOf('driver_user_id')],20);
  const owner=queries.find(q=>q.sql.startsWith('INSERT INTO driver_owners'));
  assert.deepEqual(owner.args,[20,user.facility_id??user.miller_id,user.id]);
 }
});

test('Dispatch links an existing driver using saved shipment contact without issuing a new password',async()=>{
 const {connection,queries}=database();
 const execute=connection.execute;
 connection.execute=async(sql,args)=>{
  if(sql.includes('FROM users WHERE phone='))return [[{id:55,name:'Saved Driver',phone:'9999999999',role:'DRIVER',active:1}]];
  if(sql.startsWith('SELECT s.') && sql.includes('FROM shipment_details s'))return [[{id:20,leg:'PADDY',status:'PLANNED',miller_id:3,source_id:153,season_id:2,vehicle_id:4,quantity_g:1000000,scheme_code:'SCMR',driver_name:'Saved Driver',driver_phone:'9999999999'}]];
  if(sql.startsWith('SELECT active FROM facilities'))return [[{active:1}]];
  if(sql.includes('FROM shipment_lots'))return [[]];
  if(sql.includes(' FROM stocks '))return [[{id:1,status:1,on_hand_g:2000000,reserved_g:1000000}]];
  return execute(sql,args);
 };
 const result=await dispatchShipment(connection,{dispatched_at:new Date('2026-01-01T10:00:00Z'),receipt_no:'R-1'},{user:{id:1,role:'PACS',facility_id:153},params:{id:20}});
 assert.equal(result.driver_user_id,55);
 assert.equal(result.expected_completion_at.toISOString(),'2026-01-01T10:03:00.000Z');
 assert.equal(result.driver_account.created,false);
 assert(!Object.hasOwn(result.driver_account,'initial_password'));
 const update=queries.find(q=>q.sql.startsWith("UPDATE shipments SET status='DISPATCHED'"));
 assert.equal(update.args.at(-2),55);
});
test('Paddy still requires an active mapping, unreserved stock and procurement lots',async()=>{
 for(const [options,code] of [[{mapped:false},'PADDY_MAPPING_NOT_FOUND'],[{stock:500000},'INSUFFICIENT_STOCK'],[{lots:500000},'INSUFFICIENT_LOTS']]){
  const {connection}=database(options);
  await assert.rejects(createShipment(connection,body(),{user:{role:'PACS',facility_id:153}}),e=>{
   assert.equal(e.code,code);
   if(code==='PADDY_MAPPING_NOT_FOUND')assert.match(e.message,/source_id=153.*destination_id=3.*season_id=2/);
   if(code==='INSUFFICIENT_STOCK')assert.match(e.message,/Available=5 QTL; requested=10 QTL/);
   return true;
  });
 }
});

test('Common migration does not create a legacy table on a fresh installation',async()=>{
 const connection={execute:async()=>[[]],query:async()=>{throw new Error('Unexpected legacy query');}};
 await migrateCommonLifting(connection);
});
test('Common migration preserves legacy data and blocks untracked history',async()=>{
 const connection={execute:async()=>[[{TABLE_NAME:'paddy_liftings'}]],query:async()=>[[{id:8}]]};
 await assert.rejects(migrateCommonLifting(connection,true),/Legacy paddy lifting 8/);
});
test('Common migration copies existing linked RO IDs without deleting legacy history',async()=>{
 const queries=[];
 const connection={execute:async()=>[[{TABLE_NAME:'paddy_liftings'}]],query:async(sql)=>{queries.push(sql);return [[]];}};
 await migrateCommonLifting(connection,true);
 assert.equal(queries.length,1);
 await migrateCommonLifting(connection);
 assert.match(queries.at(-1),/UPDATE shipments.*release_order_id/);
 assert(!queries.some(sql=>/DROP|DELETE/.test(sql)));
});

test('Legacy table removal runs only after verifying shipment and dispatch data',async()=>{
 const queries=[];
 const connection={execute:async()=>[[{TABLE_NAME:'paddy_liftings'}]],query:async(sql)=>{queries.push(sql);return [[]];}};
 await removeLegacyLiftingTable(connection);
 assert.equal(queries.at(-1),'DROP TABLE paddy_liftings');
 assert.match(queries.at(-2),/dispatch_receipt/);
});
test('Legacy table removal stops if shipment dispatch data does not match',async()=>{
 const queries=[];
 const connection={execute:async()=>[[{TABLE_NAME:'paddy_liftings'}]],query:async(sql)=>{queries.push(sql);return [sql.includes('dispatch_receipt')?[{id:9}]:[]];}};
 await assert.rejects(removeLegacyLiftingTable(connection),/not fully represented/);
 assert(!queries.some(sql=>sql.startsWith('DROP')));
});
