import test from 'node:test';
import assert from 'node:assert/strict';
import {checkLocationPrerequisites} from '../scripts/location-prerequisites.js';

function connection(overrides={}) {
  return {async execute(sql,[table]) {
    const schema={engine:'InnoDB',type:'int',columnType:'int(11)',indexed:true,...overrides[table]};
    if(sql.includes('information_schema.TABLES'))return [schema.missing?[]:[{ENGINE:schema.engine}]];
    if(sql.includes('information_schema.COLUMNS'))return [[{DATA_TYPE:schema.type,COLUMN_TYPE:schema.columnType}]];
    if(sql.includes('information_schema.STATISTICS'))return [schema.indexed?[{INDEX_NAME:'PRIMARY'}]:[]];
    throw new Error(`Unexpected query: ${sql}`);
  }};
}

test('Accept compatible location master tables',async()=>{
  await checkLocationPrerequisites(connection());
});

for(const table of ['tbl_district_master','tbl_block_master']) {
  for(const [name,override,message] of [
    ['missing table',{missing:true},/Missing location master table/],
    ['wrong engine',{engine:'MyISAM'},/must use InnoDB/],
    ['unsigned ID',{columnType:'int unsigned'},/must match the signed INT/],
    ['wrong integer size',{type:'bigint',columnType:'bigint'},/must match the signed INT/],
    ['missing index',{indexed:false},/needs an index/]
  ])test(`Reject ${table}: ${name}`,async()=>{
    await assert.rejects(checkLocationPrerequisites(connection({[table]:override})),message);
  });
}
