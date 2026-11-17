import test from 'node:test';
import assert from 'node:assert/strict';
import polyline from '@mapbox/polyline';
import {gpsPoints,summarizeRoute} from '../src/utils/vehicle-map.js';
import {vehicleMapSchema} from '../src/services/vehicle-map.service.js';
const now=Date.parse('2026-11-17T10:00:00Z');
const trip={trip_status:1,distance_km:2,encoded_polyline:polyline.encode([[23,85],[23,85.02]])};
const location={latitude:23,longitude:85.01,last_location_update:new Date(now-1000)};
const packets=[{latitude:23,longitude:85,gps_at:new Date(now-60000),speed_kph:20,raw_payload:'{"ignition":true}'},{latitude:23,longitude:85.01,gps_at:new Date(now-1000),speed_kph:40,packet_type:'L'}];
test('Vehicle map normalizes registration and accepts numeric or display shipment IDs',()=>{
 assert.equal(vehicleMapSchema.parse({vehicle_no:'jh 10 af 5535',trip_id:'12'}).trip_id,12);
 assert.equal(vehicleMapSchema.parse({vehicle_no:'jh 10 af 5535'}).vehicle_no,'JH10AF5535');
 assert.equal(vehicleMapSchema.parse({vehicle_no:'JH10AF5535',trip_id:'PADDY-example'}).trip_id,'PADDY-example');
 for(const body of [{},{vehicle_no:''},{vehicle_no:'X',trip_id:0},{vehicle_no:'X',trip_id:'0'},{vehicle_no:'X',history_limit:20001}])assert.equal(vehicleMapSchema.safeParse(body).success,false);
});
test('Map route projects position without confusing actual GPS distance with planned distance',()=>{
 const result=summarizeRoute(trip,location,packets,{now});
 assert.equal(result.percentage,50);assert.equal(result.travelled_distance,1);assert.equal(result.remaining_distance,1);
 assert(result.actual_travelled_distance>1&&result.actual_travelled_distance<1.1);
 assert.equal(result.average_speed,30);assert.equal(result.max_speed,40);assert.equal(result.estimated_remaining_minutes,2);
 assert.equal(result.calculated_expected_delivery_time,'2026-11-17T10:02:00.000Z');
 assert.equal(result.gps_route_points[0].ignition,'1');assert.equal(result.polyline.length,2);
});
test('Pending, missing and truncated histories do not manufacture travel metrics',()=>{
 const pending=summarizeRoute({...trip,trip_status:0},location,[],{now});
 assert.equal(pending.percentage,0);assert.equal(pending.actual_travelled_distance,null);assert.equal(pending.average_speed,null);
 const missing=summarizeRoute(trip,null,[],{now});assert.equal(missing.percentage,null);assert.equal(missing.calculated_expected_delivery_time,null);
 const truncated=summarizeRoute({...trip,trip_status:2},location,packets,{now,complete:false});
 assert.equal(truncated.percentage,100);assert.equal(truncated.remaining_distance,0);assert.equal(truncated.actual_travelled_distance,null);assert.equal(truncated.max_speed,null);
});
test('Off-route and stale vehicle points do not generate a misleading live ETA',()=>{
 const far=summarizeRoute(trip,{...location,latitude:24},packets,{now});assert.equal(far.percentage,null);assert.equal(far.calculated_expected_delivery_time,null);
 const stale=summarizeRoute(trip,{...location,last_location_update:new Date(now-3600000)},packets,{now});assert.equal(stale.calculated_expected_delivery_time,null);
});
test('Invalid fixes are omitted and unavailable ignition stays null',()=>{
 const result=gpsPoints([...packets,{...packets[0],latitude:null},{...packets[0],latitude:0,longitude:0},{...packets[0],gps_at:'invalid'},{...packets[0],raw_payload:'{"gps_fix":false}'}]);
 assert.equal(result.length,2);assert.equal(result[1].ignition,null);
});
