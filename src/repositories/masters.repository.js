import {masterColumns} from './master-columns.js';
import { pool } from "../config/database.js";
import { rows, one, insert } from "../repositories/database.js";
export async function findActiveImei(connection, id) {
  return one(connection, 'SELECT id,district_id FROM imeis WHERE id=? AND active=1 FOR UPDATE', [id]);
}
export async function findActiveImeiDevice(connection, id) {
  return one(connection, 'SELECT id FROM gps_devices WHERE imei_id=? AND active=1', [id], false);
}
export async function updateDeviceMappingState(connection, id, active, location) {
  const status = active ? 'MAPPED' : 'AVAILABLE';
  await rows(connection, 'UPDATE imeis SET status_updated_at=IF(NOT(mapping_status <=> ?),UTC_TIMESTAMP(),status_updated_at),mapping_status=?,district_id=? WHERE id=?', [status, status, location.district_id, id]);
  await rows(connection, 'UPDATE vehicles SET status_updated_at=IF(NOT(mapping_status <=> ?),UTC_TIMESTAMP(),status_updated_at),mapping_status=? WHERE id=?', [status, status, location.vehicle_id]);
}
export async function syncImeiLocation(connection, id, location) {
  await rows(connection, 'UPDATE imeis SET district_id=? WHERE id=?', [location.district_id, id]);
  await rows(connection, 'UPDATE gps_devices SET district_id=? WHERE imei_id=? AND active=1', [location.district_id, id]);
}
export async function ensureLocationFindTblDistrictMaster(connection, districtId) {
  return one(connection, 'SELECT id FROM tbl_district_master WHERE id=? AND status=1', [districtId]);
}




export async function createMasterFindVehicleTypes(connection, data) {
  return one(connection, 'SELECT id FROM vehicle_types WHERE id=? AND active=1', [data.vehicle_type_id]);
}
export async function createMasterFindVehicles(connection, data) {
  return one(connection, 'SELECT v.id,v.transporter_name,v.transporter_contact_no,v.district_id,v.vehicle_type_id,v.registration_no,v.capacity_value,v.capacity_unit,v.active,v.created_by,v.created_at,v.updated_by,v.updated_at,v.mapping_status,v.status_updated_at FROM vehicles v WHERE v.id=? AND v.active=1', [data.vehicle_id]);
}
export async function createMasterFindFacilities3(connection, data) {
  return one(connection, 'SELECT id,code,kind,name,address,district_id,latitude,longitude,radius_m,capacity_value,capacity_unit,milling_capacity_value_per_day,milling_capacity_unit,recovery_percent,contact_name,phone,active,created_by,created_by_core_user_id,created_by_user_type,created_at,updated_by,updated_at,core_store_id FROM facilities WHERE id=? AND active=1', [data.source_id]);
}
export async function createMasterFindFacilities4(connection, data) {
  return one(connection, 'SELECT id,code,kind,name,address,district_id,latitude,longitude,radius_m,capacity_value,capacity_unit,milling_capacity_value_per_day,milling_capacity_unit,recovery_percent,contact_name,phone,active,created_by,created_by_core_user_id,created_by_user_type,created_at,updated_by,updated_at,core_store_id FROM facilities WHERE id=? AND active=1', [data.destination_id]);
}
export async function createMasterFindSeasons(connection, data) {
  return one(connection, 'SELECT id FROM seasons WHERE id=? AND active=1', [data.season_id]);
}
export async function createMasterInsertRecord(connection, table, data) {
  return insert(connection, table, data);
}
export async function createSeasonFindByCode(connection, code) {
  return one(connection, 'SELECT id,active FROM seasons WHERE code=? FOR UPDATE', [code], false);
}
export async function listRouteTagAssignmentOptionsListSeasons() {
  return rows(pool, 'SELECT id,code,name,start_date,end_date FROM seasons WHERE active=1 ORDER BY start_date DESC,id DESC');
}
export async function listRouteTagAssignmentOptionsListFacilities() {
  return rows(pool, "SELECT f.id,f.code,f.name,f.kind,f.district_id,d.district_name FROM facilities f LEFT JOIN tbl_district_master d ON d.id=f.district_id WHERE f.kind IN ('PACS','LAMPS') AND f.active=1 ORDER BY d.district_name,f.kind,f.name,f.id");
}
export async function listRouteTagAssignmentOptionsListFacilities2() {
  return rows(pool, "SELECT f.id,f.code,f.name,f.district_id,d.district_name FROM facilities f LEFT JOIN tbl_district_master d ON d.id=f.district_id WHERE f.kind='MILLER' AND f.active=1 ORDER BY d.district_name,f.name,f.id");
}
export async function listLocationOptionsListTblDistrictMaster() {
  return rows(pool, 'SELECT id,id_old,district_name FROM tbl_district_master WHERE status=1 ORDER BY district_name,id');
}

export async function listMasterRecordsCountRecords(base, args) {
  return one(pool, `SELECT COUNT(x.id) AS total ${base}`, args);
}
export async function listMasterRecordsListRecords(base, limit, offset, args) {
  return rows(pool, `SELECT x.id,x.season_id,x.source_id,x.destination_id,x.active,x.created_by,x.created_at,x.unassigned_by,x.unassigned_at,se.code season_code,se.name season_name,source.code source_code,source.name source_name,source.kind source_kind,source.district_id source_district_id,source_district.district_name source_district,destination.code destination_code,destination.name destination_name,destination.kind destination_kind,destination.district_id destination_district_id,destination_district.district_name destination_district,creator.name created_by_name,creator.email created_by_email,unassigner.name unassigned_by_name,unassigner.email unassigned_by_email ${base} ORDER BY x.active DESC,x.created_at DESC,x.id DESC LIMIT ${limit} OFFSET ${offset}`, args);
}
export async function listMasterRecordsCountX(table, sql, args) {
  return one(pool, `SELECT COUNT(x.id) AS total FROM ${table} x WHERE 1=1${sql}`, args);
}
export async function listMasterRecordsListX(table, sql, limit, offset, args) {
  if (table === 'vehicles') return rows(pool, `SELECT x.id,x.transporter_name,x.transporter_contact_no,x.district_id,district.district_name,
    x.vehicle_type_id,vt.name AS vehicle_type_name,x.registration_no,x.capacity_value,x.capacity_unit,
    gps.latitude AS lat,gps.longitude AS \`long\`
    FROM vehicles x LEFT JOIN tbl_district_master district ON district.id=x.district_id
    LEFT JOIN vehicle_types vt ON vt.id=x.vehicle_type_id
    LEFT JOIN gps_devices gps ON gps.id=(
      SELECT d.id FROM gps_devices d
      WHERE d.vehicle_id=x.id AND d.active=1 AND d.latitude IS NOT NULL AND d.longitude IS NOT NULL
      ORDER BY d.last_gps_at DESC,d.id DESC LIMIT 1
    )
    WHERE 1=1${sql} ORDER BY x.id DESC LIMIT ${limit} OFFSET ${offset}`, args);
  if (table === 'gps_devices') return rows(pool, `SELECT x.id,x.vehicle_id,x.imei_id,x.district_id,x.model,x.sim_no,x.active,x.created_by,x.created_at,x.updated_by,x.updated_at,x.last_gps_at,x.latitude,x.longitude,x.speed_kph,i.imei,i.provider FROM gps_devices x JOIN imeis i ON i.id=x.imei_id WHERE 1=1${sql} ORDER BY x.id DESC LIMIT ${limit} OFFSET ${offset}`, args);
  return rows(pool, `SELECT ${masterColumns(table)} FROM ${table} x WHERE 1=1${sql} ORDER BY x.id DESC LIMIT ${limit} OFFSET ${offset}`, args);
}
export async function listVehicleLifting(vehicleIds, scope) {
  const filter=`WHERE s.vehicle_id IN (${vehicleIds.map(()=>'?').join(',')})${scope.sql}`;
  const args=[...vehicleIds,...scope.params];
  const [trips,lots]=await Promise.all([
    rows(pool,`SELECT s.vehicle_id,s.id shipment_id,s.shipment_no trip_id,s.leg,s.flow_type,s.status,s.trip_status,
      s.trip_started_at trip_date,s.trip_completed_at,s.dispatched_at,s.delivered_at,
      s.expected_completion_at,s.season_id,se.name season_name,
      CAST(se.start_date AS CHAR) season_start_date,CAST(se.end_date AS CHAR) season_end_date,
      s.scheme_code,s.commodity_code,s.district_id,district.district_name,
      s.miller_id,m.name miller_name,s.driver_name,r.distance_km,r.duration_minutes,
      r.source_id,src.name source_name,s.source_lat,s.source_lng AS source_long,
      r.destination_id,dst.name destination_name,s.destination_lat,s.destination_lng AS destination_long,
      s.quantity_kg,CASE WHEN s.dispatched_at IS NOT NULL THEN s.quantity_kg END lifted_quantity_kg,
      s.accepted_kg AS received_quantity_kg,s.shortage_kg,s.total_bags AS no_of_bags,s.received_bags,
      CASE WHEN s.leg='CMR' THEN s.order_id END cmr_order_id,
      CASE WHEN s.leg='CMR' THEN o.order_no END cmr_order_no
      FROM shipments s LEFT JOIN shipment_routes r ON r.id=s.route_id
      LEFT JOIN facilities src ON src.id=r.source_id LEFT JOIN facilities dst ON dst.id=r.destination_id
      LEFT JOIN facilities m ON m.id=s.miller_id LEFT JOIN seasons se ON se.id=s.season_id
      LEFT JOIN tbl_district_master district ON district.id=s.district_id
      LEFT JOIN cmr_orders o ON o.id=s.order_id AND s.leg='CMR'
      ${filter} ORDER BY s.vehicle_id,s.id DESC`,args),
    rows(pool,`SELECT l.shipment_id,l.procurement_id,p.ro_no,CAST(p.ro_date AS CHAR) ro_date,l.quantity_kg,l.no_of_bags
      FROM shipment_lots l JOIN shipments s ON s.id=l.shipment_id
      JOIN procurement p ON p.id=l.procurement_id
      ${filter} AND s.leg='PADDY' ORDER BY l.shipment_id,l.procurement_id`,args)
  ]);
  const lotsByTrip=new Map();
  for(const {shipment_id,...lot} of lots){
    const tripId=String(shipment_id);
    if(!lotsByTrip.has(tripId))lotsByTrip.set(tripId,[]);
    lotsByTrip.get(tripId).push(lot);
  }
  const liftingByVehicle=new Map();
  for(const {vehicle_id,cmr_order_id,cmr_order_no,...trip} of trips){
    const vehicleId=String(vehicle_id);
    if(!liftingByVehicle.has(vehicleId))liftingByVehicle.set(vehicleId,[]);
    const reference=trip.leg==='PADDY'
      ? {ro_lots:lotsByTrip.get(String(trip.shipment_id))??[]}
      : {cmr_order:{order_id:cmr_order_id,order_no:cmr_order_no}};
    liftingByVehicle.get(vehicleId).push({...trip,...reference});
  }
  return liftingByVehicle;
}
export async function getMasterRecordFindX(table, v, context) {
  return one(pool, `SELECT ${masterColumns(table)} FROM ${table} x WHERE x.id=?${v.sql}`, [context.params.id, ...v.args]);
}
export async function updateFacilityFindFacilities(connection, context) {
  return one(connection, 'SELECT id,code,kind,name,address,district_id,latitude,longitude,radius_m,capacity_value,capacity_unit,milling_capacity_value_per_day,milling_capacity_unit,recovery_percent,contact_name,phone,active,created_by,created_by_core_user_id,created_by_user_type,created_at,updated_by,updated_at,core_store_id FROM facilities WHERE id=? FOR UPDATE', [context.params.id]);
}
export async function updateFacilityFindStocks(connection, f) {
  return one(connection, 'SELECT COALESCE(SUM(on_hand_kg),0) AS total FROM stocks WHERE facility_id=?', [f.id]);
}
export async function updateFacilityUpdateFacilities(connection, update, f) {
  return rows(connection, `UPDATE facilities SET ${Object.keys(update).map(k => `${k}=?`).join(',')} WHERE id=?`, [...Object.values(update), f.id]);
}
export async function updateSeasonFindSeasons(connection, context) {
  return one(connection, 'SELECT id FROM seasons WHERE id=? FOR UPDATE', [context.params.id]);
}
export async function updateSeasonUpdateSeasons(connection, update, s) {
  return rows(connection, `UPDATE seasons SET ${Object.keys(update).map(k => `${k}=?`).join(',')} WHERE id=?`, [...Object.values(update), s.id]);
}
export async function setFacilityOrSeasonStatusFindWHERE(connection, table, context) {
  return one(connection, `SELECT id FROM ${table} WHERE id=? FOR UPDATE`, [context.params.id]);
}
export async function setFacilityOrSeasonStatusUpdateSET(connection, table, data, context, record) {
  return rows(connection, `UPDATE ${table} SET active=?,updated_by=?,updated_at=? WHERE id=?`, [data.active, context.user.id ?? null, new Date(), record.id]);
}
export async function setMasterStatusFindX(connection, table, v, context) {
  return one(connection, `SELECT ${masterColumns(table)} FROM ${table} x WHERE x.id=?${v.sql} FOR UPDATE`, [context.params.id, ...v.args]);
}
export async function setMasterStatusCountShipments(connection, filter, type, r) {
  return one(connection, `SELECT COUNT(id) AS n FROM shipments WHERE ${filter} AND status IN ('PLANNED','DISPATCHED','IN_TRANSIT','ARRIVED')`, [type === 'gps-devices' ? r.vehicle_id : r.id]);
}
export async function setMasterStatusUpdateRouteTags(connection, data, unassignedBy, unassignedAt, r) {
  return rows(connection, 'UPDATE route_tags SET active=?,unassigned_by=?,unassigned_at=? WHERE id=?', [data.active, unassignedBy, unassignedAt, r.id]);
}
export async function setMasterStatusUpdateSET(connection, table, data, context, r) {
  return rows(connection, `UPDATE ${table} SET active=?,updated_by=?,updated_at=? WHERE id=?`, [data.active, context.user.id ?? null, new Date(), r.id]);
}
export async function updateMasterProfileFindX(connection, table, v, context) {
  return one(connection, `SELECT ${masterColumns(table)} FROM ${table} x WHERE x.id=?${v.sql} FOR UPDATE`, [context.params.id, ...v.args]);
}
export async function updateMasterProfileFindShipments(connection, record) {
  return one(connection, "SELECT MAX(quantity_kg) max_load FROM shipments WHERE vehicle_id=? AND status IN ('PLANNED','DISPATCHED','IN_TRANSIT','ARRIVED')", [record.id]);
}
export async function updateMasterProfileFindVehicleTypes(connection, data) {
  return one(connection, 'SELECT id FROM vehicle_types WHERE id=? AND active=1', [data.vehicle_type_id]);
}
export async function updateMasterProfileUpdateSET(connection, table, update, record) {
  return rows(connection, `UPDATE ${table} SET ${Object.keys(update).map(k => `${k}=?`).join(',')} WHERE id=?`, [...Object.values(update), record.id]);
}
