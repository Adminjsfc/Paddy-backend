import {pool} from '../config/database.js';
import {one,rows} from './database.js';
import {scopedWhere} from '../utils/core.js';

export const vehicle=number=>one(pool,`SELECT v.id,v.registration_no,v.created_by,v.transporter_name,v.transporter_contact_no,
  d.id device_id,d.active gps_active,d.latitude,d.longitude,d.speed_kph,d.last_gps_at
  FROM vehicles v LEFT JOIN gps_devices d ON d.vehicle_id=v.id
  WHERE UPPER(REPLACE(v.registration_no,' ',''))=?`,[number],true,{code:'VEHICLE_NOT_FOUND',message:'Vehicle was not found.'});

export function trip(vehicleId,requested,user){
  const scope=scopedWhere(user),args=[vehicleId,...scope.params];
  let filter=" AND s.status IN ('PLANNED','DISPATCHED','IN_TRANSIT','ARRIVED')";
  if(requested!=null){filter=typeof requested==='number'?' AND s.id=?':' AND s.shipment_no=?';args.push(requested);}
  return one(pool,`SELECT s.id,s.shipment_no,s.leg,s.status,s.trip_status,s.season_id,s.miller_id,s.route_id,s.district_id,
    s.quantity_kg,s.accepted_kg,s.total_bags,s.received_bags,s.driver_user_id,s.driver_name,s.driver_phone,
    s.dispatched_at,s.trip_started_at,s.trip_completed_at,s.expected_completion_at,s.created_at,s.core_store_location_id,
    s.source_lat,s.source_lng,s.source_radius_m,s.destination_lat,s.destination_lng,s.destination_radius_m,
    s.scheme_code,s.commodity_code,r.source_id,r.destination_id,r.encoded_polyline,r.geometry,r.distance_km,r.duration_minutes,
    src.name source_name,dst.name destination_name,dst.core_store_id,dst.contact_name destination_contact_name,dst.phone destination_phone,
    district.district_name,se.name season_name,o.id order_id,o.order_no,o.rice_quantity_kg,o.lot_count,o.gunny_bag_year,o.gunny_bag_type
    FROM shipments s JOIN shipment_routes r ON r.id=s.route_id
    JOIN facilities src ON src.id=r.source_id JOIN facilities dst ON dst.id=r.destination_id
    LEFT JOIN tbl_district_master district ON district.id=s.district_id
    LEFT JOIN seasons se ON se.id=s.season_id LEFT JOIN cmr_orders o ON o.id=s.order_id
    WHERE s.vehicle_id=?${scope.sql}${filter}
    ORDER BY CASE WHEN s.trip_status=1 THEN 0 WHEN s.status='ARRIVED' THEN 1 WHEN s.status='DISPATCHED' THEN 2 ELSE 3 END,s.id DESC LIMIT 1`,args,false);
}
export const lots=id=>rows(pool,`SELECT l.procurement_id,p.ro_no,CAST(p.ro_date AS CHAR) ro_date,p.quantity_kg total_quantity_kg,l.quantity_kg
  FROM shipment_lots l JOIN procurement p ON p.id=l.procurement_id WHERE l.shipment_id=? ORDER BY l.procurement_id`,[id]);
export const alerts=id=>rows(pool,`SELECT a.id,a.shipment_id trip_id,a.vehicle_no,a.alert_id,m.alert_name,a.message,a.latitude,a.longitude,
  a.last_date_time,a.off_route,a.off_route_in_km,a.duration_minutes,a.alert_event_id
  FROM tbl_vehicle_alerts_details a LEFT JOIN gps_alert_master m ON m.id=a.alert_id WHERE a.shipment_id=? AND a.status=1 ORDER BY a.last_date_time,a.id`,[id]);
export const alertEvents=id=>rows(pool,`SELECT e.id,e.shipment_id trip_id,e.vehicle_no,e.alert_id,m.alert_name,e.start_date_time,e.end_date_time,
  e.duration_minutes,e.off_route_in_km,e.status FROM tbl_vehicle_alert_event e LEFT JOIN gps_alert_master m ON m.id=e.alert_id
  WHERE e.shipment_id=? ORDER BY e.start_date_time,e.id`,[id]);
export async function packets(vehicleId,from,to,limit){
  const args=[vehicleId,from,to];
  const base='FROM gps_packets p JOIN gps_devices d ON d.id=p.device_id WHERE d.vehicle_id=? AND p.gps_at>=? AND p.gps_at<=?';
  const count=await one(pool,`SELECT COUNT(*) total ${base}`,args);
  const data=await rows(pool,`SELECT p.id,p.gps_at,p.latitude,p.longitude,p.speed_kph,p.packet_type,p.raw_payload ${base}
    ORDER BY p.gps_at,p.id LIMIT ${limit}`,args);
  return {data,total:Number(count.total)};
}
