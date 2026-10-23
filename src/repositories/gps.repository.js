import { pool } from "../config/database.js";
import { one, rows, insert } from "../repositories/database.js";
export async function ingestPacketFindGpsDevices(connection, p) {
  return one(connection, 'SELECT d.* FROM gps_devices d JOIN imeis i ON i.id=d.imei_id WHERE i.imei=? AND i.active=1 AND d.active=1 FOR UPDATE', [p.imei]);
}
export async function ingestPacketFindGpsPackets(connection, data, p) {
  return one(connection, 'SELECT id,latitude,longitude FROM gps_packets WHERE device_id=? AND gps_at=?', [data.id, p.gps_at], false);
}
export async function ingestPacketFindShipments(connection, data) {
  return one(connection, "SELECT * FROM shipments WHERE vehicle_id=? AND status IN ('DISPATCHED','IN_TRANSIT','ARRIVED') FOR UPDATE", [data.vehicle_id], false);
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
export async function ingestPacketUpdateShipments(connection, change, departed, arrived, p, s) {
  return rows(connection, 'UPDATE shipments SET status=?,source_geofence=?,destination_geofence=?,departed_at=?,arrived_at=?,last_gps_at=?,trip_status=?,trip_started_at=?,trip_completed_at=? WHERE id=?', [change.status, change.source, change.destination, departed, arrived, p.gps_at, change.trip_status, change.trip_started_at, change.trip_completed_at, s.id]);
}
export async function getVehicleLocationFindVehicles(context) {
  return one(pool, 'SELECT v.*,COALESCE(v.miller_id,t.miller_id) miller_id FROM vehicles v LEFT JOIN transporters t ON t.id=v.transporter_id WHERE v.id=?', [context.params.id]);
}
export async function getVehicleLocationFindGpsDevices(v) {
  return one(pool, 'SELECT d.vehicle_id,d.imei_id,d.district_id,d.block_id,i.imei,i.provider,d.active,d.last_gps_at,d.latitude,d.longitude,d.speed_kph FROM gps_devices d JOIN imeis i ON i.id=d.imei_id WHERE d.vehicle_id=?', [v.id]);
}
export async function getVehicleHistoryFindVehicles(context) {
  return one(pool, 'SELECT v.*,COALESCE(v.miller_id,t.miller_id) miller_id FROM vehicles v LEFT JOIN transporters t ON t.id=v.transporter_id WHERE v.id=?', [context.params.id]);
}
export async function getVehicleHistoryCountRecords(filter, args) {
  return one(pool, `SELECT COUNT(*) total ${filter}`, args);
}
export async function getVehicleHistoryListRecords(filter, limit, offset, args) {
  return rows(pool, `SELECT p.* ${filter} ORDER BY p.gps_at,p.id LIMIT ${limit} OFFSET ${offset}`, args);
}

export async function ingestPacketFindBoundShipment(connection,device,shipmentId) {
  return one(connection,'SELECT * FROM shipments WHERE id=? AND vehicle_id=? FOR UPDATE',[shipmentId,device.vehicle_id]);
}
