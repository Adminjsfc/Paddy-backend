import test from 'node:test';
import assert from 'node:assert/strict';
import {procurement} from '../src/validators/schemas.js';
import {pushProcurementInsertProcurement} from '../src/repositories/procurement.repository.js';

const body={external_ref:'TX-RO-1',scheme_code:'SCMR',commodity_code:'PADDY',season_code:'KMS',
  miller_id:3,facility_code:'PACS',procured_at:'2026-02-27T10:00:00Z',quantity:{value:'426.47'},
  ro_no:'DHN/KRP/34/KMS 2025-26/206',ro_date:'2026-02-26'};

test('procurement accepts separate RO number and date without requiring them on older imports',()=>{
  const parsed=procurement.parse(body);
  assert.equal(parsed.ro_no,body.ro_no);assert.equal(parsed.ro_date,'2026-02-26');
  assert.equal(procurement.safeParse({...body,ro_date:'26-02-2026'}).success,false);
  assert.equal(procurement.safeParse({...body,ro_date:'2026-02-30'}).success,false);
  const {ro_no,ro_date,...legacy}=body;
  assert(!Object.hasOwn(procurement.parse(legacy),'ro_no'));
  assert.equal(procurement.safeParse({...body,ro_no:null,ro_date:null}).success,true);
  assert.equal(procurement.safeParse({...body,receipt_no:'OLD-RECEIPT'}).success,false);
});

test('RO fields are bound to the procurement insert with date-only value',async()=>{
  let query,values;
  await pushProcurementInsertProcurement({execute:async(sql,args)=>{
    query=sql;values=args;return [{insertId:1}];
  }},procurement.parse(body),'digest',{id:1},null,{id:2,district_id:17},426.47,{scheme_code:'SCMR',commodity_code:'PADDY'});
  const fields=query.match(/\(([^)]+)\)/)[1].split(',');
  assert.equal(values[fields.indexOf('ro_no')],body.ro_no);
  assert.equal(values[fields.indexOf('ro_date')],'2026-02-26');
  assert.equal(values[fields.indexOf('district_id')],17);
  assert.equal(values[fields.indexOf('miller_id')],3);
  assert(!fields.includes('receipt_no'));
  assert.equal((query.match(/\?/g)||[]).length,values.length);
});

test('new RO imports require a positive local allotted miller ID',()=>{
  const {miller_id,...missing}=body;
  assert.equal(procurement.safeParse(missing).success,false);
  for(const invalid of [0,-1,null,'20020'])assert.equal(procurement.safeParse({...body,miller_id:invalid}).success,false);
});
