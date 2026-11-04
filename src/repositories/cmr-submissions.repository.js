import {requireStockMasters} from './stock-masters.repository.js';
import { pool } from "../config/database.js";
export async function requireActiveCmrMasters(connection, data) {
  return requireStockMasters(connection,data.scheme_type,data.commodity_type || 'RICE');
}
export async function listCmrSchemes() {
  return ['SCMR','CCMR'].map(code=>({code,scheme_name:code,description:null}));
}
export async function listCmrCommodities() {
  return [{code:'RICE',commodity_name:'Rice',description:null}];
}
import { rows, one } from "../repositories/database.js";
export async function submitCMRFindFacilities(connection, data) {
  return one(connection, "SELECT id,code,kind,district_id,core_store_id,active FROM facilities WHERE id=? AND active=1 AND kind IN ('SFC_GODOWN','FCI')", [data.destination_id]);
}
export async function submitCMRFindVehicles(connection, data) {
  return one(connection, 'SELECT v.vehicle_type_id FROM vehicles v JOIN vehicle_types vt ON vt.id=v.vehicle_type_id WHERE v.id=?', [data.vehicle_id]);
}
export async function getSubmissionOptionsListSeasons() {
  return rows(pool, 'SELECT id,code,name FROM seasons WHERE active=1 ORDER BY start_date DESC,id DESC');
}
export const listDistricts=()=>rows(pool,
  'SELECT id,district_name FROM tbl_district_master WHERE status=1 ORDER BY district_name,id');
export async function getSubmissionOptionsListTblDistrictMaster(context, seasonId) {
  return rows(pool, `SELECT d.id,d.district_name FROM tbl_district_master d
    WHERE d.status=1 AND EXISTS (
      SELECT 1 FROM miller_store_assignments a JOIN facilities f ON f.id=a.store_id
      WHERE a.miller_id=? AND a.season_id=? AND a.active=1 AND f.active=1
      AND f.kind IN ('SFC_GODOWN','FCI') AND f.district_id=d.id
    ) ORDER BY d.district_name`, [context.user.miller_id, seasonId]);
}
export async function getSubmissionOptionsListFacilities(districtId, context, seasonId) {
  return rows(pool, `SELECT f.id,f.code,f.kind,f.district_id,f.core_store_id,f.active
      FROM facilities f WHERE f.district_id=? AND f.kind IN ('SFC_GODOWN','FCI') AND f.active=1
      AND EXISTS (SELECT 1 FROM miller_store_assignments a
        WHERE a.store_id=f.id AND a.miller_id=? AND a.season_id=? AND a.active=1)`, [districtId, context.user.miller_id, seasonId]);
}
export async function getSubmissionOptionsListCmrOrders(context, seasonId, scheme) {
  return rows(pool, `SELECT o.id,o.order_no,o.district_id,o.lot_count,o.stenciling_code,o.destination_id,o.scheme_code,o.commodity,o.rice_quantity_kg-o.committed_kg-o.delivered_kg available_kg,
      f.name destination_name,f.kind,d.district_name
      FROM cmr_orders o JOIN facilities f ON f.id=o.destination_id JOIN tbl_district_master d ON d.id=f.district_id
      JOIN miller_store_assignments a ON a.season_id=o.season_id AND a.miller_id=o.miller_id AND a.store_id=o.destination_id AND a.active=1
      WHERE o.miller_id=? AND o.season_id=? AND o.scheme_code=? AND o.commodity='RICE' AND o.status='OPEN' AND f.active=1 AND d.status=1
      AND o.rice_quantity_kg>o.committed_kg+o.delivered_kg ORDER BY d.district_name,f.name,o.id`, [context.user.miller_id, seasonId, scheme]);
}
export async function getSubmissionOptionsFindStocks(context, seasonId, scheme) {
  return one(pool, "SELECT s.id,s.scheme_code,s.commodity_code,s.status,s.on_hand_kg,s.reserved_kg,CASE WHEN s.status=1 THEN s.on_hand_kg-s.reserved_kg ELSE 0 END available_kg FROM stocks s WHERE s.facility_id=? AND s.season_id=? AND s.commodity_code='RICE' AND s.scheme_code=?", [context.user.miller_id, seasonId, scheme], false);
}
export async function listEligibleVehiclesListVehicles(context) {
  return rows(pool, `SELECT v.id,v.registration_no,v.capacity_value,v.capacity_unit,vt.name vehicle_type,1 gps_active,0 busy
    FROM vehicles v JOIN vehicle_types vt ON vt.id=v.vehicle_type_id
    WHERE v.active=1 AND v.capacity_value>0
      AND EXISTS(SELECT 1 FROM gps_devices d WHERE d.vehicle_id=v.id AND d.active=1)
      AND NOT EXISTS(SELECT 1 FROM shipments s WHERE s.vehicle_id=v.id AND s.status IN ('PLANNED','DISPATCHED','IN_TRANSIT','ARRIVED'))
    ORDER BY v.registration_no`, []);
}
export async function getVehicleFindGpsDevices(registration, context) {
  return one(pool, `SELECT v.id,v.registration_no,v.capacity_value,v.capacity_unit,vt.name vehicle_type,v.transporter_name,v.transporter_contact_no,v.district_id,
    EXISTS(SELECT 1 FROM gps_devices d WHERE d.vehicle_id=v.id AND d.active=1) gps_active,
    EXISTS(SELECT 1 FROM shipments s WHERE s.vehicle_id=v.id AND s.status IN ('PLANNED','DISPATCHED','IN_TRANSIT','ARRIVED')) busy
    FROM vehicles v JOIN vehicle_types vt ON vt.id=v.vehicle_type_id
    WHERE v.registration_no=? AND v.active=1`, [registration]);
}
