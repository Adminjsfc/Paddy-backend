import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureDriver,ownerFacility} from '../src/services/drivers.service.js';
import {verifyPassword,scopedWhere} from '../src/utils/core.js';
import {driver,login,shipment,dispatch} from '../src/validators/schemas.js';
import {moduleGuard} from '../src/middlewares/module-access.js';
import {login as authenticate} from '../src/services/auth.service.js';
import {pool} from '../src/config/database.js';
import {passwordHash} from '../src/utils/core.js';

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
test('New driver receives a hashed random password and creator facility ownership', async () => {
  for (const user of [context.user,{id:3,role:'LAMPS',facility_id:154},{id:4,role:'MILLER',miller_id:15}]) {
    const {connection,queries}=database();
    const result=await ensureDriver(connection,data,{user});
    assert.equal(result.created,true);
    assert.equal(result.id,42);
    assert.equal(result.facility_id,user.miller_id ?? user.facility_id);
    const saved=queries.find(q=>q.sql.startsWith('INSERT INTO users'));
    assert(await verifyPassword(result.initial_password,saved.args[4]));
    assert(!saved.args.includes(result.initial_password));
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
  for(const [method,path] of [['POST','/shipments'],['GET','/vehicles'],['GET','/reports/dashboard'],['POST','/shipments/1/dispatch']])
    await assert.rejects(moduleGuard({user,path,method},null,()=>assert.fail()),e=>e.status===403);
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
    if(sql.startsWith('SELECT')) return [[{id:42,...data,role:'DRIVER',active:1,password_hash:encoded}]];
    return [{insertId:1}];
  });
  const result=await authenticate({body:{phone:data.phone,password}});
  assert.equal(result.body.data.user.role,'DRIVER');
  assert.equal(result.body.data.token.length,64);
  assert(!Object.hasOwn(result.body.data.user,'password_hash'));
  assert.match(queries[0].sql,/phone=\? AND role='DRIVER'/);
  assert.deepEqual(queries[0].args,[data.phone]);
  assert(queries.some(q=>q.sql.startsWith('INSERT INTO sessions')));
  await assert.rejects(authenticate({body:{phone:data.phone,password:'wrong'}}),e=>e.status===401);
});
