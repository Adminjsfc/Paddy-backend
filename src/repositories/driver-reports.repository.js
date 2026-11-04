import {pool} from '../config/database.js';
import {one,rows} from './database.js';

export const profile=driverId=>one(pool,'SELECT id,name,phone,email FROM users WHERE id=? AND role=\'DRIVER\'',[driverId]);
const tripFrom=`FROM shipments s JOIN vehicles v ON v.id=s.vehicle_id JOIN shipment_routes r ON r.id=s.route_id
  LEFT JOIN facilities f ON f.id=r.source_id LEFT JOIN facilities d ON d.id=r.destination_id
  LEFT JOIN tbl_district_master district ON district.id=s.district_id
  LEFT JOIN users u ON u.id=s.driver_user_id`;
function filter(driverId,input,active=false){
  let sql=" WHERE s.driver_user_id=? AND s.leg='PADDY' AND s.status<>'CANCELLED'";const args=[driverId];
  if(active)sql+=' AND s.trip_status=1';
  if(input.trip_id){sql+=' AND s.id=?';args.push(input.trip_id);}
  if(input.from_date){sql+=' AND COALESCE(s.trip_started_at,s.dispatched_at,s.created_at)>=?';args.push(input.from_date+' 00:00:00');}
  if(input.to_date){sql+=' AND COALESCE(s.trip_started_at,s.dispatched_at,s.created_at)<DATE_ADD(?,INTERVAL 1 DAY)';args.push(input.to_date+' 00:00:00');}
  return {sql,args};
}
export async function trips(driverId,input,active=false){
  const {sql,args}=filter(driverId,input,active);
  const count=await one(pool,'SELECT COUNT(*) total '+tripFrom+sql,args);
  const limit=active?1:input.limit,offset=active?0:(input.page-1)*limit;
  const data=await rows(pool,`SELECT s.id,s.shipment_no,s.driver_user_id,s.driver_name,s.driver_phone,u.name user_name,u.phone user_phone,
    v.registration_no,v.transporter_name,v.transporter_contact_no,s.quantity_kg,s.accepted_kg,s.total_bags,s.received_bags,
    s.status,s.trip_status,s.trip_started_at,s.trip_completed_at,s.dispatched_at,s.delivered_at,s.expected_completion_at,s.created_at,
    s.scheme_code,s.commodity_code,r.id route_id,r.source_id,r.destination_id,f.name source_name,d.name destination_name,
    r.distance_km,r.duration_minutes,r.encoded_polyline,district.district_name
    ${tripFrom}${sql} ORDER BY s.trip_started_at DESC,s.id DESC LIMIT ${limit} OFFSET ${offset}`,args);
  if(data.length){
    const lots=await rows(pool,`SELECT l.shipment_id,p.id procurement_id,p.ro_no,l.quantity_kg
      FROM shipment_lots l JOIN procurement p ON p.id=l.procurement_id
      WHERE l.shipment_id IN (${data.map(()=>'?').join(',')}) ORDER BY l.shipment_id,p.id`,data.map(row=>row.id));
    for(const row of data)row.procurement_lots=lots.filter(lot=>lot.shipment_id===row.id).map(({shipment_id,...lot})=>({...lot,quantity_kg:Number(lot.quantity_kg)}));
  }
  return {data,total:Number(count.total)};
}
export async function alerts(driverId,input){
  let sql=" WHERE s.driver_user_id=? AND s.leg='PADDY' AND e.event_type IN ('GPS_OFFLINE','ETA_DELAYED') AND JSON_UNQUOTE(JSON_EXTRACT(e.detail,'$.driver_id'))=?";
  const args=[driverId,String(driverId)];
  if(input.trip_id){sql+=' AND s.id=?';args.push(input.trip_id);}
  if(input.from_date){sql+=' AND e.occurred_at>=?';args.push(input.from_date+' 00:00:00');}
  if(input.to_date){sql+=' AND e.occurred_at<DATE_ADD(?,INTERVAL 1 DAY)';args.push(input.to_date+' 00:00:00');}
  const from='FROM shipment_events e JOIN shipments s ON s.id=e.shipment_id JOIN vehicles v ON v.id=s.vehicle_id LEFT JOIN users u ON u.id=s.driver_user_id';
  const count=await one(pool,'SELECT COUNT(*) total '+from+sql,args);
  const data=await rows(pool,`SELECT e.id,e.shipment_id,e.event_type,e.occurred_at,e.detail,s.shipment_no,
    s.driver_user_id,COALESCE(s.driver_name,u.name) driver_name,v.registration_no ${from}${sql}
    ORDER BY e.occurred_at DESC,e.id DESC LIMIT ${input.limit} OFFSET ${(input.page-1)*input.limit}`,args);
  return {data,total:Number(count.total)};
}
