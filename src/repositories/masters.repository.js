import {masterColumns} from './master-columns.js';
import { pool } from "../config/database.js";
import { rows, one, insert } from "../repositories/database.js";
export async function findActiveImei(connection, id) {
  return one(connection, 'SELECT id FROM imeis WHERE id=? AND active=1 FOR UPDATE', [id]);
}
export async function findActiveImeiDevice(connection, id) {
  return one(connection, 'SELECT id FROM gps_devices WHERE imei_id=? AND active=1', [id], false);
}
export async function updateDeviceMappingState(connection, id, active, location) {
  const status = active ? 'MAPPED' : 'AVAILABLE';
  await rows(connection, 'UPDATE imeis SET status_updated_at=IF(NOT(mapping_status <=> ?),UTC_TIMESTAMP(),status_updated_at),mapping_status=?,district_id=?,block_id=? WHERE id=?', [status, status, location.district_id, location.block_id, id]);
  await rows(connection, 'UPDATE vehicles SET status_updated_at=IF(NOT(mapping_status <=> ?),UTC_TIMESTAMP(),status_updated_at),mapping_status=? WHERE id=?', [status, status, location.vehicle_id]);
}
export async function syncImeiLocation(connection, id, location) {
  await rows(connection, 'UPDATE imeis SET district_id=?,block_id=? WHERE id=?', [location.district_id, location.block_id, id]);
  await rows(connection, 'UPDATE gps_devices SET district_id=?,block_id=? WHERE imei_id=? AND active=1', [location.district_id, location.block_id, id]);
}
export async function ensureLocationFindTblDistrictMaster(connection, districtId) {
  return one(connection, 'SELECT id FROM tbl_district_master WHERE id=? AND status=1', [districtId]);
}
export async function ensureLocationFindTblBlockMaster(connection, blockId, districtId) {
  return one(connection, 'SELECT id FROM tbl_block_master WHERE id=? AND district_id=?', [blockId, districtId]);
}
export async function createMasterFindFacilities(connection, data) {
  return one(connection, "SELECT id FROM facilities WHERE id=? AND kind='MILLER' AND active=1", [data.miller_id]);
}
export async function createMasterFindTransporters(connection, data) {
  return one(connection, 'SELECT id,miller_id,code,name,contact_name,phone,address,district_id,block_id,active,created_by,created_at,updated_by,updated_at FROM transporters WHERE id=? AND active=1', [data.transporter_id]);
}
export async function createMasterFindFacilities2(connection, data) {
  return one(connection, "SELECT id FROM facilities WHERE id=? AND kind='MILLER' AND active=1", [data.miller_id]);
}
export async function createMasterFindVehicleTypes(connection, data) {
  return one(connection, 'SELECT id FROM vehicle_types WHERE id=? AND active=1', [data.vehicle_type_id]);
}
export async function createMasterFindVehicles(connection, data) {
  return one(connection, 'SELECT v.id,v.transporter_id,v.vehicle_type_id,v.registration_no,v.capacity_g,v.active,v.created_by,v.created_at,v.updated_by,v.updated_at,v.mapping_status,v.status_updated_at,COALESCE(v.miller_id,t.miller_id) miller_id FROM vehicles v LEFT JOIN transporters t ON t.id=v.transporter_id WHERE v.id=? AND v.active=1 AND (v.transporter_id IS NULL OR t.active=1)', [data.vehicle_id]);
}
export async function createMasterFindFacilities3(connection, data) {
  return one(connection, 'SELECT id,code,kind,name,address,district_id,block_id,latitude,longitude,radius_m,capacity_g,milling_capacity_g_per_day,recovery_percent,contact_name,phone,active,created_by,created_by_core_user_id,created_by_user_type,created_at,updated_by,updated_at,core_store_id FROM facilities WHERE id=? AND active=1', [data.source_id]);
}
export async function createMasterFindFacilities4(connection, data) {
  return one(connection, 'SELECT id,code,kind,name,address,district_id,block_id,latitude,longitude,radius_m,capacity_g,milling_capacity_g_per_day,recovery_percent,contact_name,phone,active,created_by,created_by_core_user_id,created_by_user_type,created_at,updated_by,updated_at,core_store_id FROM facilities WHERE id=? AND active=1', [data.destination_id]);
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
  return rows(pool, "SELECT f.id,f.code,f.name,f.kind,f.district_id,f.block_id,d.district_name,b.block_name FROM facilities f LEFT JOIN tbl_district_master d ON d.id=f.district_id LEFT JOIN tbl_block_master b ON b.id=f.block_id WHERE f.kind IN ('PACS','LAMPS') AND f.active=1 ORDER BY d.district_name,f.kind,f.name,f.id");
}
export async function listRouteTagAssignmentOptionsListFacilities2() {
  return rows(pool, "SELECT f.id,f.code,f.name,f.district_id,f.block_id,d.district_name,b.block_name FROM facilities f LEFT JOIN tbl_district_master d ON d.id=f.district_id LEFT JOIN tbl_block_master b ON b.id=f.block_id WHERE f.kind='MILLER' AND f.active=1 ORDER BY d.district_name,f.name,f.id");
}
export async function listLocationOptionsListTblDistrictMaster() {
  return rows(pool, 'SELECT id,id_old,district_name FROM tbl_district_master WHERE status=1 ORDER BY district_name,id');
}
export async function listLocationOptionsListTblBlockMaster(districtId) {
  return rows(pool, 'SELECT id,district_id,block_name,rgi_block_code FROM tbl_block_master WHERE district_id=? ORDER BY block_name,id', [districtId]);
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
  if (table === 'gps_devices') return rows(pool, `SELECT x.id,x.vehicle_id,x.imei_id,x.district_id,x.block_id,x.model,x.sim_no,x.active,x.created_by,x.created_at,x.updated_by,x.updated_at,x.last_gps_at,x.latitude,x.longitude,x.speed_kph,i.imei,i.provider FROM gps_devices x JOIN imeis i ON i.id=x.imei_id WHERE 1=1${sql} ORDER BY x.id DESC LIMIT ${limit} OFFSET ${offset}`, args);
  return rows(pool, `SELECT ${masterColumns(table)} FROM ${table} x WHERE 1=1${sql} ORDER BY x.id DESC LIMIT ${limit} OFFSET ${offset}`, args);
}
export async function getMasterRecordFindX(table, v, context) {
  return one(pool, `SELECT ${masterColumns(table)} FROM ${table} x WHERE x.id=?${v.sql}`, [context.params.id, ...v.args]);
}
export async function updateFacilityFindFacilities(connection, context) {
  return one(connection, 'SELECT id,code,kind,name,address,district_id,block_id,latitude,longitude,radius_m,capacity_g,milling_capacity_g_per_day,recovery_percent,contact_name,phone,active,created_by,created_by_core_user_id,created_by_user_type,created_at,updated_by,updated_at,core_store_id FROM facilities WHERE id=? FOR UPDATE', [context.params.id]);
}
export async function updateFacilityFindStocks(connection, f) {
  return one(connection, 'SELECT COALESCE(SUM(on_hand_g),0) AS total FROM stocks WHERE facility_id=?', [f.id]);
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
  return one(connection, `SELECT COUNT(id) AS n FROM shipment_details WHERE ${filter} AND status IN ('PLANNED','DISPATCHED','IN_TRANSIT','ARRIVED')`, [type === 'gps-devices' ? r.vehicle_id : r.id]);
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
  return one(connection, "SELECT MAX(quantity_g) max_load FROM shipment_details WHERE vehicle_id=? AND status IN ('PLANNED','DISPATCHED','IN_TRANSIT','ARRIVED')", [record.id]);
}
export async function updateMasterProfileFindVehicleTypes(connection, data) {
  return one(connection, 'SELECT id FROM vehicle_types WHERE id=? AND active=1', [data.vehicle_type_id]);
}
export async function updateMasterProfileUpdateSET(connection, table, update, record) {
  return rows(connection, `UPDATE ${table} SET ${Object.keys(update).map(k => `${k}=?`).join(',')} WHERE id=?`, [...Object.values(update), record.id]);
}

export function requireCoreDMMiller(connection, millerId, districtIds) {
  return one(connection, "SELECT id FROM facilities WHERE id=? AND kind='MILLER' AND active=1 AND district_id IN (" + districtIds.map(() => '?').join(',') + ') FOR UPDATE', [millerId, ...districtIds], true, { status: 403, code: 'DISTRICT_FORBIDDEN', message: 'Miller is outside your assigned districts or inactive' });
}
