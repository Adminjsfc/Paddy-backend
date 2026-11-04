import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureDriver,ownerFacility,tripSummary} from '../src/services/drivers.service.js';
import {verifyPassword,scopedWhere} from '../src/utils/core.js';
import {driver,login,shipment,dispatch} from '../src/validators/schemas.js';
import {moduleGuard} from '../src/middlewares/module-access.js';
import {login as authenticate} from '../src/services/auth.service.js';
import {pool} from '../src/config/database.js';
import {passwordHash} from '../src/utils/core.js';
import {pendingAlerts} from '../src/services/driver-alerts.service.js';
import {tripView,eta} from '../src/services/driver-reports.service.js';

const context = {user:{id:2,role:'PACS',facility_id:153}};
const data = {name:'Driver One',phone:'9999999999'};
function database(existing) {
  const queries=[];
  return {queries,connection:{execute:async (sql,args) => {
    queries.push({sql,args});
    if(sql.startsWith('SELECT')) return [existing ? [existing] : []];
    return [{insertId:42}];
  }}};
}
test('New driver stores its initial password and separate login hash with creator facility ownership', async () => {
  for (const user of [context.user,{id:3,role:'LAMPS',facility_id:154},{id:4,role:'MILLER',miller_id:15}]) {
    const {connection,queries}=database();
    const result=await ensureDriver(connection,data,{user});
    assert.equal(result.created,true);
    assert.equal(result.initial_password,'1234567890');
    assert.equal(result.id,42);
    assert.equal(result.facility_id,user.miller_id ?? user.facility_id);
    const saved=queries.find(q=>q.sql.startsWith('INSERT INTO users'));
    assert(await verifyPassword(result.initial_password,saved.args[4]));
    const fields=saved.sql.match(/\(([^)]+)\)/)[1].split(',');
    assert.equal(saved.args[fields.indexOf('password')],result.initial_password);
    assert.notEqual(saved.args[fields.indexOf('password_hash')],result.initial_password);
    assert.equal(saved.args.at(-1),user.miller_id ?? user.facility_id);
    const owner=queries.find(q=>q.sql.startsWith('INSERT INTO driver_owners'));
    assert.deepEqual(owner.args,[42,user.miller_id ?? user.facility_id,user.id]);
  }
});
test('Existing driver is reused without resetting credentials or exposing a password', async () => {
  const {connection,queries}=database({id:7,...data,role:'DRIVER',active:1,facility_id:999});
  const result=await ensureDriver(connection,{...data,password:'IgnoredPassword123'},context);
  assert.equal(result.created,false);
  assert.equal(result.id,7);
  assert.equal(result.facility_id,999);
  assert(!Object.hasOwn(result,'initial_password'));
  assert(!queries.some(q=>/INSERT INTO users|UPDATE users/.test(q.sql)));
});

test('Explicit driver password is preserved instead of using the default password',async()=>{
  const {connection}=database();
  const password='CustomDriverPassword123';
  const result=await ensureDriver(connection,{...data,password},context);
  assert.equal(result.initial_password,password);
});
test('Inactive and non-driver contacts cannot be repurposed as drivers', async () => {
  for (const existing of [{role:'MILLER',active:1},{role:'DRIVER',active:0}]) {
    const {connection,queries}=database({id:1,...existing});
    await assert.rejects(ensureDriver(connection,data,context),e=>e.status===409);
    assert(!queries.some(q=>q.sql.startsWith('INSERT')));
  }
});
test('Only scoped PACS/LAMPS and Miller users can manage drivers', () => {
  for (const user of [{role:'DRIVER'},{role:'ADMIN'},{role:'TRANSPORTER'},{role:'PACS'},{role:'MILLER'}])
    assert.throws(()=>ownerFacility(user),e=>e.status===403);
  assert.equal(driver.safeParse({...data,facility_id:123}).success,false);
});
test('Driver login accepts mobile and password while keeping email login compatible', () => {
  for(const identifier of [{phone:data.phone},{email:data.phone},{email:'admin@example.com'}])
    assert(login.safeParse({...identifier,password:'test'}).success);
  for(const identifier of [{},{phone:'bad'},{email:'bad'},{email:'a@example.com',phone:data.phone}])
    assert.equal(login.safeParse({...identifier,password:'test'}).success,false);
});
test('Driver access is limited to assigned shipments and cannot mutate data', async () => {
  const user={id:42,role:'DRIVER'};
  assert.deepEqual(scopedWhere(user),{sql:' AND s.driver_user_id=?',params:[42]});
  for(const path of ['/shipments','/shipments/12']) {
    let allowed=false;
    await moduleGuard({user,path,method:'GET'},null,()=>{allowed=true;});
    assert(allowed);
  }
  let summaryAllowed=false;
  await moduleGuard({user,path:'/tripsummary_for_driver',method:'POST'},null,()=>{summaryAllowed=true;});
  assert(summaryAllowed);
  for(const [method,path] of [['POST','/shipments'],['GET','/vehicles'],['GET','/reports/dashboard'],['POST','/shipments/1/dispatch']])
    await assert.rejects(moduleGuard({user,path,method},null,()=>assert.fail()),e=>e.status===403);
});

test('Driver summary uses session identity and converts counts to numbers',async t=>{
  const queries=[];
  t.mock.method(pool,'execute',async(sql,args)=>{
    queries.push({sql,args});
    return [[{total_trips:'3',active_trips:'1',completed_trips:'2'}]];
  });
  const result=await tripSummary({user:{id:42,role:'DRIVER'},body:{}});
  assert.deepEqual(result.body,{ok:true,data:{total_trips:3,active_trips:1,completed_trips:2}});
  assert.deepEqual(queries[0].args,[42]);
  await assert.rejects(tripSummary({user:{id:42,role:'DRIVER'},body:{driver_id:43}}),e=>e.status===403);
  await assert.rejects(tripSummary({user:{id:42,role:'ADMIN'},body:{}}),e=>e.status===403);
  assert.equal(queries.length,1);
});

test('Driver alert thresholds and ETA use actual timestamps without manufacturing ignition alerts',()=>{
  const now=Date.parse('2026-11-04T12:00:00Z');
  const row={gps_reference:'2026-11-04T11:45:00Z',expected_completion_at:null,registration_no:'JH10AF5535',shipment_no:'P-1'};
  assert.deepEqual(pendingAlerts(row,now,15),[]);
  const alerts=pendingAlerts({...row,gps_reference:'2026-11-04T11:44:59Z',expected_completion_at:'2026-11-04T11:00:00Z'},now,15);
  assert.deepEqual(alerts.map(a=>a.type),['GPS_OFFLINE','ETA_DELAYED']);
  assert.deepEqual(eta({expected_completion_at:null},now),{eta_state:'UNKNOWN',eta_status:null,eta_hours:null});
  assert.equal(eta({expected_completion_at:'2026-11-04T11:00:00Z'},now).eta_state,'DELAYED');
  assert.equal(eta({expected_completion_at:'2026-11-04T11:59:59Z'},now).eta_state,'DELAYED');
});

test('Driver trip view preserves zero receipt quantities, units and no-subtrip contract',()=>{
  const row={id:1,shipment_no:'P-1',quantity_kg:'1000.000',trip_status:2,total_bags:'20',received_bags:0,
    accepted_kg:'0.000',delivered_at:'2026-11-04T11:00:00Z',trip_completed_at:'2026-11-04T10:00:00Z',
    procurement_lots:'[]',source_name:'PACS',destination_name:'Miller',distance_km:'26.4',duration_minutes:'120'};
  const view=tripView(row);
  assert.equal(view.received_quantity,0);assert.equal(view.received_number_of_bags,0);
  assert.equal(view.quantity_unit,'KG');assert.equal(view.route_distance,26.4);assert.equal(view.route_time_duration,120);
  assert.equal(view.trip_date,null);assert.equal(view.completion_date,'2026-11-04T10:00:00Z');
  assert(!Object.hasOwn(view,'subtrips'));assert(!Object.hasOwn(view,'transporter_id'));
  assert.equal(tripView({...row,delivered_at:null}).received_quantity,null);
});
test('Shipment and dispatch accept driver_contact alias and reject conflicting contacts', () => {
  const body={shipment_no:'D-1',leg:'PADDY',scheme_code:'SCMR',season_id:1,miller_id:3,source_id:153,destination_id:3,vehicle_id:4,quantity:{value:10,unit:'QTL'},driver_name:data.name,driver_contact:data.phone};
  assert.equal(shipment.parse(body).driver_phone,data.phone);
  assert.equal(shipment.safeParse({...body,driver_phone:'8888888888'}).success,false);
  assert.equal(dispatch.parse({dispatched_at:'2026-01-01T10:00:00Z',receipt_no:'R-1',driver_contact:data.phone}).driver_phone,data.phone);
});

test('Driver mobile login verifies password and issues an existing-style session', async t => {
  const password='DriverPassword123';
  const encoded=await passwordHash(password);
  const queries=[];
  t.mock.method(pool,'execute',async (sql,args)=>{
    queries.push({sql,args});
    if(sql.startsWith('SELECT')) return [[{id:42,...data,role:'DRIVER',active:1,password_hash:encoded,password}]];
    return [{insertId:1}];
  });
  const result=await authenticate({body:{phone:data.phone,password}});
  assert.equal(result.body.data.user.role,'DRIVER');
  assert.equal(result.body.data.token.length,64);
  assert(!Object.hasOwn(result.body.data.user,'password_hash'));
  assert(!Object.hasOwn(result.body.data.user,'password'));
  assert.match(queries[0].sql,/u.phone=\? AND u.role='DRIVER'/);
  assert.deepEqual(queries[0].args,[data.phone]);
  assert(queries.some(q=>q.sql.startsWith('INSERT INTO sessions')));
  await assert.rejects(authenticate({body:{phone:data.phone,password:'wrong'}}),e=>e.status===401);
});
