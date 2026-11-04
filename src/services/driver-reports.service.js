import * as repository from '../repositories/driver-reports.repository.js';
import {tripSummary} from './drivers.service.js';
import {ensure} from '../utils/core.js';
import {driverRequest,driverReport} from '../validators/driver-reports.schema.js';
import {captureDriverAlerts} from './driver-alerts.service.js';

function input(context,schema=driverRequest){
  ensure(context.user.role==='DRIVER','Driver login required','FORBIDDEN',403);
  const data=schema.parse(context.body??{});
  ensure(data.driver_id===undefined||data.driver_id===Number(context.user.id),'Cannot view another driver','FORBIDDEN',403);
  return data;
}
const iso=value=>value?new Date(value).toISOString().replace('.000Z','Z'):null;
const number=value=>value==null?null:Number(value);
const json=value=>typeof value==='string'?JSON.parse(value):value;
export function eta(row,now=Date.now()){
  if(!row.expected_completion_at)return {eta_state:'UNKNOWN',eta_status:null,eta_hours:null};
  const remaining=new Date(row.expected_completion_at).getTime()-now,delayed=remaining<0,abs=Math.ceil(Math.abs(remaining)/60000);
  return {eta_state:delayed?'DELAYED':'ON_TIME',eta_status:delayed?`${abs} Min Delayed`:`${abs} Min Remaining`,eta_hours:`${Math.floor(abs/60)} Hrs ${abs%60} Min`};
}
export function tripView(row){
  const lots=json(row.procurement_lots)||[];
  return {trip_id:row.id,unique_trip_id:row.shipment_no,vehicle_no:row.registration_no,
    total_quantity:Number(row.quantity_kg),lifting_quantity:row.dispatched_at?Number(row.quantity_kg):null,
    received_quantity:row.delivered_at?number(row.accepted_kg):null,quantity_unit:'KG',
    number_of_bags:number(row.total_bags),received_number_of_bags:row.delivered_at?number(row.received_bags):null,
    trip_status:Number(row.trip_status),trip_status_name:['Pending','Started','Completed'][Number(row.trip_status)],
    trip_date:iso(row.trip_started_at),completion_date:iso(row.trip_completed_at),expected_arrival_time:iso(row.expected_completion_at),
    c_date:iso(row.created_at),driver_id:row.driver_user_id,driver_name:row.driver_name||row.user_name,
    driver_contact:row.driver_phone||row.user_phone,source_store:row.source_name,destination_store:row.destination_name,
    source_id:row.source_id,destination_id:row.destination_id,route_id:row.route_id,
    route_name:row.source_name&&row.destination_name?`${row.source_name} → ${row.destination_name}`:null,
    route_distance:number(row.distance_km),route_time_duration:number(row.duration_minutes),polystring:row.encoded_polyline,
    district_name:row.district_name,scheme_name:row.scheme_code,commodity_name:row.commodity_code,
    transporter_name:row.transporter_name??null,transporter_contact:row.transporter_contact_no??null,procurement_lots:lots};
}
const response=(message,data,extra={})=>({status:200,body:{status:200,message,data,...extra}});
export async function details(context){
  input(context);
  const profile=await repository.profile(context.user.id);
  const summary=await tripSummary({...context,body:{}});
  return response('Driver details fetched successfully',{driver_id:profile.id,user_unique_id:null,full_name:profile.name,
    contact:profile.phone,email:profile.email?.endsWith('@drivers.invalid')?null:profile.email,
    date_of_birth:null,pan_no:null,address:null,pincode:null,aadhar_no:null,dl_no:null,total_trips:summary.body.data.total_trips});
}
export async function active(context){
  input(context);
  const result=await repository.trips(context.user.id,{},true),row=result.data[0];
  if(!row)return response('No active trip found',null);
  const view=tripView(row),lots=view.procurement_lots;
  return response('Active trip fetched successfully',{id:row.id,...view,trip_id:row.shipment_no,
    source_location:row.source_name,destination_location:row.destination_name,total_distance:view.route_distance,
    load_quantity:view.total_quantity,ro_id:lots.length===1?lots[0].procurement_id:null,
    ro_sio_number:lots.length===1?lots[0].ro_no:null,...eta(row)});
}
export async function tripDetails(context){
  const data=input(context,driverReport),result=await repository.trips(context.user.id,data);
  if(data.trip_id)ensure(result.total,'Trip not found','NOT_FOUND',404);
  return response('Trip details fetched successfully.',result.data.map(tripView),{count:result.data.length,
    pagination:{page:data.page,limit:data.limit,total:result.total}});
}
export async function alertReport(context){
  const data=input(context,driverReport);
  await captureDriverAlerts({driverId:context.user.id});
  const result=await repository.alerts(context.user.id,data);
  return response('Driver alerts fetched successfully',result.data.map(row=>{
    const detail=json(row.detail)||{};
    return {id:row.id,trip_id:row.shipment_id,unique_trip_id:row.shipment_no,driver_id:row.driver_user_id,
      driver_name:row.driver_name,vehicle_no:row.registration_no,alert_name:row.event_type==='GPS_OFFLINE'?'GPS Offline':'ETA Delayed',
      alert_message:detail.message,alert_time:iso(row.occurred_at),location:detail.location??null,escalation_role:null};
  }),{count:result.data.length,pagination:{page:data.page,limit:data.limit,total:result.total}});
}
