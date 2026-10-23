import { pool } from "../config/database.js";
import { rows, one, insert } from "../repositories/database.js";
import { id } from "../utils/core.js";
export async function receiveCMRFindShipments(connection, scope, context) {
  return one(connection, `SELECT s.*,sc.code scheme_code FROM shipments s JOIN schemes sc ON sc.id=s.scheme_id JOIN facilities f ON f.id=s.destination_id
    WHERE s.id=? AND s.leg='CMR' AND f.active=1 AND f.kind IN ('SFC_GODOWN','FCI') AND ${scope.sql} FOR UPDATE`, [id.parse(Number(context.params.id)), ...scope.args]);
}
export async function receiveCMRFindCmrReceipts(connection, shipment) {
  return one(connection, 'SELECT id FROM cmr_receipts WHERE shipment_id=?', [shipment.id], false);
}
export async function receiveCMRInsertCmrReceipts(connection, shipment, data, calc, context) {
  return insert(connection, 'cmr_receipts', {
    shipment_id: shipment.id,
    decision: data.decision,
    receipt_no: data.receipt_no,
    gross_g: calc.gross_g,
    tare_per_bag_g: calc.tare_per_bag_g,
    tare_g: calc.tare_g,
    net_g: calc.net_g,
    total_bags: calc.total_bags,
    red_grains_percent: data.red_grains_percent,
    chalky_grains_percent: data.chalky_grains_percent,
    moisture_percent: data.moisture_percent,
    broken_rice_percent: data.broken_rice_percent,
    other_standards: data.other_standards,
    compliance_confirmed: data.compliance_confirmed,
    remarks: data.remarks,
    gps_override_reason: data.gps_override_reason,
    received_at: data.received_at,
    core_user_id: context.user.core_user_id,
    core_user_type: context.user.core_user_type
  });
}
export async function receiveCMRInsertCmrReceiptStacks(connection, receiptId, stack) {
  return insert(connection, 'cmr_receipt_stacks', {
    receipt_id: receiptId,
    stack_no: stack.stack_no,
    quantity_g: stack.quantity_g,
    bags: stack.bags
  });
}
export async function listShipmentsCountRecords(base, args) {
  return one(pool, `SELECT COUNT(*) total ${base}`, args);
}
export async function listShipmentsListRecords(base, limit, offset, args) {
  return rows(pool, `SELECT s.id,s.shipment_no,s.status,s.trip_status,s.trip_started_at,s.trip_completed_at,s.expected_completion_at,s.quantity_g,s.accepted_g,s.shortage_g,s.stenciling_code,s.total_bags,s.dispatched_at,s.arrived_at,s.submitted_on,
    s.scheme_id,s.commodity_id,sc.code scheme_type,sc.code scheme_code,co.code commodity_code,se.name season_name,f.name destination_name,m.name miller_name,m.address source_address,v.registration_no,r.id receipt_id,r.decision,r.net_g,r.received_at ${base}
    ORDER BY s.id DESC LIMIT ${limit} OFFSET ${offset}`, args);
}
export async function listStockCountRecords(base, scope) {
  return one(pool, `SELECT COUNT(*) total,COALESCE(SUM(st.quantity_g),0) received_g ${base}`, scope.args);
}
export async function listStockListRecords(base, limit, offset, scope) {
  return rows(pool, `SELECT st.*,r.receipt_no,r.received_at,s.shipment_no,s.scheme_id,s.commodity_id,sc.code scheme_code,s.stenciling_code,m.name miller_name,f.name destination_name,se.name season_name ${base}
    ORDER BY r.received_at DESC,st.id DESC LIMIT ${limit} OFFSET ${offset}`, scope.args);
}
export async function listStockListStocks(scope) {
  return rows(pool, `SELECT f.id,f.name,se.name season_name,s.scheme_id,s.commodity_id,sc.code scheme_code,co.code commodity,s.status,s.on_hand_g,s.reserved_g,CASE WHEN s.status=1 THEN s.on_hand_g-s.reserved_g ELSE 0 END available_g
    FROM stocks s JOIN schemes sc ON sc.id=s.scheme_id JOIN commodities co ON co.id=s.commodity_id JOIN facilities f ON f.id=s.facility_id JOIN seasons se ON se.id=s.season_id WHERE co.code='RICE' AND ${scope.sql}`, scope.args);
}
export async function getShipmentFindShipments(scope, context) {
  return one(pool, `SELECT s.*,sc.code scheme_code,sc.code scheme_type,co.code commodity_code,vt.name vehicle_type,f.name destination_name,m.name miller_name,v.registration_no FROM shipments s
    JOIN schemes sc ON sc.id=s.scheme_id JOIN commodities co ON co.id=s.commodity_id LEFT JOIN vehicle_types vt ON vt.id=s.vehicle_type_id
    JOIN facilities f ON f.id=s.destination_id JOIN facilities m ON m.id=s.miller_id JOIN vehicles v ON v.id=s.vehicle_id
    WHERE s.id=? AND s.leg='CMR' AND ${scope.sql}`, [id.parse(Number(context.params.id)), ...scope.args]);
}
export async function getShipmentFindCmrReceipts(shipment) {
  return one(pool, 'SELECT * FROM cmr_receipts WHERE shipment_id=?', [shipment.id], false);
}
export async function getShipmentListCmrReceiptStacks(receipt) {
  return rows(pool, 'SELECT * FROM cmr_receipt_stacks WHERE receipt_id=? ORDER BY id', [receipt.id]);
}
