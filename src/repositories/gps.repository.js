import { pool } from "../config/database.js";
import { one, rows, insert } from "../repositories/database.js";
export async function ingestPacketFindGpsDevices(connection, p) {
  return one(connection, 'SELECT d.id,d.vehicle_id,d.imei_id,d.district_id,d.block_id,d.model,d.sim_no,d.active,d.created_by,d.created_at,d.updated_by,d.updated_at,d.last_gps_at,d.latitude,d.longitude,d.speed_kph FROM gps_devices d JOIN imeis i ON i.id=d.imei_id WHERE i.imei=? AND i.active=1 AND d.active=1 FOR UPDATE', [p.imei]);
}
export async function ingestPacketFindGpsPackets(connection, data, p) {
  return one(connection, 'SELECT id,latitude,longitude FROM gps_packets WHERE device_id=? AND gps_at=?', [data.id, p.gps_at], false);
}
export async function ingestPacketFindShipments(connection, data) {
  return one(connection, "SELECT id,status,trip_status,dispatched_at,trip_started_at,trip_completed_at,last_gps_at,source_lat,source_lng,source_radius_m,destination_lat,destination_lng,destination_radius_m,source_geofence,destination_geofence FROM shipment_details WHERE vehicle_id=? AND status IN ('DISPATCHED','IN_TRANSIT','ARRIVED') FOR UPDATE", [data.vehicle_id], false);
}
export async function ingestPacketInsertGpsPackets(connection, data, p, result) {
  return insert(connection, 'gps_packets', {
    device_id: data.id,
    gps_at: p.gps_at,
    latitude: p.latitude,
    longitude: p.longitude,
    speed_kph: p.speed_kph,
    packet_type: p.packet_type,
    raw_payload: JSON.stringify(p.raw),
    processing_result: result
  });
}
export async function ingestPacketUpdateGpsDevices(connection, p, data) {
  return rows(connection, 'UPDATE gps_devices SET last_gps_at=?,latitude=?,longitude=?,speed_kph=? WHERE id=?', [p.gps_at, p.latitude, p.longitude, p.speed_kph, data.id]);
}
export async function ingestPacketUpdateShipments(connection, change, p, s) {
  return rows(connection, 'UPDATE shipments SET status=?,source_geofence=?,destination_geofence=?,last_gps_at=?,trip_status=?,trip_started_at=?,trip_completed_at=?,expected_completion_at=CASE WHEN ? THEN TIMESTAMPADD(MINUTE,(SELECT r.duration_minutes FROM shipment_routes r WHERE r.id=shipments.route_id),trip_started_at) ELSE expected_completion_at END WHERE id=?', [change.status, change.source, change.destination, p.gps_at, change.trip_status, change.trip_started_at, change.trip_completed_at, change.events.includes('DEPARTED'), s.id]);
}
export async function getVehicleLocationFindVehicles(context) {
  return one(pool, 'SELECT v.id,v.transporter_id,v.vehicle_type_id,v.registration_no,v.capacity_g,v.active,v.created_by,v.created_at,v.updated_by,v.updated_at,v.mapping_status,v.status_updated_at,COALESCE(v.miller_id,t.miller_id) miller_id FROM vehicles v LEFT JOIN transporters t ON t.id=v.transporter_id WHERE v.id=?', [context.params.id]);
}
export async function getVehicleLocationFindGpsDevices(v) {
  return one(pool, 'SELECT d.vehicle_id,d.imei_id,d.district_id,d.block_id,i.imei,i.provider,d.active,d.last_gps_at,d.latitude,d.longitude,d.speed_kph FROM gps_devices d JOIN imeis i ON i.id=d.imei_id WHERE d.vehicle_id=?', [v.id]);
}
export async function getVehicleHistoryFindVehicles(context) {
  return one(pool, 'SELECT v.id,v.transporter_id,v.vehicle_type_id,v.registration_no,v.capacity_g,v.active,v.created_by,v.created_at,v.updated_by,v.updated_at,v.mapping_status,v.status_updated_at,COALESCE(v.miller_id,t.miller_id) miller_id FROM vehicles v LEFT JOIN transporters t ON t.id=v.transporter_id WHERE v.id=?', [context.params.id]);
}
export async function getVehicleHistoryCountRecords(filter, args) {
  return one(pool, `SELECT COUNT(p.id) total ${filter}`, args);
}
export async function getVehicleHistoryListRecords(filter, limit, offset, args) {
  return rows(pool, `SELECT p.id,p.device_id,p.gps_at,p.latitude,p.longitude,p.speed_kph,p.packet_type,p.raw_payload,p.processing_result,p.received_at ${filter} ORDER BY p.gps_at,p.id LIMIT ${limit} OFFSET ${offset}`, args);
}

export async function ingestPacketFindBoundShipment(connection,device,shipmentId) {
  return one(connection,'SELECT id,status,trip_status,dispatched_at,trip_started_at,trip_completed_at,last_gps_at,source_lat,source_lng,source_radius_m,destination_lat,destination_lng,destination_radius_m,source_geofence,destination_geofence FROM shipment_details WHERE id=? AND vehicle_id=? FOR UPDATE',[shipmentId,device.vehicle_id]);
}
