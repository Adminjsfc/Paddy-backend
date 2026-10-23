import test from 'node:test';
import assert from 'node:assert/strict';
import {storeFacilityData} from '../scripts/store-facility-import.js';
const store={id:38,store_name:'BERMO GODOWN',store_type:2,district_id:355,rgi_block_code:2590,lat:23.763307,lng:86.000484,capacity:'1000',radius:'0.2',status:1};
const options={districts:new Map([[355,{district_name:'BOKARO'}]]),blocks:new Map([['355:2590',[{id:12,block_name:'Bermo'}]]]),code:'BKR01',capacityUnit:'MT',radiusUnit:'KM'};
test('Store import maps kinds, units and source block codes without mixing ID domains',()=>{
  const result=storeFacilityData(store,options);
  assert.deepEqual(result.problems,[]);
  assert.equal(result.data.kind,'SFC_GODOWN');assert.equal(result.data.capacity_g,1000000000);
  assert.equal(result.data.radius_m,200);assert.equal(result.data.block_id,12);assert.equal(result.data.core_store_id,38);
  assert.equal(result.data.created_by,null);
  assert.equal(storeFacilityData({...store,store_type:1,status:0},options).data.kind,'FCI');
  assert.equal(storeFacilityData({...store,status:0},options).data.active,0);
});
test('Store import skips invalid required data and preserves an unknown block as NULL',()=>{
  for(const override of [{capacity:null},{lat:null},{lng:181},{radius:'0'},{district_id:999},{store_name:''},{store_type:3}]) {
    assert(storeFacilityData({...store,...override},options).problems.length>0);
  }
  const unknown=storeFacilityData({...store,rgi_block_code:999},options);
  assert.equal(unknown.data.block_id,null);assert(unknown.warnings.length>0);
});
