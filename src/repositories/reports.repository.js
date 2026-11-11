import { pool } from "../config/database.js";
import { rows, one } from "../repositories/database.js";
export async function dashboardVehicles(millerId,seasonId,{limit,offset}) {
  const args=[millerId,...(seasonId?[seasonId]:[]),millerId];
  const base=`FROM vehicles v
    LEFT JOIN vehicle_types vt ON vt.id=v.vehicle_type_id LEFT JOIN gps_devices d ON d.vehicle_id=v.id
    LEFT JOIN imeis i ON i.id=d.imei_id
    LEFT JOIN shipments s ON s.vehicle_id=v.id AND s.status IN ('PLANNED','DISPATCHED','IN_TRANSIT','ARRIVED') AND s.miller_id=?${seasonId?' AND s.season_id=?':''}
    LEFT JOIN shipment_routes sr ON sr.id=s.route_id
    LEFT JOIN facilities source ON source.id=sr.source_id LEFT JOIN facilities destination ON destination.id=sr.destination_id
    WHERE EXISTS (SELECT 1 FROM shipments assigned WHERE assigned.vehicle_id=v.id AND assigned.miller_id=?)`;
  const totals=await one(pool,`SELECT COUNT(v.id) total,SUM(v.active=1) active,SUM(v.active=0) inactive,
    SUM(d.id IS NOT NULL AND d.active=1) gps_enabled,SUM(s.id IS NOT NULL) assigned_trips ${base}`,args);
  const data=await rows(pool,`SELECT v.id,v.registration_no,v.capacity_value,v.capacity_unit,v.active,vt.name vehicle_type,
    i.imei,i.provider,d.active gps_active,d.last_gps_at,d.latitude,d.longitude,d.speed_kph,
    s.id shipment_id,s.shipment_no,s.leg,s.status shipment_status,s.trip_status,s.trip_started_at,s.trip_completed_at,s.expected_completion_at,
    source.name source_name,destination.name destination_name ${base}
    ORDER BY v.active DESC,v.registration_no LIMIT ${limit} OFFSET ${offset}`,args);
  return {data,totals};
}
export async function listCmrLiftingSummary(millerId,seasonId,{limit,offset},schemeCode=null) {
  const args=[millerId,...(seasonId?[seasonId]:[]),...(schemeCode?[schemeCode]:[])];
  const base=`SELECT o.destination_id,f.name destination_name,f.kind,o.season_id,se.name season_name,o.scheme_code,o.commodity,
    SUM(o.rice_quantity_kg) planned_kg,
    COALESCE(SUM((SELECT COALESCE(SUM(s.quantity_kg),0) FROM shipments s WHERE s.order_id=o.id
      AND s.leg='CMR' AND s.status IN ('DISPATCHED','IN_TRANSIT','ARRIVED','DELIVERED'))),0) lifted_kg
    FROM cmr_orders o JOIN facilities f ON f.id=o.destination_id JOIN seasons se ON se.id=o.season_id
    WHERE o.miller_id=? AND o.status<>'CANCELLED'${seasonId?' AND o.season_id=?':''}${schemeCode?' AND o.scheme_code=?':''}
    GROUP BY o.destination_id,f.name,f.kind,o.season_id,se.name,o.scheme_code,o.commodity`;
  const summary=`SELECT grouped.destination_id,grouped.destination_name,grouped.kind,grouped.season_id,grouped.season_name,grouped.scheme_code,grouped.commodity,grouped.planned_kg,grouped.lifted_kg,GREATEST(0,planned_kg-lifted_kg) remaining_kg FROM (${base}) grouped`;
  const totals=await one(pool,`SELECT COUNT(*) total,COALESCE(SUM(planned_kg),0) planned_kg,
    COALESCE(SUM(lifted_kg),0) lifted_kg,COALESCE(SUM(remaining_kg),0) remaining_kg FROM (${summary}) results`,args);
  const data=await rows(pool,`${summary} ORDER BY destination_name,season_id DESC LIMIT ${limit} OFFSET ${offset}`,args);
  return {data,totals};
}
export async function listStocksCountRecords(base, args) {
  return one(pool, `SELECT COUNT(s.id) total ${base}`, args);
}
export async function listStocksListRecords(base, limit, offset, args) {
  return rows(pool, `SELECT s.id,s.facility_id,s.season_id,s.on_hand_kg,s.reserved_kg,s.scheme_code,s.commodity_code,s.created_at,s.created_by,s.updated_at,s.updated_by,s.created_by_actor,s.updated_by_actor,s.status,s.commodity_code commodity,f.name,f.kind,
    (SELECT COALESCE(SUM(GREATEST(l.on_hand_delta_kg,0)),0) FROM stock_ledger l WHERE l.stock_id=s.id) total_in_kg,
    (SELECT COALESCE(SUM(GREATEST(-l.on_hand_delta_kg,0)),0) FROM stock_ledger l WHERE l.stock_id=s.id) total_out_kg,
    CASE WHEN s.status=1 THEN s.on_hand_kg-s.reserved_kg ELSE 0 END available_kg ${base} ORDER BY s.facility_id,s.season_id,s.scheme_code,s.commodity_code LIMIT ${limit} OFFSET ${offset}`, args);
}
export async function listLedgerCountStockLedger(filter, args) {
  return one(pool, `SELECT COUNT(l.id) total FROM stock_ledger l WHERE 1=1${filter}`, args);
}
export async function listLedgerListStockLedger(filter, limit, offset, args) {
  return rows(pool, `SELECT l.id,l.stock_id,l.facility_id,l.season_id,l.on_hand_delta_kg,l.reserved_delta_kg,l.reference_type,l.reference_id,l.created_at,l.scheme_code,l.commodity_code,l.created_by,l.updated_at,l.updated_by,l.created_by_actor,l.updated_by_actor,l.status,l.commodity_code commodity,
    CASE WHEN l.on_hand_delta_kg>0 THEN 'IN' WHEN l.on_hand_delta_kg<0 THEN 'OUT' WHEN l.reserved_delta_kg>0 THEN 'RESERVE' ELSE 'RELEASE' END movement,
    GREATEST(l.on_hand_delta_kg,0) in_quantity_kg,GREATEST(-l.on_hand_delta_kg,0) out_quantity_kg,
    (SELECT COALESCE(SUM(b.on_hand_delta_kg),0) FROM stock_ledger b WHERE b.stock_id=l.stock_id AND b.id<=l.id) balance_kg,
    (SELECT COALESCE(SUM(b.reserved_delta_kg),0) FROM stock_ledger b WHERE b.stock_id=l.stock_id AND b.id<=l.id) reserved_balance_kg,
    CASE WHEN l.reference_type IN ('CMR_ORDER','CMR_ORDER_ADJUSTMENT','CMR_ORDER_CANCEL') THEN (SELECT order_no FROM cmr_orders WHERE id=l.reference_id)
      WHEN l.reference_type='PROCUREMENT' THEN (SELECT ro_no FROM procurement WHERE id=l.reference_id)
      WHEN l.reference_type='PROCUREMENT_CORRECTION' THEN (SELECT p.ro_no FROM procurement_corrections c JOIN procurement p ON p.id=c.procurement_id WHERE c.id=l.reference_id)
      WHEN l.reference_type IN ('RESERVE','DISPATCH','CANCEL') THEN (SELECT shipment_no FROM shipments WHERE id=l.reference_id) END reference_no
    FROM stock_ledger l WHERE 1=1${filter} ORDER BY l.id DESC LIMIT ${limit} OFFSET ${offset}`, args);
}
export async function getMillerReconciliationFindFacilities(millerId) {
  return one(pool, "SELECT id,code,name,recovery_percent FROM facilities WHERE id=? AND kind='MILLER'", [millerId]);
}
export async function getMillerReconciliationFindShipments(millerId, seasonId) {
  return one(pool, `SELECT
    COALESCE(SUM(CASE WHEN leg='PADDY' AND status='DELIVERED' THEN accepted_kg ELSE 0 END),0) paddy_received_kg,
    COALESCE(SUM(CASE WHEN leg='PADDY' AND status='DELIVERED' THEN expected_rice_kg ELSE 0 END),0) rice_obligation_kg,
    COALESCE(SUM(CASE WHEN leg='CMR' AND status='DELIVERED' THEN accepted_kg ELSE 0 END),0) rice_delivered_kg,
    COALESCE(SUM(CASE WHEN leg='PADDY' THEN shortage_kg ELSE 0 END),0) paddy_shortage_kg,
    COALESCE(SUM(CASE WHEN leg='CMR' THEN shortage_kg ELSE 0 END),0) rice_shortage_kg,
    COALESCE(SUM(CASE WHEN leg='PADDY' AND status IN ('DISPATCHED','IN_TRANSIT','ARRIVED') THEN quantity_kg ELSE 0 END),0) paddy_in_transit_kg,
    COALESCE(SUM(CASE WHEN leg='CMR' AND status IN ('DISPATCHED','IN_TRANSIT','ARRIVED') THEN quantity_kg ELSE 0 END),0) rice_in_transit_kg
    FROM shipments WHERE miller_id=? AND season_id=?`, [millerId, seasonId]);
}
export async function getMillerReconciliationFindMillingBatches(millerId, seasonId) {
  return one(pool, 'SELECT COALESCE(SUM(paddy_consumed_kg),0) paddy_milled_kg,COALESCE(SUM(rice_produced_kg),0) rice_produced_kg,COALESCE(SUM(expected_rice_kg),0) production_expected_rice_kg FROM milling_batches WHERE miller_id=? AND season_id=?', [millerId, seasonId]);
}
export async function getMillerReconciliationFindCmrOrders(millerId, seasonId) {
  return one(pool, "SELECT COALESCE(SUM(rice_quantity_kg),0) ordered_rice_kg,COALESCE(SUM(committed_kg),0) order_committed_kg,COALESCE(SUM(delivered_kg),0) order_delivered_kg FROM cmr_orders WHERE miller_id=? AND season_id=? AND status<>'CANCELLED'", [millerId, seasonId]);
}
export async function getMillerReconciliationListStocks(millerId, seasonId) {
  return rows(pool, 'SELECT s.id,s.facility_id,s.season_id,s.on_hand_kg,s.reserved_kg,s.scheme_code,s.commodity_code,s.created_at,s.created_by,s.updated_at,s.updated_by,s.created_by_actor,s.updated_by_actor,s.status,s.commodity_code commodity,CASE WHEN s.status=1 THEN s.on_hand_kg-s.reserved_kg ELSE 0 END available_kg FROM stocks s WHERE s.facility_id=? AND s.season_id=?', [millerId, seasonId]);
}
export async function listStoreAssignmentsCountRecords(base, args) {
  return one(pool, `SELECT COUNT(a.id) total ${base}`, args);
}
export async function listStoreAssignmentsListRecords(base, limit, offset, args) {
  return rows(pool, `SELECT a.id,a.season_id,a.miller_id,a.store_id,a.active,a.created_by,a.created_at,a.unassigned_by,a.unassigned_at,se.code season_code,se.name season_name,m.code miller_code,m.name miller_name,m.district_id miller_district_id,md.district_name miller_district,s.code store_code,s.name store_name,s.kind store_kind,s.district_id store_district_id,sd.district_name store_district,creator.name created_by_name,creator.email created_by_email,unassigner.name unassigned_by_name,unassigner.email unassigned_by_email ${base} ORDER BY a.active DESC,se.start_date DESC,m.name,sd.district_name,s.name,a.id LIMIT ${limit} OFFSET ${offset}`, args);
}
export async function getDashboardListShipments(filter, args) {
  return rows(pool, `SELECT s.leg,s.status,COUNT(s.id) count,COALESCE(SUM(s.quantity_kg),0) quantity_kg,COALESCE(SUM(s.accepted_kg),0) accepted_kg,COALESCE(SUM(s.shortage_kg),0) shortage_kg FROM shipments s WHERE 1=1${filter} GROUP BY s.leg,s.status`, args);
}
export async function getDashboardListShipments2(filter, staleMinutes, args) {
  return rows(pool, `SELECT s.id,s.shipment_no,s.status,v.registration_no,d.last_gps_at,d.latitude,d.longitude FROM shipments s JOIN vehicles v ON v.id=s.vehicle_id LEFT JOIN gps_devices d ON d.vehicle_id=v.id WHERE s.status IN ('DISPATCHED','IN_TRANSIT','ARRIVED') AND (d.last_gps_at IS NULL OR d.last_gps_at < DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? MINUTE))${filter} ORDER BY s.id LIMIT 200`, [staleMinutes, ...args]);
}
export async function listAuditCountAuditLog() {
  return one(pool, 'SELECT COUNT(id) total FROM audit_log');
}
export async function listAuditListAuditLog(limit, offset) {
  return rows(pool, `SELECT id,actor,action,request_id,entity_id,created_at FROM audit_log ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`);
}
export async function listAvailableLotsFindRouteTags(facilityId, context, seasonId) {
  return one(pool, 'SELECT id FROM route_tags WHERE source_id=? AND destination_id=? AND season_id=? AND active=1', [facilityId, context.user.miller_id, seasonId]);
}
export async function listAvailableLotsListRecords(filter, args) {
  return rows(pool, `SELECT p.id,p.external_ref,p.miller_id,p.ro_no,CAST(p.ro_date AS CHAR) ro_date,p.facility_id,p.district_id,p.season_id,p.scheme_code,p.commodity_code,p.commodity_code commodity,p.procured_at,p.quantity_kg,p.available_kg,p.reserved_kg,p.available_kg-p.reserved_kg unreserved_kg ${filter} ORDER BY p.procured_at,p.id`, args);
}
