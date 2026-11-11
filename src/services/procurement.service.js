import {syncOrderStock,allocatedOrderKg} from './order-stock.service.js';
import {addKg} from '../utils/core.js';
import {capacityKg} from '../utils/core.js';
import {requireStockMasters} from '../repositories/stock-masters.repository.js';
import * as repository from "../repositories/procurement.repository.js";
import { stock } from "./stock.service.js";
import { lockFacilities } from "../repositories/facilities.repository.js";
import { ensure, kilograms, hash, millerAccess, recoveryKg, pageParams, id, actor } from "../utils/core.js";
export async function activeSeason(connection, idOrCode, byCode = false) {
  return repository.activeSeasonFindSeasons(connection, byCode, idOrCode);
}
export function inSeason(season, date) {
  // Season dates use Asia/Kolkata business dates; timestamps remain UTC.
  const day = new Date(date.getTime() + 19800000).toISOString().slice(0, 10);
  const from = new Date(season.start_date).toISOString().slice(0, 10),
    to = new Date(season.end_date).toISOString().slice(0, 10);
  ensure(day >= from && day <= to, `Transaction date ${day} is outside season ${season.code||season.id}: allowed dates are ${from} to ${to}. Check procured_at/ordered_at and season_code.`, 'OUTSIDE_SEASON', 400);
}
function requireSameProcurement(existing,data,digest) {
  const roDate = value => value == null ? null : value instanceof Date
    ? value.toISOString().slice(0,10) : String(value).slice(0,10);
  const received=kilograms(data.quantity);
  // After an explicit correction, a matching current receipt is a retry too.
  const matchesCurrent=existing.facility_code!==undefined
    && Number(existing.quantity_kg)===received
    && existing.scheme_code===data.scheme_code&&existing.commodity_code===data.commodity_code
    && (data.season_id!==undefined?Number(existing.season_id)===data.season_id:existing.season_code===data.season_code)
    && (data.facility_id!==undefined?Number(existing.facility_id)===data.facility_id:existing.facility_code===data.facility_code)
    && Number(existing.miller_id)===data.miller_id
    && (data.district_id===undefined||Number(existing.district_id)===data.district_id)
    && (existing.farmer_code??undefined)===data.farmer_code
    && new Date(existing.procured_at).getTime()===data.procured_at.getTime()
    && (existing.ro_no??null)===(data.ro_no??null)
    && roDate(existing.ro_date)===roDate(data.ro_date)
    && (existing.moisture_percent==null?null:Number(existing.moisture_percent))===data.moisture_percent;
  const difference=Number(existing.quantity_kg)!==received
    ?`quantity mismatch: stored=${Number(existing.quantity_kg)} kg, received=${received} kg.`
    :`external_ref=${data.external_ref}: already imported with different data.`;
  ensure(existing.payload_hash===digest&&Number(existing.miller_id)===data.miller_id||matchesCurrent,difference,'EXTERNAL_REF_CONFLICT');
}
async function ensureProcurementReferenceAvailable(connection,externalRef,procurementId) {
  const owner=await repository.procurementReferenceOwner(connection,externalRef);
  ensure(!owner||Number(owner.procurement_id)===Number(procurementId),`external_ref=${externalRef}: already belongs to another procurement.`,'EXTERNAL_REF_CONFLICT');
}
export async function pushProcurement(connection, data, context = {}) {
  const digest = hash(data),
    existing = await repository.pushProcurementFindProcurement(connection, data);
  if (existing) {
    requireSameProcurement(existing,data,digest);
    return {
      id: existing.id,
      duplicate: true
    };
  }
  const masters={scheme_code:data.scheme_code,commodity_code:data.commodity_code};
  const {season,farmer,facility:f}=await repository.pushMasterReferences(connection,data);
  const raced = await repository.pushProcurementFindProcurement2(connection, data);
  if (raced) {
    requireSameProcurement(raced,data,digest);
    return {
      id: raced.id,
      duplicate: true
    };
  }
  const amount = kilograms(data.quantity);
  const procurementId = await repository.pushProcurementInsertProcurement(connection, data, digest, season, farmer, f, amount, masters);
  if(f&&season)await stock(connection, f.id, season.id, 'PADDY', amount, 0, 'PROCUREMENT', procurementId, data.scheme_code, context.user);
  return {
    id: procurementId,
    quantity_kg: amount,
    duplicate: false
  };
}
export async function updateProcurement(connection,data,context) {
  ensure(['ADMIN','OPERATOR','INTEGRATION'].includes(context.user.role),'Procurement correction access denied','FORBIDDEN',403);
  const procurementId=id.parse(Number(context.params.id));
  const existing=await repository.findProcurementForCorrection(connection,procurementId);
  // Use the same facility -> procurement lock order as shipment allocation.
  await lockFacilities(connection,[existing.facility_id]);
  const current=await repository.findProcurementForCorrection(connection,procurementId,true);
  const amount=data.quantity?kilograms(data.quantity):Number(current.quantity_kg);
  const externalRef=data.external_ref??current.external_ref;
  const millerId=data.miller_id??current.miller_id;
  const millerChanged=Number(millerId)!==Number(current.miller_id);
  const delta=addKg(amount,-Number(current.quantity_kg));
  const used=addKg(current.quantity_kg,-Number(current.available_kg));
  const minimum=addKg(used,current.reserved_kg);
  ensure(amount>=minimum,`quantity must be at least ${minimum} kg (${used} kg dispatched + ${Number(current.reserved_kg)} kg reserved).`,'PROCUREMENT_QUANTITY_IN_USE');
  if(millerChanged){
    await repository.requireProcurementMiller(connection,millerId);
    ensure(current.miller_id==null||used===0&&Number(current.reserved_kg)===0,
      'Cannot reassign an RO with lifted or reserved quantity','PROCUREMENT_MILLER_IN_USE');
    ensure(!(await repository.conflictingProcurementMiller(connection,procurementId,millerId)),
      'RO is linked to a shipment for another miller','PROCUREMENT_MILLER_IN_USE');
  }
  if(delta===0&&externalRef===current.external_ref&&!millerChanged)return {id:procurementId,external_ref:externalRef,miller_id:millerId,quantity_kg:amount,available_kg:current.available_kg,reserved_kg:current.reserved_kg,updated:false};
  await ensureProcurementReferenceAvailable(connection,externalRef,procurementId);
  const correctionId=await repository.insertProcurementCorrection(connection,{
    procurement_id:procurementId,old_external_ref:current.external_ref,new_external_ref:externalRef,
    old_quantity_kg:current.quantity_kg,new_quantity_kg:amount,reason:data.reason,
    old_miller_id:current.miller_id??null,new_miller_id:millerId??null,
    created_by:context.user.id??null,created_by_actor:actor(context.user),request_id:context.requestId??null
  });
  if(delta!==0)await stock(connection,current.facility_id,current.season_id,'PADDY',delta,0,'PROCUREMENT_CORRECTION',correctionId,current.scheme_code,context.user);
  const available=addKg(current.available_kg,delta);
  await repository.saveProcurementCorrection(connection,procurementId,externalRef,amount,available,millerId??null);
  return {id:procurementId,external_ref:externalRef,miller_id:millerId,quantity_kg:amount,available_kg:available,reserved_kg:current.reserved_kg,correction_id:correctionId,updated:true};
}
export async function pushOrder(connection, data, context = {}) {
  const digest = hash(data),
    existing = await repository.pushOrderFindCmrOrders(connection, data);
  if (existing) {
    ensure(existing.payload_hash === digest, 'CMR reference already exists with different data', 'EXTERNAL_REF_CONFLICT');
    await syncOrderStock(connection,existing.id,context.user);
    return {
      id: existing.id,
      duplicate: true
    };
  }
  const raced = await repository.pushOrderFindCmrOrders2(connection, data);
  if (raced) {
    ensure(raced.payload_hash === digest, 'CMR reference already exists with different data', 'EXTERNAL_REF_CONFLICT');
    await syncOrderStock(connection,raced.id,context.user);
    return {
      id: raced.id,
      duplicate: true
    };
  }
  ensure(data.due_date >= new Date(data.ordered_at.getTime() + 19800000).toISOString().slice(0, 10), 'Due date precedes order date', 'VALIDATION', 400);
  const amount = kilograms(data.rice_quantity);
  const id = await repository.pushOrderInsertCmrOrders(connection, data, digest, amount);
  const stockResult=await syncOrderStock(connection,id,context.user);
  return {
    id,
    rice_quantity_kg: amount,
    duplicate: false
  };
}
export async function importProcurements(connection, data, context = {}) {
  const out = [];
  for (const r of data.records) out.push(await pushProcurement(connection,r,context));
  return {
    records: out
  };
}
export async function importCmrOrders(connection, data, context = {}) {
  const out = [];
  for (const r of data.records) out.push(await pushOrder(connection,r,context));
  return {
    records: out
  };
}
export async function listProcurements(context) {
  const effects = {
    headers: []
  };
  const {
    page,
    limit,
    offset
  } = pageParams(context.query);
  let filter = '';
  const args = [];
  const sourceAccount=['PACS','LAMPS'].includes(context.user.role);
  if(sourceAccount) {
    ensure(context.user.facility_id,'PACS/LAMPS facility is required','FORBIDDEN',403);
    const facilityId=id.parse(Number(context.user.facility_id));
    ensure(context.query.facility_id===undefined||Number(context.query.facility_id)===facilityId,'Cannot view another facility procurement','FORBIDDEN',403);
    filter+=" AND p.facility_id=? AND p.commodity_code='PADDY'";
    args.push(facilityId);
  }
  for (const field of ['season_id', 'facility_id', 'farmer_id', 'commodity_code']) if (context.query[field]) {
    if(sourceAccount&&field==='facility_id')continue;
    filter += ` AND p.${field}=?`;
    args.push(String(context.query[field]));
  }
  if(context.query.external_ref){
    filter+=' AND (p.external_ref=? OR EXISTS (SELECT 1 FROM procurement_corrections correction WHERE correction.procurement_id=p.id AND (correction.old_external_ref=? OR correction.new_external_ref=?)))';
    const reference=String(context.query.external_ref);
    args.push(reference,reference,reference);
  }
  if(context.query.ro_no){
    filter+=' AND p.ro_no=?';
    args.push(String(context.query.ro_no));
  }
  if(context.query.district_id!==undefined){
    filter+=' AND p.district_id=?';
    args.push(id.parse(Number(context.query.district_id)));
  }
  if(context.query.miller_id!==undefined){
    filter+=' AND p.miller_id=?';
    args.push(id.parse(Number(context.query.miller_id)));
  }
  for(const [field,column] of [['scheme_code','p.scheme_code'],['commodity','p.commodity_code']])if(context.query[field]){
    filter+=` AND ${column}=?`;
    args.push(String(context.query[field]));
  }
  const count = await repository.listProcurementsCountProcurement(filter, args);
  const data = await repository.listProcurementsListProcurement(filter, limit, offset, args);
  return {
    body: {
      ok: true,
      data,
      pagination: {
        page,
        limit,
        total: count.total
      }
    },
    status: 200,
    ...effects
  };
}
export async function listCmrOrders(context) {
  const effects = {
    headers: []
  };
  const {
    page,
    limit,
    offset
  } = pageParams(context.query);
  let filter = '';
  const args = [];
  if (context.user.role === 'MILLER') {
    filter += ' AND o.miller_id=?';
    args.push(context.user.miller_id);
  }
  for (const field of ['season_id', 'miller_id', 'status', 'external_ref', 'scheme_code', 'commodity','order_no']) if (context.query[field]) {
    filter += ` AND o.${field}=?`;
    args.push(String(context.query[field]));
  }
  if(context.query.district_id!==undefined){filter+=' AND o.district_id=?';args.push(id.parse(Number(context.query.district_id)));}
  const count = await repository.listCmrOrdersCountCmrOrders(filter, args);
  const data = await repository.listCmrOrdersListCmrOrders(filter, limit, offset, args);
  return {
    body: {
      ok: true,
      data,
      pagination: {
        page,
        limit,
        total: count.total
      }
    },
    status: 200,
    ...effects
  };
}
export async function updateCmrOrder(connection, data, context) {
  const o = await repository.updateCmrOrderFindCmrOrders(connection, context);
  ensure(o.status !== 'CANCELLED', 'Cancelled order cannot be changed');
  const qty = data.rice_quantity ? kilograms(data.rice_quantity) : o.rice_quantity_kg;
  const allocated=await allocatedOrderKg(connection,o.id);
  ensure(qty >= allocated, `Order quantity cannot be below ${allocated} KG already reserved or dispatched.`, 'ORDER_QUANTITY_IN_USE',409);
  await repository.updateCmrOrderUpdateCmrOrders(connection, qty, data, o);
  await syncOrderStock(connection,o.id,context.user);
  return {
    id: o.id,
    rice_quantity_kg: qty,
    reason: data.reason
  };
}
export async function cancelCmrOrder(connection, data, context) {
  const o = await repository.cancelCmrOrderFindCmrOrders(connection, context);
  ensure(await allocatedOrderKg(connection,o.id) === 0, 'Cancel or resolve the linked shipments before cancelling this CMR order.', 'ORDER_IN_USE',409);
  await repository.cancelCmrOrderUpdateCmrOrders(connection, o);
  await syncOrderStock(connection,o.id,context.user);
  return {
    id: o.id,
    status: 'CANCELLED',
    reason: data.reason
  };
}
export async function recordMillingBatch(connection, data, context) {
  await requireStockMasters(connection,data.scheme_code,'PADDY');
  await requireStockMasters(connection,data.scheme_code,'RICE');
  millerAccess(context.user, data.miller_id);
  const season = await activeSeason(connection, data.season_id);
  inSeason(season, data.milled_at);
  await lockFacilities(connection, [data.miller_id]);
  const miller = await repository.recordMillingBatchFindFacilities(connection, data);
  const paddy = kilograms(data.paddy_quantity),
    recovery = miller.recovery_percent ?? season.recovery_percent,
    expected = recoveryKg(paddy, recovery),
    rice = data.rice_quantity ? kilograms(data.rice_quantity) : expected;
  ensure(rice > 0 && rice <= paddy, 'Produced rice must be positive and cannot exceed consumed paddy');
  if (miller.milling_capacity_value_per_day) {
    const day = new Date(data.milled_at.getTime() + 19800000).toISOString().slice(0, 10);
    const start = new Date(day + 'T00:00:00+05:30'),
      end = new Date(start.getTime() + 86400000);
    const total = await repository.recordMillingBatchFindMillingBatches(connection, miller, start, end);
    ensure(addKg(total.amount,paddy) <= capacityKg(miller, true), 'Daily paddy milling capacity exceeded', 'MILLING_CAPACITY_EXCEEDED');
  }
  const id = await repository.recordMillingBatchInsertMillingBatches(connection, data, miller, season, paddy, rice, expected, recovery);
  // Milling is informational in the procurement/order inventory model.
  return {
    id,
    paddy_consumed_kg: paddy,
    rice_produced_kg: rice,
    expected_rice_kg: expected,
    recovery_percent: recovery
  };
}
export async function listMillingBatches(context) {
  const effects = {
    headers: []
  };
  const {
    page,
    limit,
    offset
  } = pageParams(context.query);
  let filter = '';
  const args = [];
  if (context.user.role === 'MILLER') {
    filter += ' AND miller_id=?';
    args.push(context.user.miller_id);
  }
  for (const field of ['miller_id', 'season_id']) if (context.query[field]) {
    filter += ` AND ${field}=?`;
    args.push(String(context.query[field]));
  }
  const count = await repository.listMillingBatchesCountMillingBatches(filter, args);
  return {
    body: {
      ok: true,
      data: await repository.listMillingBatchesListMillingBatches(filter, limit, offset, args),
      pagination: {
        page,
        limit,
        total: count.total
      }
    },
    status: 200,
    ...effects
  };
}
