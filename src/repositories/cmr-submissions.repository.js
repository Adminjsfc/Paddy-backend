import { pool } from "../config/database.js";
export async function requireActiveCmrMasters(connection, data) {
  await one(connection, 'SELECT id FROM schemes WHERE code=? AND active=1 FOR UPDATE', [data.scheme_type]);
  await one(connection, 'SELECT id FROM commodities WHERE code=? AND active=1 FOR UPDATE', [data.commodity_type || 'RICE']);
}
export async function listCmrSchemes() {
  return rows(pool, "SELECT id,code,scheme_name,description FROM schemes WHERE active=1 AND code IN ('SCMR','CCMR') ORDER BY id");
}
export async function listCmrCommodities() {
  return rows(pool, "SELECT id,code,commodity_name,description FROM commodities WHERE active=1 AND code='RICE' ORDER BY id");
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
  return rows(pool, `SELECT o.id,o.order_no,o.destination_id,o.scheme_code,o.commodity,o.rice_quantity_g-o.committed_g-o.delivered_g available_g,
      f.name destination_name,f.kind,f.district_id,d.district_name
      FROM cmr_orders o JOIN facilities f ON f.id=o.destination_id JOIN tbl_district_master d ON d.id=f.district_id
      JOIN miller_store_assignments a ON a.season_id=o.season_id AND a.miller_id=o.miller_id AND a.store_id=o.destination_id AND a.active=1
      WHERE o.miller_id=? AND o.season_id=? AND o.scheme_code=? AND o.commodity='RICE' AND o.status='OPEN' AND f.active=1 AND d.status=1
      AND o.rice_quantity_g>o.committed_g+o.delivered_g ORDER BY d.district_name,f.name,o.id`, [context.user.miller_id, seasonId, scheme]);
}
export async function getSubmissionOptionsFindStocks(context, seasonId, scheme) {
  return one(pool, "SELECT s.id,s.scheme_id,s.commodity_id,s.status,s.on_hand_g,s.reserved_g,CASE WHEN s.status=1 THEN s.on_hand_g-s.reserved_g ELSE 0 END available_g FROM stocks s JOIN schemes sc ON sc.id=s.scheme_id JOIN commodities co ON co.id=s.commodity_id WHERE s.facility_id=? AND s.season_id=? AND co.code='RICE' AND sc.code=?", [context.user.miller_id, seasonId, scheme], false);
}
export async function listEligibleVehiclesListVehicles(context) {
  return rows(pool, `SELECT v.id,v.registration_no,v.capacity_g,vt.name vehicle_type,1 gps_active,0 busy
    FROM vehicles v LEFT JOIN transporters t ON t.id=v.transporter_id JOIN vehicle_types vt ON vt.id=v.vehicle_type_id
    WHERE COALESCE(v.miller_id,t.miller_id)=? AND v.active=1 AND v.capacity_g>0
      AND (v.transporter_id IS NULL OR t.active=1)
      AND EXISTS(SELECT 1 FROM gps_devices d WHERE d.vehicle_id=v.id AND d.active=1)
      AND NOT EXISTS(SELECT 1 FROM shipments s WHERE s.vehicle_id=v.id AND s.status IN ('PLANNED','DISPATCHED','IN_TRANSIT','ARRIVED'))
    ORDER BY v.registration_no`, [context.user.miller_id]);
}
export async function getVehicleFindGpsDevices(registration, context) {
  return one(pool, `SELECT v.id,v.registration_no,v.capacity_g,vt.name vehicle_type,t.name transporter_name,
    EXISTS(SELECT 1 FROM gps_devices d WHERE d.vehicle_id=v.id AND d.active=1) gps_active,
    EXISTS(SELECT 1 FROM shipments s WHERE s.vehicle_id=v.id AND s.status IN ('PLANNED','DISPATCHED','IN_TRANSIT','ARRIVED')) busy
    FROM vehicles v LEFT JOIN transporters t ON t.id=v.transporter_id JOIN vehicle_types vt ON vt.id=v.vehicle_type_id
    WHERE v.registration_no=? AND COALESCE(v.miller_id,t.miller_id)=? AND v.active=1 AND (v.transporter_id IS NULL OR t.active=1)`, [registration, context.user.miller_id]);
}
