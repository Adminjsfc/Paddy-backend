import {requireStockMasters} from '../repositories/stock-masters.repository.js';
import * as repository from "../repositories/procurement.repository.js";
import { stock } from "./stock.service.js";
import { lockFacilities } from "../repositories/facilities.repository.js";
import { ensure, grams, hash, millerAccess, recoveryGrams, pageParams, id, actor } from "../utils/core.js";
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
  const received=grams(data.quantity);
  // After an explicit correction, a matching current receipt is a retry too.
  const matchesCurrent=existing.facility_code!==undefined
    && Number(existing.quantity_g)===received
    && existing.scheme_code===data.scheme_code&&existing.commodity_code===data.commodity_code
    && existing.season_code===data.season_code&&existing.facility_code===data.facility_code
    && (existing.farmer_code??undefined)===data.farmer_code
    && new Date(existing.procured_at).getTime()===data.procured_at.getTime()
    && existing.receipt_no===data.receipt_no
    && (existing.moisture_percent==null?null:Number(existing.moisture_percent))===data.moisture_percent;
  const difference=Number(existing.quantity_g)!==received
    ?`quantity mismatch: stored=${Number(existing.quantity_g)/100000} QTL, received=${received/100000} QTL.`
    :`external_ref=${data.external_ref}: already imported with different data.`;
  ensure(existing.payload_hash===digest||matchesCurrent,difference,'EXTERNAL_REF_CONFLICT');
}
async function bindProcurementReference(connection,externalRef,procurementId) {
  await repository.reserveProcurementReference(connection,externalRef,procurementId);
  const owner=await repository.procurementReferenceOwner(connection,externalRef);
  ensure(Number(owner.procurement_id)===Number(procurementId),`external_ref=${externalRef}: already belongs to another procurement.`,'EXTERNAL_REF_CONFLICT');
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
  const masters=await requireStockMasters(connection,data.scheme_code,data.commodity_code);
  const season = await activeSeason(connection, data.season_code, true);
  inSeason(season, data.procured_at);
  const farmer = data.farmer_code ? await repository.pushProcurementFindFarmers(connection, data) : null;
  const f = await repository.pushProcurementFindFacilities(connection, data);
  const raced = await repository.pushProcurementFindProcurement2(connection, data);
  if (raced) {
    requireSameProcurement(raced,data,digest);
    return {
      id: raced.id,
      duplicate: true
    };
  }
  const amount = grams(data.quantity);
  const id = await repository.pushProcurementInsertProcurement(connection, data, digest, season, farmer, f, amount, masters);
  await bindProcurementReference(connection,data.external_ref,id);
  await stock(connection, f.id, season.id, 'PADDY', amount, 0, 'PROCUREMENT', id, data.scheme_code, context.user);
  return {
    id,
    quantity_g: amount,
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
  const amount=data.quantity?grams(data.quantity):Number(current.quantity_g);
  const externalRef=data.external_ref??current.external_ref;
  const delta=amount-Number(current.quantity_g);
  const used=Number(current.quantity_g)-Number(current.available_g);
  const minimum=used+Number(current.reserved_g);
  ensure(amount>=minimum,`quantity must be at least ${minimum/100000} QTL (${used/100000} QTL dispatched + ${Number(current.reserved_g)/100000} QTL reserved).`,'PROCUREMENT_QUANTITY_IN_USE');
  if(delta===0&&externalRef===current.external_ref)return {id:procurementId,external_ref:externalRef,quantity_g:amount,available_g:current.available_g,reserved_g:current.reserved_g,updated:false};
  await bindProcurementReference(connection,externalRef,procurementId);
  const correctionId=await repository.insertProcurementCorrection(connection,{
    procurement_id:procurementId,old_external_ref:current.external_ref,new_external_ref:externalRef,
    old_quantity_g:current.quantity_g,new_quantity_g:amount,reason:data.reason,
    created_by:context.user.id??null,created_by_actor:actor(context.user),request_id:context.requestId??null
  });
  if(delta!==0)await stock(connection,current.facility_id,current.season_id,'PADDY',delta,0,'PROCUREMENT_CORRECTION',correctionId,current.scheme_code,context.user);
  const available=Number(current.available_g)+delta;
  await repository.saveProcurementCorrection(connection,procurementId,externalRef,amount,available);
  return {id:procurementId,external_ref:externalRef,quantity_g:amount,available_g:available,reserved_g:current.reserved_g,correction_id:correctionId,updated:true};
}
export async function pushOrder(connection, data) {
  const digest = hash(data),
    existing = await repository.pushOrderFindCmrOrders(connection, data);
  if (existing) {
    ensure(existing.payload_hash === digest, 'CMR reference already exists with different data', 'EXTERNAL_REF_CONFLICT');
    return {
      id: existing.id,
      duplicate: true
    };
  }
  const season = await activeSeason(connection, data.season_code, true);
  inSeason(season, data.ordered_at);
  await requireStockMasters(connection,data.scheme_code,data.commodity_code);
  const miller = await repository.pushOrderFindFacilities(connection, data);
  const raced = await repository.pushOrderFindCmrOrders2(connection, data);
  if (raced) {
    ensure(raced.payload_hash === digest, 'CMR reference already exists with different data', 'EXTERNAL_REF_CONFLICT');
    return {
      id: raced.id,
      duplicate: true
    };
  }
  const dest = await repository.pushOrderFindFacilities2(connection, data);
  await repository.pushOrderFindMillerStoreAssignments(connection, season, miller, dest);
  ensure(data.due_date >= new Date(data.ordered_at.getTime() + 19800000).toISOString().slice(0, 10), 'Due date precedes order date', 'VALIDATION', 400);
  const amount = grams(data.rice_quantity);
  const id = await repository.pushOrderInsertCmrOrders(connection, data, digest, season, miller, dest, amount);
  return {
    id,
    rice_quantity_g: amount,
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
export async function importCmrOrders(connection, data) {
  const out = [];
  for (const r of data.records) out.push(await pushOrder(connection,r));
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
  for (const field of ['season_id', 'facility_id', 'farmer_id', 'scheme_id', 'commodity_id']) if (context.query[field]) {
    filter += ` AND p.${field}=?`;
    args.push(String(context.query[field]));
  }
  if(context.query.external_ref){filter+=' AND EXISTS (SELECT 1 FROM procurement_references pr WHERE pr.procurement_id=p.id AND pr.external_ref=?)';args.push(String(context.query.external_ref));}
  for(const [field,column] of [['scheme_code','sc.code'],['commodity','co.code']])if(context.query[field]){
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
  for (const field of ['season_id', 'miller_id', 'status', 'external_ref', 'scheme_code', 'commodity']) if (context.query[field]) {
    filter += ` AND o.${field}=?`;
    args.push(String(context.query[field]));
  }
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
  const qty = data.rice_quantity ? grams(data.rice_quantity) : o.rice_quantity_g;
  ensure(qty >= o.committed_g + o.delivered_g, 'Quantity cannot be below committed plus accepted rice');
  await repository.updateCmrOrderUpdateCmrOrders(connection, qty, data, o);
  return {
    id: o.id,
    rice_quantity_g: qty,
    reason: data.reason
  };
}
export async function cancelCmrOrder(connection, data, context) {
  const o = await repository.cancelCmrOrderFindCmrOrders(connection, context);
  ensure(o.committed_g === 0 && o.delivered_g === 0, 'Order already has committed or delivered rice');
  await repository.cancelCmrOrderUpdateCmrOrders(connection, o);
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
  const paddy = grams(data.paddy_quantity),
    recovery = miller.recovery_percent ?? season.recovery_percent,
    expected = recoveryGrams(paddy, recovery),
    rice = data.rice_quantity ? grams(data.rice_quantity) : expected;
  ensure(rice > 0 && rice <= paddy, 'Produced rice must be positive and cannot exceed consumed paddy');
  if (miller.milling_capacity_g_per_day) {
    const day = new Date(data.milled_at.getTime() + 19800000).toISOString().slice(0, 10);
    const start = new Date(day + 'T00:00:00+05:30'),
      end = new Date(start.getTime() + 86400000);
    const total = await repository.recordMillingBatchFindMillingBatches(connection, miller, start, end);
    ensure(Number(total.amount) + paddy <= miller.milling_capacity_g_per_day, 'Daily paddy milling capacity exceeded', 'MILLING_CAPACITY_EXCEEDED');
  }
  const id = await repository.recordMillingBatchInsertMillingBatches(connection, data, miller, season, paddy, rice, expected, recovery);
  await stock(connection, miller.id, season.id, 'PADDY', -paddy, 0, 'MILLING', id, data.scheme_code, context.user);
  await stock(connection, miller.id, season.id, 'RICE', rice, 0, 'MILLING', id, data.scheme_code, context.user);
  return {
    id,
    paddy_consumed_g: paddy,
    rice_produced_g: rice,
    expected_rice_g: expected,
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
