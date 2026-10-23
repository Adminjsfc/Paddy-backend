import { pool } from "../config/database.js";
import { one, rows, insert } from "../repositories/database.js";
export async function activeSeasonFindSeasons(connection, byCode, idOrCode) {
  return one(connection, `SELECT * FROM seasons WHERE ${byCode ? 'code' : 'id'}=? AND active=1`, [idOrCode],true,{code:'SEASON_NOT_FOUND',message:`${byCode?'season_code':'season_id'}=${idOrCode}: not found or inactive.`});
}
export async function pushProcurementFindProcurement(connection, data) {
  return findProcurementReference(connection,data.external_ref);
}
function findProcurementReference(connection,externalRef) {
  return one(connection,`SELECT p.*,sc.code scheme_code,co.code commodity_code,se.code season_code,
    f.code facility_code,farmer.code farmer_code FROM procurement_references r
    JOIN procurement p ON p.id=r.procurement_id JOIN schemes sc ON sc.id=p.scheme_id
    JOIN commodities co ON co.id=p.commodity_id JOIN seasons se ON se.id=p.season_id
    JOIN facilities f ON f.id=p.facility_id LEFT JOIN farmers farmer ON farmer.id=p.farmer_id
    WHERE r.external_ref=?`,[externalRef],false);
}
export async function pushProcurementFindFarmers(connection, data) {
  return one(connection, 'SELECT id FROM farmers WHERE code=? AND active=1', [data.farmer_code],true,{code:'FARMER_NOT_FOUND',message:`farmer_code=${data.farmer_code}: not found or inactive.`});
}
export async function pushProcurementFindFacilities(connection, data) {
  return one(connection, "SELECT * FROM facilities WHERE code=? AND kind IN ('PACS','LAMPS') AND active=1 FOR UPDATE", [data.facility_code],true,{code:'PADDY_SOURCE_NOT_FOUND',message:`facility_code=${data.facility_code}: active PACS/LAMPS not found.`});
}
export async function pushProcurementFindProcurement2(connection, data) {
  return findProcurementReference(connection,data.external_ref);
}
export const findProcurementForCorrection=(connection,id,lock=false)=>one(connection,
  `SELECT p.*,sc.code scheme_code FROM procurement p JOIN schemes sc ON sc.id=p.scheme_id WHERE p.id=?${lock?' FOR UPDATE':''}`,
  [id],true,{code:'PROCUREMENT_NOT_FOUND',message:`procurement_id=${id}: not found.`});
export const reserveProcurementReference=(connection,externalRef,id)=>rows(connection,
  'INSERT INTO procurement_references(external_ref,procurement_id) VALUES (?,?) ON DUPLICATE KEY UPDATE external_ref=VALUES(external_ref)',[externalRef,id]);
export const procurementReferenceOwner=(connection,externalRef)=>one(connection,
  'SELECT procurement_id FROM procurement_references WHERE external_ref=? FOR UPDATE',[externalRef]);
export const insertProcurementCorrection=(connection,data)=>insert(connection,'procurement_corrections',data);
export const saveProcurementCorrection=(connection,id,externalRef,quantity,available)=>rows(connection,
  'UPDATE procurement SET external_ref=?,quantity_g=?,available_g=? WHERE id=?',[externalRef,quantity,available,id]);
export async function pushProcurementInsertProcurement(connection, data, digest, season, farmer, f, amount, masters) {
  return insert(connection, 'procurement', {
    external_ref: data.external_ref,
    payload_hash: digest,
    scheme_id: masters.scheme_id,
    commodity_id: masters.commodity_id,
    season_id: season.id,
    farmer_id: farmer?.id ?? null,
    facility_id: f.id,
    procured_at: data.procured_at,
    quantity_g: amount,
    available_g: amount,
    moisture_percent: data.moisture_percent,
    receipt_no: data.receipt_no
  });
}
export async function pushOrderFindCmrOrders(connection, data) {
  return one(connection, 'SELECT id,payload_hash FROM cmr_orders WHERE external_ref=?', [data.external_ref], false);
}
export async function pushOrderFindFacilities(connection, data) {
  return one(connection, "SELECT id FROM facilities WHERE code=? AND kind='MILLER' AND active=1 FOR UPDATE", [data.miller_code],true,{code:'MILLER_NOT_FOUND',message:`miller_code=${data.miller_code}: active Miller not found.`});
}
export async function pushOrderFindCmrOrders2(connection, data) {
  return one(connection, 'SELECT id,payload_hash FROM cmr_orders WHERE external_ref=?', [data.external_ref], false);
}
export async function pushOrderFindFacilities2(connection, data) {
  return one(connection, "SELECT id FROM facilities WHERE code=? AND kind IN ('SFC_GODOWN','FCI') AND active=1", [data.destination_code],true,{code:'DESTINATION_NOT_FOUND',message:`destination_code=${data.destination_code}: active godown/FCI not found.`});
}
export async function pushOrderFindMillerStoreAssignments(connection, season, miller, dest) {
  return one(connection, 'SELECT id FROM miller_store_assignments WHERE season_id=? AND miller_id=? AND store_id=? AND active=1', [season.id, miller.id, dest.id],true,{code:'CMR_MAPPING_NOT_FOUND',message:`Miller ${miller.id} is not assigned to godown/FCI ${dest.id} for season ${season.id}. Create or activate this assignment first.`});
}
export async function pushOrderInsertCmrOrders(connection, data, digest, season, miller, dest, amount) {
  return insert(connection, 'cmr_orders', {
    external_ref: data.external_ref,
    payload_hash: digest,
    scheme_code: data.scheme_code,
    commodity: data.commodity_code,
    season_id: season.id,
    miller_id: miller.id,
    destination_id: dest.id,
    order_no: data.order_no,
    ordered_at: data.ordered_at,
    due_date: data.due_date,
    rice_quantity_g: amount
  });
}
export async function listProcurementsCountProcurement(filter, args) {
  return one(pool, `SELECT COUNT(*) AS total FROM procurement p JOIN schemes sc ON sc.id=p.scheme_id JOIN commodities co ON co.id=p.commodity_id WHERE 1=1${filter}`, args);
}
export async function listProcurementsListProcurement(filter, limit, offset, args) {
  return rows(pool, `SELECT p.*,sc.code scheme_code,sc.scheme_name,co.code commodity,co.commodity_name,f.name farmer_name,c.name facility_name FROM procurement p JOIN schemes sc ON sc.id=p.scheme_id JOIN commodities co ON co.id=p.commodity_id LEFT JOIN farmers f ON f.id=p.farmer_id JOIN facilities c ON c.id=p.facility_id WHERE 1=1${filter} ORDER BY p.procured_at DESC,p.id DESC LIMIT ${limit} OFFSET ${offset}`, args);
}
export async function listCmrOrdersCountCmrOrders(filter, args) {
  return one(pool, `SELECT COUNT(*) AS total FROM cmr_orders o WHERE 1=1${filter}`, args);
}
export async function listCmrOrdersListCmrOrders(filter, limit, offset, args) {
  return rows(pool, `SELECT o.*,f.name destination_name,f.kind destination_kind,(o.rice_quantity_g-o.committed_g-o.delivered_g) unallocated_g FROM cmr_orders o JOIN facilities f ON f.id=o.destination_id WHERE 1=1${filter} ORDER BY o.id DESC LIMIT ${limit} OFFSET ${offset}`, args);
}
export async function updateCmrOrderFindCmrOrders(connection, context) {
  return one(connection, 'SELECT * FROM cmr_orders WHERE id=? FOR UPDATE', [context.params.id]);
}
export async function updateCmrOrderUpdateCmrOrders(connection, qty, data, o) {
  return rows(connection, 'UPDATE cmr_orders SET rice_quantity_g=?,due_date=?,status=? WHERE id=?', [qty, data.due_date || o.due_date, qty === o.delivered_g ? 'FULFILLED' : 'OPEN', o.id]);
}
export async function cancelCmrOrderFindCmrOrders(connection, context) {
  return one(connection, 'SELECT * FROM cmr_orders WHERE id=? FOR UPDATE', [context.params.id]);
}
export async function cancelCmrOrderUpdateCmrOrders(connection, o) {
  return rows(connection, "UPDATE cmr_orders SET status='CANCELLED' WHERE id=?", [o.id]);
}
export async function recordMillingBatchFindFacilities(connection, data) {
  return one(connection, "SELECT * FROM facilities WHERE id=? AND kind='MILLER' AND active=1", [data.miller_id]);
}
export async function recordMillingBatchFindMillingBatches(connection, miller, start, end) {
  return one(connection, 'SELECT COALESCE(SUM(paddy_consumed_g),0) AS amount FROM milling_batches WHERE miller_id=? AND milled_at>=? AND milled_at<?', [miller.id, start, end]);
}
export async function recordMillingBatchInsertMillingBatches(connection, data, miller, season, paddy, rice, expected, recovery) {
  return insert(connection, 'milling_batches', {
    batch_no: data.batch_no,
    miller_id: miller.id,
    season_id: season.id,
    scheme_code: data.scheme_code,
    paddy_consumed_g: paddy,
    rice_produced_g: rice,
    expected_rice_g: expected,
    recovery_percent: recovery,
    milled_at: data.milled_at,
    remarks: data.remarks
  });
}
export async function listMillingBatchesCountMillingBatches(filter, args) {
  return one(pool, `SELECT COUNT(*) AS total FROM milling_batches WHERE 1=1${filter}`, args);
}
export async function listMillingBatchesListMillingBatches(filter, limit, offset, args) {
  return rows(pool, `SELECT * FROM milling_batches WHERE 1=1${filter} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`, args);
}
