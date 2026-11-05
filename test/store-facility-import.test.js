import test from 'node:test';
import assert from 'node:assert/strict';
import {storeFacilityData} from '../scripts/store-facility-import.js';
import {storeFacilityData as assignmentStoreData} from '../src/utils/store-facility.js';
const store={id:38,store_name:'BERMO GODOWN',store_type:2,district_id:355,rgi_block_code:2590,lat:23.763307,lng:86.000484,capacity:'1000',radius:'0.2',status:1};
const options={districts:new Map([[355,{district_name:'BOKARO'}]]),code:'BKR01',capacityUnit:'MT',radiusUnit:'KM'};
test('Store assignment allows an unspecified capacity without inventing a value',()=>{
  for(const capacity of [null,'',0]) {
    const result=assignmentStoreData({...store,capacity},{...options,allowMissingCapacity:true});
    assert.deepEqual(result.problems,[]);
    assert.equal(result.data.capacity_value,null);
    assert.equal(result.data.capacity_unit,null);
  }
  assert(assignmentStoreData({...store,capacity:'invalid'},{...options,allowMissingCapacity:true}).problems.length>0);
});
test('Store import maps kinds, units and district without requiring block data',()=>{
  const result=storeFacilityData(store,options);
  assert.deepEqual(result.problems,[]);
  assert.equal(result.data.kind,'SFC_GODOWN');assert.equal(result.data.capacity_value,1000);
  assert.equal(result.data.radius_m,200);assert.equal('block_id' in result.data,false);assert.equal(result.data.core_store_id,38);
  assert.equal(result.data.address,'BERMO GODOWN, BOKARO');
  assert.equal(result.data.created_by,null);
  assert.equal(storeFacilityData({...store,store_type:1,status:0},options).data.kind,'FCI');
  assert.equal(storeFacilityData({...store,status:0},options).data.active,0);
});
test('Store import rejects invalid required data and ignores source block codes',()=>{
  for(const override of [{capacity:null},{lat:null},{lng:181},{radius:'0'},{district_id:999},{store_name:''},{store_type:3}]) {
    assert(storeFacilityData({...store,...override},options).problems.length>0);
  }
  const unknown=storeFacilityData({...store,rgi_block_code:999},options);
  assert.equal('block_id' in unknown.data,false);assert.deepEqual(unknown.warnings,[]);
});

