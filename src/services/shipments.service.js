import {requireStockMasters} from '../repositories/stock-masters.repository.js';
import * as repository from "../repositories/shipments.repository.js";
import { pool } from "../config/database.js";
import { stock } from "./stock.service.js";
import { lockFacilities } from "../repositories/facilities.repository.js";
import { event } from "../repositories/events.repository.js";
import { ensure, grams, millerAccess, vehicleAccess, recoveryGrams, pageParams, scopedWhere } from "../utils/core.js";
import { activeSeason } from "./procurement.service.js";
export async function ownedShipment(connection, context, lock = true) {
  const scope = scopedWhere(context.user);
  return repository.ownedShipmentFindShipments(connection, scope, lock, context);
}
export async function transport(connection, vehicleId, user) {
  const v = await repository.transportFindVehicles(connection, vehicleId);
  vehicleAccess(user, v);
  ensure(v.active && v.transporter_active, 'Vehicle or transporter is inactive');
  await repository.transportFindGpsDevices(connection, v);
  return v;
}
export async function createShipment(connection, data, context, submission = {}) {
  if (['PACS','LAMPS'].includes(context.user.role)) {
    ensure(data.leg==='PADDY','leg must be PADDY for PACS/LAMPS.','FORBIDDEN',403);
    ensure(context.user.facility_id,'facility_id: missing on the logged-in PACS/LAMPS account.','FORBIDDEN',403);
    ensure(Number(context.user.facility_id)===data.source_id,`source_id=${data.source_id}: does not match logged-in facility_id=${context.user.facility_id}.`,'FORBIDDEN',403);
    context={...context,user:{...context.user,role:'MILLER',miller_id:data.miller_id}};
  }
  millerAccess(context.user, data.miller_id);
  const masters=await requireStockMasters(connection,data.scheme_code,data.leg==='PADDY'?'PADDY':'RICE');
  const season = await activeSeason(connection, data.season_id);
  await lockFacilities(connection, [data.source_id, data.destination_id]);
  const source = await repository.createShipmentFindFacilities(connection, data);
  const dest = await repository.createShipmentFindFacilities2(connection, data);
  const miller = data.leg === 'PADDY' ? dest : source;
  ensure(miller.kind === 'MILLER' && miller.id === data.miller_id, `miller_id=${data.miller_id} must match the active MILLER facility at ${data.leg==='PADDY'?'destination_id':'source_id'}=${miller.id}.`, 'INVALID_ROUTE', 400);
  ensure(data.leg === 'PADDY' ? ['PACS', 'LAMPS'].includes(source.kind) : ['SFC_GODOWN', 'FCI'].includes(dest.kind), data.leg==='PADDY'?`source_id=${source.id} must be a PACS/LAMPS facility for PADDY lifting.`:`destination_id=${dest.id} must be a godown/FCI facility for CMR lifting.`, 'INVALID_ROUTE', 400);
  if (data.leg === 'PADDY') await repository.createShipmentFindRouteTags(connection, data, source, dest);else await repository.createShipmentFindMillerStoreAssignments(connection, data, dest);
  const v = await transport(connection, data.vehicle_id, context.user);
  ensure(v.miller_id === data.miller_id, 'Vehicle belongs to a different miller', 'FORBIDDEN', 403);
  const activeVehicle = await repository.createShipmentFindShipments(connection, v);
  ensure(!activeVehicle, 'Vehicle already has an active shipment', 'VEHICLE_BUSY', 409);
  const qty = grams(data.quantity);
  ensure(qty <= v.capacity_g, 'Vehicle loading capacity exceeded', 'VEHICLE_OVERLOAD');
  let order = null;
  if (data.leg === 'CMR') {
    ensure(data.order_id && data.lots.length === 0, 'CMR requires order_id and must not include procurement lots', 'VALIDATION', 400);
    order = await repository.createShipmentFindCmrOrders(connection, data);
    ensure(order.scheme_code===data.scheme_code && order.commodity==='RICE',`order_id=${data.order_id} requires scheme_code="${order.scheme_code}" and commodity=RICE; shipment scheme_code="${data.scheme_code}" does not match.`,'SCHEME_MISMATCH',400);
    ensure(order.status === 'OPEN' && order.miller_id === data.miller_id && order.destination_id === data.destination_id && order.season_id === data.season_id, 'CMR order does not match shipment or is closed');
    ensure(order.delivered_g + order.committed_g + qty <= order.rice_quantity_g, 'CMR order quantity exceeded', 'ORDER_OVERALLOCATION');
  } else ensure(data.order_id === null, 'Paddy shipment cannot reference a CMR order', 'VALIDATION', 400);
  const recovery = data.leg === 'PADDY' ? miller.recovery_percent ?? season.recovery_percent : null;
  const flowType = data.leg === 'PADDY' ? 'PACS_LAMPS_TO_MILLER' : 'MILLER_TO_GODOWN';
  const id = await repository.createShipmentInsertShipments(connection, data, flowType, source, dest, v, qty, recovery, submission, masters);
  await stock(connection, source.id, data.season_id, data.leg === 'PADDY' ? 'PADDY' : 'RICE', 0, qty, 'RESERVE', id, data.scheme_code, context.user);
  if (data.leg === 'PADDY') {
    let allocations = [];
    if (data.lots.length) {
      ensure(new Set(data.lots.map(l => l.procurement_id)).size === data.lots.length, 'Duplicate procurement lots', 'VALIDATION', 400);
      allocations = data.lots.map(l => ({
        procurement_id: l.procurement_id,
        quantity_g: grams(l.quantity)
      }));
      ensure(allocations.reduce((s, l) => s + l.quantity_g, 0) === qty, 'Lot quantities must total shipment quantity');
    } else {
      const lots = await repository.createShipmentListProcurement(connection, source, data);
      let remaining = qty;
      for (const l of lots) {
        const amount = Math.min(remaining, l.available_g - l.reserved_g);
        if (amount > 0) allocations.push({
          procurement_id: l.id,
          quantity_g: amount
        });
        remaining -= amount;
        if (!remaining) break;
      }
      ensure(!remaining, `Insufficient procurement lots for source_id=${source.id}, season_id=${data.season_id}, scheme_code="${data.scheme_code}". Requested=${qty/100000} QTL; available in lots=${(qty-remaining)/100000} QTL. Sync matching Paddy procurement first.`, 'INSUFFICIENT_LOTS');
    }
    for (const l of allocations.sort((a, b) => a.procurement_id - b.procurement_id)) {
      const p = await repository.createShipmentFindProcurement(connection, l);
      ensure(p.facility_id === source.id && p.season_id === data.season_id, `procurement_id=${l.procurement_id} does not match shipment source_id=${source.id} and season_id=${data.season_id}.`);
      ensure(p.scheme_code===data.scheme_code && p.commodity==='PADDY',`procurement_id=${l.procurement_id} does not match shipment scheme_code="${data.scheme_code}" and commodity=PADDY.`,'SCHEME_MISMATCH',400);
      ensure(p.available_g - p.reserved_g >= l.quantity_g, 'Procurement lot is already allocated', 'INSUFFICIENT_LOTS');
      await repository.createShipmentUpdateProcurement(connection, l, p);
      await repository.createShipmentInsertShipmentLots(connection, id, l);
    }
  } else await repository.createShipmentUpdateCmrOrders(connection, qty, order);
  await event(connection, id, 'PLANNED', new Date(), {
    quantity_g: qty,
    flow_type: flowType,
    expected_completion_at: data.expected_completion_at ?? null,
    driver_name: submission.driver_name ?? data.driver_name ?? null,
    driver_phone: submission.driver_phone ?? data.driver_phone ?? null,
    district_id: source.district_id,
    block_id: source.block_id,
    actor_id: context.user.id
  });
  return {
    id,
    shipment_no: data.shipment_no,
    ...masters,
    vehicle_type_id: v.vehicle_type_id ?? null,
    status: 'PLANNED',
    trip_status: 0,
    trip_started_at: null,
    trip_completed_at: null,
    expected_completion_at: data.expected_completion_at ?? null,
    flow_type: flowType,
    quantity_g: qty,
    recovery_percent: recovery,
    driver_name: submission.driver_name ?? data.driver_name ?? null,
    driver_phone: submission.driver_phone ?? data.driver_phone ?? null
  };
}
export async function deliverShipment(connection, data, context, s) {
  if (s.leg === 'CMR') ensure(!(await repository.deliverShipmentFindCmrReceipts(connection, s)), 'Rejected CMR requires return resolution before delivery', 'CMR_REJECTED', 409);
  ensure(['DISPATCHED', 'IN_TRANSIT', 'ARRIVED'].includes(s.status), 'Shipment is not awaiting delivery');
  if (s.leg === 'CMR') ensure(['ADMIN', 'OPERATOR'].includes(context.user.role), 'Only SFC operators can accept CMR rice', 'FORBIDDEN', 403);
  if (s.status !== 'ARRIVED') ensure(['ADMIN', 'OPERATOR'].includes(context.user.role) && data.gps_override_reason, 'GPS arrival is missing; an SFC operator must provide gps_override_reason', 'GPS_ARRIVAL_REQUIRED');
  const accepted = grams(data.accepted_quantity, true);
  ensure(accepted <= s.quantity_g, 'Accepted quantity exceeds dispatched quantity');
  const shortage = s.quantity_g - accepted;
  ensure(shortage === 0 || data.remarks, 'Remarks are required when there is a shortage', 'VALIDATION', 400);
  ensure(data.delivered_at >= new Date(s.arrived_at || s.departed_at || s.dispatched_at), 'Delivery timestamp precedes transport events');
  await lockFacilities(connection, [s.destination_id]);
  await stock(connection, s.destination_id, s.season_id, s.leg === 'PADDY' ? 'PADDY' : 'RICE', accepted, 0, 'DELIVERY', s.id, s.scheme_code, context.user);
  const obligation = s.leg === 'PADDY' ? recoveryGrams(accepted, s.recovery_percent) : null;
  if (s.order_id) {
    const o = await repository.deliverShipmentFindCmrOrders(connection, s);
    const delivered = o.delivered_g + accepted,
      committed = o.committed_g - s.quantity_g;
    ensure(committed >= 0 && delivered <= o.rice_quantity_g, 'CMR reconciliation conflict');
    await repository.deliverShipmentUpdateCmrOrders(connection, delivered, committed, o);
  }
  await repository.deliverShipmentUpdateShipments(connection, accepted, shortage, obligation, data, s);
  await event(connection, s.id, 'DELIVERED', data.delivered_at, {
    accepted_g: accepted,
    shortage_g: shortage,
    expected_rice_g: obligation,
    receipt_no: data.receipt_no,
    remarks: data.remarks,
    gps_override_reason: data.gps_override_reason,
    actor_id: context.user.id
  });
  return {
    id: s.id,
    status: 'DELIVERED',
    trip_status: 2,
    trip_started_at: s.trip_started_at || s.departed_at || null,
    trip_completed_at: s.trip_completed_at || s.arrived_at || data.delivered_at,
    accepted_g: accepted,
    shortage_g: shortage,
    expected_rice_g: obligation
  };
}
export async function dispatchShipment(connection, data, context) {
  const s = await ownedShipment(connection, context);
  ensure(s.status === 'PLANNED', 'Only a PLANNED shipment can be dispatched');
  data={...data,driver_name:data.driver_name??s.driver_name,driver_phone:data.driver_phone??s.driver_phone};
  ensure(data.driver_name,'driver_name is required.','VALIDATION',400);
  ensure(data.driver_phone,'driver_phone is required.','VALIDATION',400);
  const expected=data.expected_completion_at===undefined?s.expected_completion_at:data.expected_completion_at;
  ensure(!expected||new Date(expected)>=data.dispatched_at,'expected_completion_at must be on or after dispatched_at.','VALIDATION',400);
  data.expected_completion_at=expected??null;
  await lockFacilities(connection, [s.source_id]);
  await transport(connection, s.vehicle_id, ['PACS','LAMPS'].includes(context.user.role)?{...context.user,role:'MILLER',miller_id:s.miller_id}:context.user);
  const source = await repository.dispatchShipmentFindFacilities(connection, s);
  ensure(source.active, 'Source is inactive');
  const lots = await repository.dispatchShipmentListShipmentLots(connection, s);
  ensure(lots.every(l => data.dispatched_at >= new Date(l.procured_at)), 'Dispatch precedes a procurement receipt');
  if (s.order_id) {
    const o = await repository.dispatchShipmentFindCmrOrders(connection, s);
    ensure(o.status === 'OPEN' && data.dispatched_at >= new Date(o.ordered_at), 'Dispatch precedes order or order is closed');
  }
  await stock(connection, s.source_id, s.season_id, s.leg === 'PADDY' ? 'PADDY' : 'RICE', -s.quantity_g, -s.quantity_g, 'DISPATCH', s.id, s.scheme_code, context.user);
  for (const l of lots) await repository.dispatchShipmentUpdateProcurement(connection, l);
  await repository.dispatchShipmentUpdateShipments(connection, data, s);
  await event(connection, s.id, 'DISPATCHED', data.dispatched_at, {
    receipt_no: data.receipt_no,
    driver_name: data.driver_name,
    driver_phone: data.driver_phone,
    expected_completion_at: data.expected_completion_at,
    actor_id: context.user.id
  });
  return {
    id: s.id,
    status: 'DISPATCHED',
    trip_status: s.trip_status,
    trip_started_at: s.trip_started_at,
    trip_completed_at: s.trip_completed_at,
    expected_completion_at: data.expected_completion_at
  };
}
export async function completeDelivery(connection, data, context) {
  return deliverShipment(connection, data, context, await ownedShipment(connection, context));
}
export async function cancelShipment(connection, data, context) {
  const s = await ownedShipment(connection, context);
  ensure(s.status === 'PLANNED', 'Only PLANNED shipments may be cancelled');
  await lockFacilities(connection, [s.source_id]);
  await stock(connection, s.source_id, s.season_id, s.leg === 'PADDY' ? 'PADDY' : 'RICE', 0, -s.quantity_g, 'CANCEL', s.id, s.scheme_code, context.user);
  const lots = await repository.cancelShipmentListShipmentLots(connection, s);
  for (const l of lots) await repository.cancelShipmentUpdateProcurement(connection, l);
  if (s.order_id) await repository.cancelShipmentUpdateCmrOrders(connection, s);
  await repository.cancelShipmentUpdateShipments(connection, s);
  await event(connection, s.id, 'CANCELLED', new Date(), {
    reason: data.reason,
    actor_id: context.user.id
  });
  return {
    id: s.id,
    status: 'CANCELLED'
  };
}
export async function listShipments(context) {
  const effects = {
    headers: []
  };
  const {
      page,
      limit,
      offset
    } = pageParams(context.query),
    scope = scopedWhere(context.user);
  let sql = scope.sql;
  const args = [...scope.params];
  for (const field of ['season_id', 'miller_id', 'vehicle_id', 'status', 'leg', 'order_id', 'scheme_id', 'commodity_id']) if (context.query[field]) {
    sql += ` AND s.${field}=?`;
    args.push(String(context.query[field]));
  }
  if(context.query.scheme_code){sql+=' AND sc.code=?';args.push(String(context.query.scheme_code));}
  if(context.query.trip_status!==undefined){
    ensure(/^[012]$/.test(String(context.query.trip_status)),'trip_status must be 0, 1 or 2.','VALIDATION',400);
    sql+=' AND s.trip_status=?';args.push(Number(context.query.trip_status));
  }
  const count = await repository.listShipmentsCountShipments(sql, args);
  const data = await repository.listShipmentsListShipmentEvents(sql, limit, offset, args);
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
export async function getShipment(context) {
  const effects = {
    headers: []
  };
  const s = await ownedShipment(pool, context, false);
  const events = await repository.getShipmentListShipmentEvents(s);
  const lots = await repository.getShipmentListShipmentLots(s);
  return {
    body: {
      ok: true,
      data: {
        ...s,
        events,
        lots
      }
    },
    status: 200,
    ...effects
  };
}

