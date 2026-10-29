import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@googlemaps/google-maps-services-js';
import {computeDrivingRoute,decodePolyline} from '../src/services/google-routes.service.js';
import {expectedArrival,routeDetails,planRoute} from '../src/services/shipment-routes.service.js';
const encoded='_p~iF~ps|U_ulLnnqC_mqNvxq`@';
const source={latitude:38.5,longitude:-120.2},dest={latitude:43.252,longitude:-126.453};
test('Lifting reuses an old source/destination plan without Google or coordinate lookup',async()=>{
 let lookups=0;
 const connection={execute:async(sql,args)=>{
  if(sql.includes('FROM shipment_routes')){
   lookups++;
   assert.deepEqual(args,[1,4]);assert.match(sql,/FOR UPDATE$/);
   return [[{id:9,status:1,encoded_polyline:encoded,geometry:decodePolyline(encoded),distance_km:12.345,duration_minutes:15,created_at:new Date('2020-01-01T00:00:00Z')}]];
  }
  throw Error('Saved route must not need any other query');
 }};
 const first=await planRoute(connection,1,4);
 const second=await planRoute(connection,1,4);
 assert.equal(first.encoded_polyline,encoded);assert.equal(second.distance_km,12.345);
 assert.equal(lookups,2);assert.deepEqual(first.geometry,second.geometry);
});
test('Lifting resolves the active saved route ID',async()=>{
 const connection={execute:async(sql,args)=>{
  if(sql.includes('FROM shipment_routes'))return [[{id:9,status:1,geometry:decodePolyline(encoded),distance_km:0.01,duration_minutes:1}]];
  throw Error('Unexpected query');
 }};
 const route=await planRoute(connection,1,4,3);
 assert.equal(route.id,9);
});

test('Lifting creates a new active route when only an inactive route exists',async(t)=>{
 t.mock.method(Client.prototype,'directions',async()=>({data:{status:'OK',routes:[{
  overview_polyline:{points:encoded},legs:[{distance:{value:12000},duration:{value:900}}]
 }]}}));
 const previousKey=process.env.GOOGLE_API_KEY;
 process.env.GOOGLE_API_KEY='test-key';
 t.after(()=>{if(previousKey===undefined)delete process.env.GOOGLE_API_KEY;else process.env.GOOGLE_API_KEY=previousKey;});
 const inactive={id:9,status:0,source_id:1,destination_id:4};
 let saved=null;
 const connection={execute:async(sql,args)=>{
  if(sql.includes('FROM shipment_routes')){
   assert.match(sql,/AND status=1 FOR UPDATE$/);
   return [saved?[saved]:[]];
  }
  if(sql.includes('FROM facilities'))return [[{id:1,...source},{id:4,...dest}]];
  if(sql.includes('INSERT INTO shipment_routes')){
   assert.equal(args[10],3);
   saved={id:10,status:1,source_id:args[0],destination_id:args[1],geometry:args[7],distance_km:args[8],duration_minutes:args[9]};
   return [{insertId:10}];
  }
  throw Error('Inactive route must not be updated: '+sql);
 }};
 const route=await planRoute(connection,1,4,3);
 assert.equal(route.id,10);assert.equal(route.status,1);
 assert.equal(route.distance_km,12);assert.equal(route.duration_minutes,15);
 assert.deepEqual(inactive,{id:9,status:0,source_id:1,destination_id:4});
});
test('Directions client receives coordinates and returns road distance, integer minutes and GeoJSON',async()=>{
 const route=await computeDrivingRoute(source,dest,{apiKey:'test-key',mapsClient:{directions:async(options)=>{
  assert.equal(options.params.key,'test-key');assert.deepEqual(options.params.origin,{lat:38.5,lng:-120.2});
  assert.deepEqual(options.params.destination,{lat:43.252,lng:-126.453});assert.equal(options.params.mode,'driving');assert.equal(options.timeout,10000);
  return {data:{status:'OK',routes:[{overview_polyline:{points:encoded},legs:[{distance:{value:12000},duration:{value:900}},{distance:{value:345},duration:{value:1.2}}]}]}};
 }}});
 assert.deepEqual(route.geometry.coordinates,[[-120.2,38.5],[-120.95,40.7],[-126.453,43.252]]);
 assert.equal(route.duration_minutes,16);assert.equal(routeDetails(route).distance_km,12.345);
 assert.equal(expectedArrival('2026-10-26T00:00:00Z',route).toISOString(),'2026-10-26T00:16:00.000Z');
});
test('Invalid configuration, malformed polylines and denied/missing routes fail without exposing client secrets',async()=>{
 await assert.rejects(computeDrivingRoute(source,dest,{apiKey:''}),e=>e.code==='GOOGLE_API_KEY_MISSING');
 await assert.rejects(computeDrivingRoute({latitude:null,longitude:1},dest,{apiKey:'x'}),e=>e.code==='INVALID_ROUTE_COORDINATES');
 assert.throws(()=>decodePolyline('_'),e=>e.code==='INVALID_ROUTE_RESPONSE');
 for(const status of ['ZERO_RESULTS','NOT_FOUND','REQUEST_DENIED','OVER_QUERY_LIMIT']){
  await assert.rejects(computeDrivingRoute(source,dest,{apiKey:'secret',mapsClient:{directions:async()=>({data:{status}})}}),e=>e.code===(['ZERO_RESULTS','NOT_FOUND'].includes(status)?'ROUTE_NOT_FOUND':'GOOGLE_ROUTES_REJECTED'));
 }
 await assert.rejects(computeDrivingRoute(source,dest,{apiKey:'secret',mapsClient:{directions:async()=>{throw {response:{data:{status:'REQUEST_DENIED'}},config:{key:'secret'}};}}}),e=>e.code==='GOOGLE_ROUTES_REJECTED'&&!e.message.includes('secret'));
 await assert.rejects(computeDrivingRoute(source,dest,{apiKey:'x',mapsClient:{directions:async()=>{throw Error('network');}}}),e=>e.code==='GOOGLE_ROUTES_UNAVAILABLE');
});
