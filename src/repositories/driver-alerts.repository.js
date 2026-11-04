import {pool} from '../config/database.js';
import {rows,one} from './database.js';
export const candidates=driverId=>rows(pool,`SELECT id FROM shipments WHERE leg='PADDY'
  AND driver_user_id IS NOT NULL AND status IN ('DISPATCHED','IN_TRANSIT')${driverId?' AND driver_user_id=?':''}`,
  driverId?[driverId]:[]);
export const current=(connection,id)=>one(connection,`SELECT s.id,s.shipment_no,s.driver_user_id,s.expected_completion_at,
  COALESCE(GREATEST(COALESCE(d.last_gps_at,s.last_gps_at),COALESCE(s.last_gps_at,d.last_gps_at)),
    s.trip_started_at,s.dispatched_at,s.created_at) gps_reference,
  d.latitude,d.longitude,v.registration_no
  FROM shipments s JOIN vehicles v ON v.id=s.vehicle_id LEFT JOIN gps_devices d ON d.vehicle_id=v.id AND d.active=1
  WHERE s.id=? AND s.leg='PADDY' AND s.driver_user_id IS NOT NULL AND s.status IN ('DISPATCHED','IN_TRANSIT') FOR UPDATE`,[id],false);
export const existing=(connection,shipmentId,type,episode,driverId)=>one(connection,`SELECT id FROM shipment_events
  WHERE shipment_id=? AND event_type=? AND JSON_UNQUOTE(JSON_EXTRACT(detail,'$.episode'))=?
  AND JSON_UNQUOTE(JSON_EXTRACT(detail,'$.driver_id'))=? LIMIT 1`,[shipmentId,type,episode,String(driverId)],false);
