import {one,rows} from './database.js';
export const facilities=(connection,sourceId,destinationId)=>rows(connection,
  'SELECT id,latitude,longitude FROM facilities WHERE id IN (?,?)',[sourceId,destinationId]);
export const findPlan=(connection,sourceId,destinationId)=>one(connection,
  'SELECT id,source_id,destination_id,source_lat,source_lng,destination_lat,destination_lng,encoded_polyline,geometry,distance_km,duration_minutes,created_at,updated_at,created_by,updated_by,status FROM shipment_routes WHERE source_id=? AND destination_id=? AND status=1 FOR UPDATE',
  [sourceId,destinationId],false);
export const savePlan=(connection,source,destination,route,actorId)=>rows(connection,
  `INSERT INTO shipment_routes(source_id,destination_id,source_lat,source_lng,destination_lat,destination_lng,encoded_polyline,geometry,distance_km,duration_minutes,created_by)
   VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  [source.id,destination.id,source.latitude,source.longitude,destination.latitude,destination.longitude,
    route.encoded_polyline,JSON.stringify(route.geometry),route.distance_km,route.duration_minutes,actorId??null]);
export const completePlan=(connection,id,route,actorId)=>rows(connection,
  'UPDATE shipment_routes SET encoded_polyline=?,geometry=?,distance_km=?,duration_minutes=?,updated_by=? WHERE id=?',
  [route.encoded_polyline,JSON.stringify(route.geometry),route.distance_km,route.duration_minutes,actorId??null,id]);
export const findShipment=(connection,id)=>one(connection,
  `SELECT r.id,r.source_id,r.destination_id,r.encoded_polyline,r.geometry,r.distance_km,r.duration_minutes,
   r.created_at,r.updated_at,r.created_by,r.updated_by,r.status
   FROM shipment_details s JOIN shipment_routes r ON r.id=s.route_id
   WHERE s.id=?`,[id],false);
