import { pool } from "../config/database.js";
import { rows, one, insert } from "../repositories/database.js";
import { grams, hash } from "../utils/core.js";
export function createPaddyUser(connection,data) {
  return insert(connection,'users',data);
}
export async function scopedDMFacilityFindFacilities(connection, facilityId) {
  return one(connection, 'SELECT * FROM facilities WHERE id=? AND active=1', [facilityId]);
}
export async function listPaddyOptionsListFacilities(marks, ids) {
  return rows(pool, `SELECT f.id,f.code,f.name,f.kind,f.district_id,d.district_name,b.block_name FROM facilities f
    JOIN tbl_district_master d ON d.id=f.district_id LEFT JOIN tbl_block_master b ON b.id=f.block_id
    WHERE f.kind IN ('PACS','LAMPS') AND f.active=1 AND f.district_id IN (${marks}) ORDER BY f.name`, ids);
}
export async function listPaddyOptionsListFacilities2(marks, ids) {
  return rows(pool, `SELECT id,code,name,district_id FROM facilities WHERE kind='MILLER' AND active=1 AND district_id IN (${marks}) ORDER BY name`, ids);
}
export async function listPaddyOptionsListSeasons() {
  return rows(pool, 'SELECT id,name FROM seasons WHERE active=1 ORDER BY start_date DESC,id DESC');
}
export async function listPaddyOptionsListRouteTags(marks, ids) {
  return rows(pool, `SELECT a.id,a.active,a.season_id,se.name season_name,s.name source_name,s.kind,m.name miller_name
    FROM route_tags a JOIN facilities s ON s.id=a.source_id JOIN facilities m ON m.id=a.destination_id JOIN seasons se ON se.id=a.season_id
    WHERE s.kind IN ('PACS','LAMPS') AND m.kind='MILLER' AND s.district_id IN (${marks}) AND m.district_id IN (${marks})
    ORDER BY a.id DESC LIMIT 200`, [...ids, ...ids]);
}
export async function assignPaddySourceFindSeasons(connection, data) {
  return one(connection, 'SELECT id FROM seasons WHERE id=? AND active=1', [data.season_id]);
}
export async function assignPaddySourceExecuteRouteTags(connection, data) {
  return rows(connection, `INSERT INTO route_tags(season_id,source_id,destination_id,created_by) VALUES (?,?,?,NULL)
    ON DUPLICATE KEY UPDATE active=1,unassigned_by=NULL,unassigned_at=NULL`, [data.season_id, data.source_id, data.destination_id]);
}
export async function assignPaddySourceFindRouteTags(connection, data) {
  return one(connection, 'SELECT id,season_id,source_id,destination_id,active FROM route_tags WHERE season_id=? AND source_id=? AND destination_id=?', [data.season_id, data.source_id, data.destination_id]);
}
export async function getSetupOptionsListFacilities(marks, ids) {
  return rows(pool, `SELECT id,code,name,district_id FROM facilities WHERE kind='MILLER' AND active=1 AND district_id IN (${marks}) ORDER BY name`, ids);
}
export async function getSetupOptionsListFacilities2(marks, ids) {
  return rows(pool, `SELECT id,store_id code,store_name name,CASE WHEN store_type=1 THEN 'FCI' ELSE 'SFC_GODOWN' END kind,district_id,id core_store_id FROM tbl_store_location_master WHERE store_type IN (1,2) AND status=1 AND district_id IN (${marks}) ORDER BY store_name,id`, ids);
}
export async function getSetupOptionsListSeasons() {
  return rows(pool, 'SELECT id,name,code FROM seasons WHERE active=1 ORDER BY start_date DESC,id DESC');
}
export async function getSetupOptionsListMillerStoreAssignments(marks, ids) {
  return rows(pool, `SELECT a.*,m.name miller_name,f.name destination_name FROM miller_store_assignments a JOIN facilities m ON m.id=a.miller_id JOIN facilities f ON f.id=a.store_id WHERE m.district_id IN (${marks}) ORDER BY a.id DESC LIMIT 200`, ids);
}
export async function getSetupOptionsListCmrOrders(marks, ids) {
  return rows(pool, `SELECT o.*,m.name miller_name,f.name destination_name FROM cmr_orders o JOIN facilities m ON m.id=o.miller_id JOIN facilities f ON f.id=o.destination_id WHERE m.district_id IN (${marks}) ORDER BY o.id DESC LIMIT 200`, ids);
}
export async function getSetupOptionsListStocks(marks, ids) {
  return rows(pool, `SELECT s.*,sc.code scheme_code,co.code commodity,f.name miller_name FROM stocks s JOIN schemes sc ON sc.id=s.scheme_id JOIN commodities co ON co.id=s.commodity_id JOIN facilities f ON f.id=s.facility_id WHERE f.kind='MILLER' AND f.district_id IN (${marks}) AND co.code='RICE'`, ids);
}
export async function getSetupOptionsListGpsDevices(marks, ids) {
  return rows(pool, `SELECT v.id,v.registration_no,v.miller_id,v.capacity_g,m.name miller_name,(SELECT i.imei FROM gps_devices linked_device JOIN imeis i ON i.id=linked_device.imei_id WHERE linked_device.vehicle_id=v.id AND linked_device.active=1 ORDER BY linked_device.id DESC LIMIT 1) imei,EXISTS(SELECT 1 FROM gps_devices d WHERE d.vehicle_id=v.id AND d.active=1) gps_active FROM vehicles v JOIN facilities m ON m.id=v.miller_id WHERE m.district_id IN (${marks}) ORDER BY v.id DESC LIMIT 200`, ids);
}
export async function getSetupOptionsListVehicleTypes() {
  return rows(pool, 'SELECT id,name FROM vehicle_types WHERE active=1 ORDER BY name');
}
export async function assignReceivingStoreFindSeasons(connection, data) {
  return one(connection, 'SELECT id FROM seasons WHERE id=? AND active=1', [data.season_id]);
}
export async function assignReceivingStoreExecuteMillerStoreAssignments(connection, data) {
  return rows(connection, 'INSERT INTO miller_store_assignments(season_id,miller_id,store_id,created_by) VALUES (?,?,?,NULL) ON DUPLICATE KEY UPDATE active=1,unassigned_by=NULL,unassigned_at=NULL', [data.season_id, data.miller_id, data.store_id]);
}
export async function createCmrOrderFindSeasons(connection, data) {
  return one(connection, 'SELECT id FROM seasons WHERE id=? AND active=1', [data.season_id]);
}
export async function createCmrOrderFindMillerStoreAssignments(connection, data) {
  return one(connection, 'SELECT id FROM miller_store_assignments WHERE season_id=? AND miller_id=? AND store_id=? AND active=1', [data.season_id, data.miller_id, data.destination_id]);
}
export async function createCmrOrderInsertCmrOrders(connection, context, data) {
  return insert(connection, 'cmr_orders', {
    external_ref: `DM:${context.user.core_user_id}:${data.order_no}`,
    payload_hash: hash(data),
    scheme_code: data.scheme_code,
    commodity: 'RICE',
    season_id: data.season_id,
    miller_id: data.miller_id,
    destination_id: data.destination_id,
    order_no: data.order_no,
    ordered_at: new Date(),
    due_date: data.due_date,
    rice_quantity_g: grams(data.rice_quantity)
  });
}
export async function addTestRiceFindSeasons(connection, data) {
  return one(connection, 'SELECT id FROM seasons WHERE id=? AND active=1', [data.season_id]);
}
export async function addTestRiceInsertTestStockEntries(connection, data, amount) {
  return insert(connection, 'test_stock_entries', {
    reference: 'DM-TEST:' + data.reference,
    scheme_code: data.scheme_code,
    facility_id: data.miller_id,
    season_id: data.season_id,
    quantity_g: amount
  });
}

export function lockSelectedDepot(connection, storeId) {
  return one(connection, 'SELECT * FROM tbl_store_location_master WHERE id=? AND status=1 AND store_type IN (1,2) FOR UPDATE', [storeId]);
}
export function findDepotFacility(connection, storeId) {
  return one(connection, 'SELECT * FROM facilities WHERE core_store_id=? FOR UPDATE', [storeId], false);
}
export async function depotLocationMasters(connection) {
  return {
    districts: new Map((await rows(connection, 'SELECT id,district_name FROM tbl_district_master')).map(row => [Number(row.id), row])),
    blocks: await rows(connection, 'SELECT id,district_id,rgi_block_code,block_name FROM tbl_block_master')
  };
}
export function insertDepotFacility(connection, data) {
  return insert(connection, 'facilities', data);
}

export function findSelectedMillerVehicle(connection, vehicleId, millerId) {
  return one(connection, 'SELECT id FROM vehicles WHERE id=? AND miller_id=? AND active=1 FOR UPDATE', [vehicleId, millerId], true, {status: 400, code: 'INVALID_VEHICLE', message: 'Select an active vehicle belonging to the selected Miller'});
}
