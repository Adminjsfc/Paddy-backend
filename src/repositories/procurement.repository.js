import { pool } from "../config/database.js";
import { one, rows, insert } from "../repositories/database.js";
export async function activeSeasonFindSeasons(connection, byCode, idOrCode) {
  return one(connection, `SELECT id,code,name,start_date,end_date,recovery_percent,active,created_by,created_at,updated_by,updated_at FROM seasons WHERE ${byCode ? 'code' : 'id'}=? AND active=1`, [idOrCode],true,{code:'SEASON_NOT_FOUND',message:`${byCode?'season_code':'season_id'}=${idOrCode}: not found or inactive.`});
}
export async function pushProcurementFindProcurement(connection, data) {
  return findProcurementReference(connection,data.external_ref);
}
export async function pushMasterReferences(connection,data) {
  const season=await one(connection,'SELECT id,code,start_date,end_date FROM seasons WHERE code=? AND active=1',[data.season_code],false);
  const facility=data.facility_code?await one(connection,"SELECT id,district_id FROM facilities WHERE code=? AND kind IN ('PACS','LAMPS') AND active=1 FOR UPDATE",[data.facility_code],false):null;
  const farmer=data.farmer_code?await one(connection,'SELECT id FROM farmers WHERE code=? AND active=1',[data.farmer_code],false):null;
  const miller=data.miller_code?await one(connection,"SELECT id FROM facilities WHERE code=? AND kind='MILLER' AND active=1 FOR UPDATE",[data.miller_code],false):null;
  const destination=data.destination_code?await one(connection,"SELECT id,district_id FROM facilities WHERE code=? AND kind IN ('SFC_GODOWN','FCI') AND active=1",[data.destination_code],false):null;
  return {season,facility,farmer,miller,destination};
}
export const requireProcurementMiller=(connection,millerId)=>one(connection,
  "SELECT id FROM facilities WHERE id=? AND kind='MILLER' AND active=1",[millerId],true,
  {code:'MILLER_NOT_FOUND',message:`miller_id=${millerId}: active MILLER facility not found.`});
export const conflictingProcurementMiller=(connection,procurementId,millerId)=>one(connection,
  "SELECT s.id FROM shipment_lots l JOIN shipments s ON s.id=l.shipment_id WHERE l.procurement_id=? AND s.status<>'CANCELLED' AND s.miller_id<>? LIMIT 1",
  [procurementId,millerId],false);
function findProcurementReference(connection,externalRef,lock=false) {
  return one(connection,`SELECT p.id,p.external_ref,p.miller_id,p.ro_no,CAST(p.ro_date AS CHAR) ro_date,p.payload_hash,p.season_id,p.farmer_id,p.facility_id,p.district_id,p.procured_at,p.quantity_kg,p.available_kg,p.reserved_kg,p.moisture_percent,p.created_at,p.scheme_code,p.commodity_code,COALESCE(p.season_code,se.code) season_code,
    COALESCE(p.facility_code,f.code) facility_code,COALESCE(p.farmer_code,farmer.code) farmer_code FROM procurement p LEFT JOIN seasons se ON se.id=p.season_id
    LEFT JOIN facilities f ON f.id=p.facility_id LEFT JOIN farmers farmer ON farmer.id=p.farmer_id
    LEFT JOIN procurement_corrections correction ON correction.procurement_id=p.id
      AND (correction.old_external_ref=? OR correction.new_external_ref=?)
    WHERE p.external_ref=? OR correction.id IS NOT NULL LIMIT 1${lock?' FOR UPDATE':''}`,[externalRef,externalRef,externalRef],false);
}
export async function pushProcurementFindFarmers(connection, data) {
  return one(connection, 'SELECT id FROM farmers WHERE code=? AND active=1', [data.farmer_code],true,{code:'FARMER_NOT_FOUND',message:`farmer_code=${data.farmer_code}: not found or inactive.`});
}
export async function pushProcurementFindFacilities(connection, data) {
  return one(connection, "SELECT id,code,kind,name,address,district_id,latitude,longitude,radius_m,capacity_value,capacity_unit,milling_capacity_value_per_day,milling_capacity_unit,recovery_percent,contact_name,phone,active,created_by,created_by_core_user_id,created_by_user_type,created_at,updated_by,updated_at,core_store_id FROM facilities WHERE code=? AND kind IN ('PACS','LAMPS') AND active=1 FOR UPDATE", [data.facility_code],true,{code:'PADDY_SOURCE_NOT_FOUND',message:`facility_code=${data.facility_code}: active PACS/LAMPS not found.`});
}
export async function pushProcurementFindProcurement2(connection, data) {
  return findProcurementReference(connection,data.external_ref,true);
}
export const findProcurementForCorrection=(connection,id,lock=false)=>one(connection,
  `SELECT p.id,p.external_ref,p.miller_id,p.ro_no,CAST(p.ro_date AS CHAR) ro_date,p.payload_hash,p.season_id,p.farmer_id,p.facility_id,p.district_id,p.procured_at,p.quantity_kg,p.available_kg,p.reserved_kg,p.moisture_percent,p.created_at,p.scheme_code,p.commodity_code FROM procurement p WHERE p.id=?${lock?' FOR UPDATE':''}`,
  [id],true,{code:'PROCUREMENT_NOT_FOUND',message:`procurement_id=${id}: not found.`});
export const procurementReferenceOwner=(connection,externalRef)=>one(connection,
  `SELECT p.id procurement_id FROM procurement p
   LEFT JOIN procurement_corrections correction ON correction.procurement_id=p.id
     AND (correction.old_external_ref=? OR correction.new_external_ref=?)
   WHERE p.external_ref=? OR correction.id IS NOT NULL LIMIT 1 FOR UPDATE`,[externalRef,externalRef,externalRef],false);
export const insertProcurementCorrection=(connection,data)=>insert(connection,'procurement_corrections',data);
export const saveProcurementCorrection=(connection,id,externalRef,quantity,available,millerId)=>rows(connection,
  'UPDATE procurement SET external_ref=?,quantity_kg=?,available_kg=?,miller_id=? WHERE id=?',[externalRef,quantity,available,millerId,id]);
export async function pushProcurementInsertProcurement(connection, data, digest, season, farmer, f, amount, masters) {
  return insert(connection, 'procurement', {
    external_ref: data.external_ref,
    miller_id: data.miller_id,
    ro_no: data.ro_no ?? null,
    ro_date: data.ro_date ?? null,
    payload_hash: digest,
    scheme_code: masters.scheme_code,
    commodity_code: masters.commodity_code,
    season_id: season?.id??null,
    farmer_id: farmer?.id ?? null,
    facility_id: f?.id??null,
    district_id: data.district_id??f?.district_id??null,
    procured_at: data.procured_at,
    quantity_kg: amount,
    available_kg: amount,
    moisture_percent: data.moisture_percent,
    season_code:data.season_code,facility_code:data.facility_code,farmer_code:data.farmer_code??null
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
  return one(connection, "SELECT id,district_id FROM facilities WHERE code=? AND kind IN ('SFC_GODOWN','FCI') AND active=1", [data.destination_code],true,{code:'DESTINATION_NOT_FOUND',message:`destination_code=${data.destination_code}: active godown/FCI not found.`});
}
export async function pushOrderFindMillerStoreAssignments(connection, season, miller, dest) {
  return one(connection, 'SELECT id FROM miller_store_assignments WHERE season_id=? AND miller_id=? AND store_id=? AND active=1', [season.id, miller.id, dest.id],true,{code:'CMR_MAPPING_NOT_FOUND',message:`Miller ${miller.id} is not assigned to godown/FCI ${dest.id} for season ${season.id}. Create or activate this assignment first.`});
}
export async function pushOrderInsertCmrOrders(connection, data, digest, amount) {
  return insert(connection, 'cmr_orders', {
    external_ref: data.external_ref,
    payload_hash: digest,
    scheme_code: data.scheme_code,
    commodity: data.commodity_code,
    season_id: data.season_id,
    miller_id: data.miller_id,
    destination_id: data.destination_id,
    district_id: data.district_id??null,
    lot_count: data.lot_count ?? null,
    stenciling_code: data.stenciling_code ?? null,
    order_no: data.order_no,
    ordered_at: data.ordered_at,
    due_date: data.due_date,
    rice_quantity_kg: amount
  });
}
export async function listProcurementsCountProcurement(filter, args) {
  return one(pool, `SELECT COUNT(p.id) AS total FROM procurement p WHERE 1=1${filter}`, args);
}
export async function listProcurementsListProcurement(filter, limit, offset, args) {
  return rows(pool, `SELECT p.id,p.external_ref,p.miller_id,p.ro_no,CAST(p.ro_date AS CHAR) ro_date,p.payload_hash,p.season_id,p.farmer_id,p.facility_id,p.district_id,p.procured_at,p.quantity_kg,p.available_kg,p.reserved_kg,p.available_kg-p.reserved_kg unreserved_kg,p.moisture_percent,p.created_at,p.scheme_code,p.commodity_code,p.commodity_code commodity,p.season_code,p.facility_code,p.farmer_code,f.name farmer_name,c.name facility_name FROM procurement p LEFT JOIN farmers f ON f.id=p.farmer_id LEFT JOIN facilities c ON c.id=p.facility_id WHERE 1=1${filter} ORDER BY p.procured_at DESC,p.id DESC LIMIT ${limit} OFFSET ${offset}`, args);
}
export async function listCmrOrdersCountCmrOrders(filter, args) {
  return one(pool, `SELECT COUNT(o.id) AS total FROM cmr_orders o WHERE 1=1${filter}`, args);
}
export async function listCmrOrdersListCmrOrders(filter, limit, offset, args) {
  return rows(pool, `SELECT o.id,o.external_ref,o.payload_hash,o.season_id,o.miller_id,o.destination_id,o.order_no,o.district_id,o.lot_count,o.stenciling_code,o.ordered_at,o.due_date,o.rice_quantity_kg,o.committed_kg,o.delivered_kg,o.status,o.scheme_code,o.commodity,f.name destination_name,f.kind destination_kind,(o.rice_quantity_kg-o.committed_kg-o.delivered_kg) unallocated_kg FROM cmr_orders o LEFT JOIN facilities f ON f.id=o.destination_id WHERE 1=1${filter} ORDER BY o.id DESC LIMIT ${limit} OFFSET ${offset}`, args);
}
export async function updateCmrOrderFindCmrOrders(connection, context) {
  return one(connection, 'SELECT id,external_ref,payload_hash,season_id,miller_id,destination_id,order_no,district_id,lot_count,stenciling_code,ordered_at,due_date,rice_quantity_kg,committed_kg,delivered_kg,status,scheme_code,commodity FROM cmr_orders WHERE id=? FOR UPDATE', [context.params.id]);
}
export async function updateCmrOrderUpdateCmrOrders(connection, qty, data, o) {
  return rows(connection, 'UPDATE cmr_orders SET rice_quantity_kg=?,due_date=?,status=?,lot_count=?,stenciling_code=? WHERE id=?', [qty, data.due_date || o.due_date, qty === o.delivered_kg ? 'FULFILLED' : 'OPEN', data.lot_count??o.lot_count??null, data.stenciling_code??o.stenciling_code??null, o.id]);
}
export async function cancelCmrOrderFindCmrOrders(connection, context) {
  return one(connection, 'SELECT id,external_ref,payload_hash,season_id,miller_id,destination_id,order_no,district_id,lot_count,stenciling_code,ordered_at,due_date,rice_quantity_kg,committed_kg,delivered_kg,status,scheme_code,commodity FROM cmr_orders WHERE id=? FOR UPDATE', [context.params.id]);
}
export async function cancelCmrOrderUpdateCmrOrders(connection, o) {
  return rows(connection, "UPDATE cmr_orders SET status='CANCELLED' WHERE id=?", [o.id]);
}
export async function recordMillingBatchFindFacilities(connection, data) {
  return one(connection, "SELECT id,code,kind,name,address,district_id,latitude,longitude,radius_m,capacity_value,capacity_unit,milling_capacity_value_per_day,milling_capacity_unit,recovery_percent,contact_name,phone,active,created_by,created_by_core_user_id,created_by_user_type,created_at,updated_by,updated_at,core_store_id FROM facilities WHERE id=? AND kind='MILLER' AND active=1", [data.miller_id]);
}
export async function recordMillingBatchFindMillingBatches(connection, miller, start, end) {
  return one(connection, 'SELECT COALESCE(SUM(paddy_consumed_kg),0) AS amount FROM milling_batches WHERE miller_id=? AND milled_at>=? AND milled_at<?', [miller.id, start, end]);
}
export async function recordMillingBatchInsertMillingBatches(connection, data, miller, season, paddy, rice, expected, recovery) {
  return insert(connection, 'milling_batches', {
    batch_no: data.batch_no,
    miller_id: miller.id,
    season_id: season.id,
    scheme_code: data.scheme_code,
    paddy_consumed_kg: paddy,
    rice_produced_kg: rice,
    expected_rice_kg: expected,
    recovery_percent: recovery,
    milled_at: data.milled_at,
    remarks: data.remarks
  });
}
export async function listMillingBatchesCountMillingBatches(filter, args) {
  return one(pool, `SELECT COUNT(id) AS total FROM milling_batches WHERE 1=1${filter}`, args);
}
export async function listMillingBatchesListMillingBatches(filter, limit, offset, args) {
  return rows(pool, `SELECT id,batch_no,miller_id,season_id,paddy_consumed_kg,rice_produced_kg,expected_rice_kg,recovery_percent,milled_at,remarks,scheme_code FROM milling_batches WHERE 1=1${filter} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`, args);
}
