import { pool } from "../config/database.js";
import { rows, one } from "../repositories/database.js";
export async function dashboardVehicles(millerId,seasonId,{limit,offset}) {
  const args=[...(seasonId?[seasonId]:[]),millerId];
  const base=`FROM vehicles v LEFT JOIN transporters t ON t.id=v.transporter_id
    LEFT JOIN vehicle_types vt ON vt.id=v.vehicle_type_id LEFT JOIN gps_devices d ON d.vehicle_id=v.id
    LEFT JOIN imeis i ON i.id=d.imei_id
    LEFT JOIN shipments s ON s.vehicle_id=v.id AND s.status IN ('PLANNED','DISPATCHED','IN_TRANSIT','ARRIVED')${seasonId?' AND s.season_id=?':''}
    LEFT JOIN facilities source ON source.id=s.source_id LEFT JOIN facilities destination ON destination.id=s.destination_id
    WHERE COALESCE(v.miller_id,t.miller_id)=?`;
  const totals=await one(pool,`SELECT COUNT(*) total,SUM(v.active=1) active,SUM(v.active=0) inactive,
    SUM(d.id IS NOT NULL AND d.active=1) gps_enabled,SUM(s.id IS NOT NULL) assigned_trips ${base}`,args);
  const data=await rows(pool,`SELECT v.id,v.registration_no,v.capacity_g,v.active,vt.name vehicle_type,
    i.imei,i.provider,d.active gps_active,d.last_gps_at,d.latitude,d.longitude,d.speed_kph,
    s.id shipment_id,s.shipment_no,s.leg,s.status shipment_status,s.trip_status,s.trip_started_at,s.trip_completed_at,s.expected_completion_at,
    source.name source_name,destination.name destination_name ${base}
    ORDER BY v.active DESC,v.registration_no LIMIT ${limit} OFFSET ${offset}`,args);
  return {data,totals};
}
export async function listCmrLiftingSummary(millerId,seasonId,{limit,offset},schemeCode=null) {
  const args=[millerId,...(seasonId?[seasonId]:[]),...(schemeCode?[schemeCode]:[])];
  const base=`SELECT o.destination_id,f.name destination_name,f.kind,o.season_id,se.name season_name,o.scheme_code,o.commodity,
    SUM(o.rice_quantity_g) planned_g,
    COALESCE(SUM((SELECT COALESCE(SUM(s.quantity_g),0) FROM shipments s WHERE s.order_id=o.id
      AND s.leg='CMR' AND s.status IN ('DISPATCHED','IN_TRANSIT','ARRIVED','DELIVERED'))),0) lifted_g
    FROM cmr_orders o JOIN facilities f ON f.id=o.destination_id JOIN seasons se ON se.id=o.season_id
    WHERE o.miller_id=? AND o.status<>'CANCELLED'${seasonId?' AND o.season_id=?':''}${schemeCode?' AND o.scheme_code=?':''}
    GROUP BY o.destination_id,f.name,f.kind,o.season_id,se.name,o.scheme_code,o.commodity`;
  const summary=`SELECT grouped.*,GREATEST(0,planned_g-lifted_g) remaining_g FROM (${base}) grouped`;
  const totals=await one(pool,`SELECT COUNT(*) total,COALESCE(SUM(planned_g),0) planned_g,
    COALESCE(SUM(lifted_g),0) lifted_g,COALESCE(SUM(remaining_g),0) remaining_g FROM (${summary}) results`,args);
  const data=await rows(pool,`${summary} ORDER BY destination_name,season_id DESC LIMIT ${limit} OFFSET ${offset}`,args);
  return {data,totals};
}
export async function listStocksCountRecords(base, args) {
  return one(pool, `SELECT COUNT(*) total ${base}`, args);
}
export async function listStocksListRecords(base, limit, offset, args) {
  return rows(pool, `SELECT s.*,sc.code scheme_code,sc.scheme_name,co.code commodity,co.commodity_name,f.name,f.kind,CASE WHEN s.status=1 THEN s.on_hand_g-s.reserved_g ELSE 0 END available_g ${base} ORDER BY s.facility_id,s.season_id,s.scheme_id,s.commodity_id LIMIT ${limit} OFFSET ${offset}`, args);
}
export async function listLedgerCountStockLedger(filter, args) {
  return one(pool, `SELECT COUNT(*) total FROM stock_ledger l JOIN schemes sc ON sc.id=l.scheme_id JOIN commodities co ON co.id=l.commodity_id WHERE 1=1${filter}`, args);
}
export async function listLedgerListStockLedger(filter, limit, offset, args) {
  return rows(pool, `SELECT l.*,sc.code scheme_code,co.code commodity FROM stock_ledger l JOIN schemes sc ON sc.id=l.scheme_id JOIN commodities co ON co.id=l.commodity_id WHERE 1=1${filter} ORDER BY l.id DESC LIMIT ${limit} OFFSET ${offset}`, args);
}
export async function getMillerReconciliationFindFacilities(millerId) {
  return one(pool, "SELECT id,code,name,recovery_percent FROM facilities WHERE id=? AND kind='MILLER'", [millerId]);
}
export async function getMillerReconciliationFindShipments(millerId, seasonId) {
  return one(pool, `SELECT
    COALESCE(SUM(CASE WHEN leg='PADDY' AND status='DELIVERED' THEN accepted_g ELSE 0 END),0) paddy_received_g,
    COALESCE(SUM(CASE WHEN leg='PADDY' AND status='DELIVERED' THEN expected_rice_g ELSE 0 END),0) rice_obligation_g,
    COALESCE(SUM(CASE WHEN leg='CMR' AND status='DELIVERED' THEN accepted_g ELSE 0 END),0) rice_delivered_g,
    COALESCE(SUM(CASE WHEN leg='PADDY' THEN shortage_g ELSE 0 END),0) paddy_shortage_g,
    COALESCE(SUM(CASE WHEN leg='CMR' THEN shortage_g ELSE 0 END),0) rice_shortage_g,
    COALESCE(SUM(CASE WHEN leg='PADDY' AND status IN ('DISPATCHED','IN_TRANSIT','ARRIVED') THEN quantity_g ELSE 0 END),0) paddy_in_transit_g,
    COALESCE(SUM(CASE WHEN leg='CMR' AND status IN ('DISPATCHED','IN_TRANSIT','ARRIVED') THEN quantity_g ELSE 0 END),0) rice_in_transit_g
    FROM shipments WHERE miller_id=? AND season_id=?`, [millerId, seasonId]);
}
export async function getMillerReconciliationFindMillingBatches(millerId, seasonId) {
  return one(pool, 'SELECT COALESCE(SUM(paddy_consumed_g),0) paddy_milled_g,COALESCE(SUM(rice_produced_g),0) rice_produced_g,COALESCE(SUM(expected_rice_g),0) production_expected_rice_g FROM milling_batches WHERE miller_id=? AND season_id=?', [millerId, seasonId]);
}
export async function getMillerReconciliationFindCmrOrders(millerId, seasonId) {
  return one(pool, "SELECT COALESCE(SUM(rice_quantity_g),0) ordered_rice_g,COALESCE(SUM(committed_g),0) order_committed_g,COALESCE(SUM(delivered_g),0) order_delivered_g FROM cmr_orders WHERE miller_id=? AND season_id=? AND status<>'CANCELLED'", [millerId, seasonId]);
}
export async function getMillerReconciliationListStocks(millerId, seasonId) {
  return rows(pool, 'SELECT s.*,sc.code scheme_code,co.code commodity,CASE WHEN s.status=1 THEN s.on_hand_g-s.reserved_g ELSE 0 END available_g FROM stocks s JOIN schemes sc ON sc.id=s.scheme_id JOIN commodities co ON co.id=s.commodity_id WHERE s.facility_id=? AND s.season_id=?', [millerId, seasonId]);
}
export async function listStoreAssignmentsCountRecords(base, args) {
  return one(pool, `SELECT COUNT(*) total ${base}`, args);
}
export async function listStoreAssignmentsListRecords(base, limit, offset, args) {
  return rows(pool, `SELECT a.*,se.code season_code,se.name season_name,m.code miller_code,m.name miller_name,m.district_id miller_district_id,md.district_name miller_district,s.code store_code,s.name store_name,s.kind store_kind,s.district_id store_district_id,sd.district_name store_district,creator.name created_by_name,creator.email created_by_email,unassigner.name unassigned_by_name,unassigner.email unassigned_by_email ${base} ORDER BY a.active DESC,se.start_date DESC,m.name,sd.district_name,s.name,a.id LIMIT ${limit} OFFSET ${offset}`, args);
}
export async function getDashboardListShipments(filter, args) {
  return rows(pool, `SELECT s.leg,s.status,COUNT(*) count,COALESCE(SUM(s.quantity_g),0) quantity_g,COALESCE(SUM(s.accepted_g),0) accepted_g,COALESCE(SUM(s.shortage_g),0) shortage_g FROM shipments s WHERE 1=1${filter} GROUP BY s.leg,s.status`, args);
}
export async function getDashboardListShipments2(filter, staleMinutes, args) {
  return rows(pool, `SELECT s.id,s.shipment_no,s.status,v.registration_no,d.last_gps_at,d.latitude,d.longitude FROM shipments s JOIN vehicles v ON v.id=s.vehicle_id LEFT JOIN gps_devices d ON d.vehicle_id=v.id WHERE s.status IN ('DISPATCHED','IN_TRANSIT','ARRIVED') AND (d.last_gps_at IS NULL OR d.last_gps_at < DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? MINUTE))${filter} ORDER BY s.id LIMIT 200`, [staleMinutes, ...args]);
}
export async function listAuditCountAuditLog() {
  return one(pool, 'SELECT COUNT(*) total FROM audit_log');
}
export async function listAuditListAuditLog(limit, offset) {
  return rows(pool, `SELECT * FROM audit_log ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`);
}
export async function listAvailableLotsFindRouteTags(facilityId, context, seasonId) {
  return one(pool, 'SELECT id FROM route_tags WHERE source_id=? AND destination_id=? AND season_id=? AND active=1', [facilityId, context.user.miller_id, seasonId]);
}
export async function listAvailableLotsCountRecords(filter, args) {
  return one(pool, `SELECT COUNT(*) total ${filter}`, args);
}
export async function listAvailableLotsListRecords(filter, limit, offset, args) {
  return rows(pool, `SELECT p.id,p.facility_id,p.season_id,p.scheme_id,p.commodity_id,sc.code scheme_code,co.code commodity,p.procured_at,p.available_g-p.reserved_g unreserved_g ${filter} ORDER BY p.procured_at,p.id LIMIT ${limit} OFFSET ${offset}`, args);
}
