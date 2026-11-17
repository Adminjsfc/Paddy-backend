import {z} from 'zod';
import {id,ensure} from '../utils/core.js';
import * as repository from '../repositories/vehicle-map.repository.js';
import {requireVehicleTrackingAccess} from '../repositories/gps.repository.js';
import {numberOrNull,summarizeRoute,validPoint} from '../utils/vehicle-map.js';
export const vehicleMapSchema=z.object({
  vehicle_no:z.string().trim().min(1).max(40).transform(v=>v.replace(/\s+/g,'').toUpperCase()),
  trip_id:z.union([id,z.string().trim().min(1).max(100)]).nullish().transform(v=>v!=null&&/^\d+$/.test(String(v))?Number(v):v).pipe(z.union([id,z.string().min(1).max(100)]).nullish()),
  history_limit:z.number().int().min(1).max(20000).default(5000)
}).strict();
export async function getVehicleMap(context){
  const input=vehicleMapSchema.parse(context.body);
  const vehicle=await repository.vehicle(input.vehicle_no);
  await requireVehicleTrackingAccess(context.user,vehicle);
  const trip=await repository.trip(vehicle.id,input.trip_id,context.user);
  ensure(input.trip_id==null||trip,'This trip was not found for the selected vehicle and your account.','TRIP_NOT_FOUND',404);
  const coordinates={lat:vehicle.latitude,lng:vehicle.longitude};
  const location=vehicle.device_id&&validPoint(coordinates)?{
    latitude:Number(vehicle.latitude),longitude:Number(vehicle.longitude),speed:numberOrNull(vehicle.speed_kph),ignition:null,
    last_location_update:vehicle.last_gps_at,stale:!vehicle.last_gps_at||Date.now()-new Date(vehicle.last_gps_at).getTime()>Number(process.env.GPS_STALE_MINUTES||15)*60000,
    gps_active:Boolean(vehicle.gps_active)
  }:null;
  const data={vehicle_no:vehicle.registration_no,active_trip:null,vehicle_location:location,route:null,alert_count:0,alerts:[],alert_events:[]};
  if(trip){
    const from=trip.trip_started_at,to=trip.trip_completed_at||new Date();
    const [lots,alerts,events,history]=await Promise.all([
      repository.lots(trip.id),repository.alerts(trip.id),repository.alertEvents(trip.id),
      from&&Number(trip.trip_status)>0?repository.packets(vehicle.id,from,to,input.history_limit):Promise.resolve({data:[],total:0})
    ]);
    const ro=lots.length===1?{number:lots[0].ro_no,date:lots[0].ro_date,total_qty:Number(lots[0].total_quantity_kg),lifted_qty:Number(lots[0].quantity_kg),scheme_name:trip.scheme_code,commodity_name:'PADDY'}:null;
    data.active_trip={id:trip.id,trip_unique_id:trip.shipment_no,vehicle_no:vehicle.registration_no,leg:trip.leg,status:trip.status,trip_status:Number(trip.trip_status),
      route_id:trip.route_id,lifting_date:trip.dispatched_at,trip_date:trip.trip_started_at,expected_arrival_time:trip.expected_completion_at,completion_date:trip.trip_completed_at,
      district_name:trip.district_name,season_id:trip.season_id,season_name:trip.season_name,scheme_code:trip.scheme_code,commodity_code:trip.commodity_code,
      quantity_kg:Number(trip.quantity_kg),quantity_unit:'KG',received_quantity_kg:numberOrNull(trip.accepted_kg),total_bags:trip.total_bags,received_bags:trip.received_bags,
      dm:{id:null,name:null,contact:null},agm:{id:null,name:null,contact:null},
      driver:{id:trip.driver_user_id,name:trip.driver_name,contact:trip.driver_phone},
      transporter:{id:null,name:vehicle.transporter_name,contact:vehicle.transporter_contact_no},
      ro,procurement_lots:lots,cmr_order:trip.order_id?{id:trip.order_id,order_no:trip.order_no,quantity_kg:Number(trip.rice_quantity_kg),lot_count:trip.lot_count,gunny_bag_year:trip.gunny_bag_year,gunny_bag_type:trip.gunny_bag_type}:null,
      source:{store_id:trip.source_id,facility_id:trip.source_id,store_name:trip.source_name,lat:numberOrNull(trip.source_lat),lng:numberOrNull(trip.source_lng),radius:numberOrNull(trip.source_radius_m)==null?null:Number(trip.source_radius_m)/1000,radius_m:numberOrNull(trip.source_radius_m)},
      destinations:[{id:trip.destination_id,facility_id:trip.destination_id,store_id:trip.destination_id,store_location_id:trip.core_store_location_id??trip.core_store_id,
        store_name:trip.destination_name,status:Number(trip.trip_status),source_id:trip.source_id,sequence_no:1,name:trip.destination_contact_name,contact:trip.destination_phone,
        lat:numberOrNull(trip.destination_lat),lng:numberOrNull(trip.destination_lng),radius:numberOrNull(trip.destination_radius_m)==null?null:Number(trip.destination_radius_m)/1000,radius_m:numberOrNull(trip.destination_radius_m)}]};
    data.route=summarizeRoute(trip,location,history.data,{complete:history.total<=input.history_limit});
    data.gps_history={source:'gps_packets',total:history.total,returned:data.route.gps_route_points.length,truncated:history.total>input.history_limit};
    data.alerts=alerts;data.alert_count=alerts.length;
    data.alert_events=events.map(event=>({...event,status:event.end_date_time?'COMPLETED':'ONGOING'}));
  }
  return {status:200,body:{ok:true,status:true,message:'Vehicle map data fetched successfully',data}};
}
