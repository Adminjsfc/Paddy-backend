import {addKg} from '../utils/core.js';
import {capacityKg} from '../utils/core.js';
import {requireStockMasters} from '../repositories/stock-masters.repository.js';
import * as repository from "../repositories/shipments.repository.js";
import { pool } from "../config/database.js";
import { stock } from "./stock.service.js";
import { lockFacilities } from "../repositories/facilities.repository.js";
import { event } from "../repositories/events.repository.js";
import { ensure, kilograms, millerAccess, vehicleAccess, recoveryKg, pageParams, scopedWhere } from "../utils/core.js";
import { activeSeason } from "./procurement.service.js";
import {ensureDriver} from './drivers.service.js';
import {planRoute,shipmentRoute} from './shipment-routes.service.js';
import {secondPrecision} from '../utils/datetime.js';
export async function ownedShipment(connection, context, lock = true) {
  const scope = scopedWhere(context.user);
  return repository.ownedShipmentFindShipments(connection, scope, lock, context);
}
export async function correctTripStatus(connection, data, context) {
  ensure(['ADMIN', 'OPERATOR'].includes(context.user.role), 'Only operators can correct trips', 'FORBIDDEN', 403);
  const s = await ownedShipment(connection, context);
  ensure(['DISPATCHED', 'IN_TRANSIT'].includes(s.status), 'Only dispatched or running shipments can be corrected', 'INVALID_TRIP_STATE', 409);
  ensure(Number(s.trip_status) <= data.trip_status, 'Trip correction cannot move backwards', 'INVALID_TRIP_STATE', 409);
  await repository.correctTripStatus(connection, s, data);
  await event(connection, s.id, 'TRIP_STATUS_CORRECTED', new Date(), {
    actor_id: context.user.id, reason: data.reason,
    before: { status: s.status, trip_status: s.trip_status, dispatched_at: s.dispatched_at,
      trip_started_at: s.trip_started_at, trip_completed_at: s.trip_completed_at },
    after: data
  });
  return { id: s.id, status: data.trip_status === 1 ? 'IN_TRANSIT' : 'ARRIVED',
    trip_status: data.trip_status, dispatched_at: data.dispatched_at,
    trip_started_at: data.trip_started_at, trip_completed_at: data.trip_completed_at ?? null };
}
export async function transport(connection, vehicleId, user) {
  const v = await repository.transportFindVehicles(connection, vehicleId);
  vehicleAccess(user, v);
  ensure(v.active, 'Vehicle is inactive');
  await repository.transportFindGpsDevices(connection, v);
  return v;
}
export async function createShipment(connection, data, context, submission = {}) {
  ensure(data.leg === 'PADDY' ? ['PACS','LAMPS'].includes(context.user.role) : context.user.role === 'MILLER',
    data.leg === 'PADDY' ? 'Only PACS/LAMPS can create Paddy shipments.' : 'Only Miller can create CMR shipments.', 'FORBIDDEN', 403);
  const driverOwnerId = ['PACS','LAMPS'].includes(context.user.role) ? context.user.facility_id : data.miller_id;
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
  const activeVehicle = await repository.createShipmentFindShipments(connection, v);
  ensure(!activeVehicle, 'Vehicle already has an active shipment', 'VEHICLE_BUSY', 409);
  const qty = kilograms(data.quantity);
  ensure(qty <= capacityKg(v), 'Vehicle loading capacity exceeded', 'VEHICLE_OVERLOAD');
  let order = null;
  if (data.leg === 'CMR') {
    ensure(data.order_id && data.lots.length === 0, 'CMR requires order_id and must not include procurement lots', 'VALIDATION', 400);
    order = await repository.createShipmentFindCmrOrders(connection, data);
    ensure(order.scheme_code===data.scheme_code && order.commodity==='RICE',`order_id=${data.order_id} requires scheme_code="${order.scheme_code}" and commodity=RICE; shipment scheme_code="${data.scheme_code}" does not match.`,'SCHEME_MISMATCH',400);
    ensure(order.status === 'OPEN' && order.miller_id === data.miller_id && order.destination_id === data.destination_id && order.season_id === data.season_id, 'CMR order does not match shipment or is closed');
    ensure(addKg(order.delivered_kg,order.committed_kg,qty) <= order.rice_quantity_kg, 'CMR order quantity exceeded', 'ORDER_OVERALLOCATION');
  } else ensure(data.order_id === null, 'Paddy shipment cannot reference a CMR order', 'VALIDATION', 400);
  const recovery = data.leg === 'PADDY' ? miller.recovery_percent ?? season.recovery_percent : null;
  const flowType = data.leg === 'PADDY' ? 'PACS_LAMPS_TO_MILLER' : 'MILLER_TO_GODOWN';
  const driverName = submission.driver_name ?? data.driver_name;
  const driverPhone = submission.driver_phone ?? data.driver_phone;
  const driver = driverName && driverPhone ? await ensureDriver(connection, {name:driverName,phone:driverPhone}, context, driverOwnerId) : null;
  submission = {...submission,driver_user_id:driver?.id ?? null};
  const route=await planRoute(connection,source.id,dest.id,context.user.id);
  const id = await repository.createShipmentInsertShipments(connection, data, flowType, source, dest, v, qty, recovery, submission, masters,route.id);
  await stock(connection, source.id, data.season_id, data.leg === 'PADDY' ? 'PADDY' : 'RICE', 0, qty, 'RESERVE', id, data.scheme_code, context.user);
  if (data.leg === 'PADDY') {
    let allocations = [];
    if (data.lots.length) {
      ensure(new Set(data.lots.map(l => l.procurement_id)).size === data.lots.length, 'Duplicate procurement lots', 'VALIDATION', 400);
      allocations = data.lots.map(l => ({
        procurement_id: l.procurement_id,
        quantity_kg: kilograms(l.quantity)
      }));
      ensure(allocations.reduce((s, l) => addKg(s,l.quantity_kg), 0) === qty, 'Lot quantities must total shipment quantity');
    } else {
      const lots = await repository.createShipmentListProcurement(connection, source, data);
      let remaining = qty;
      for (const l of lots) {
        const amount = Math.min(remaining, addKg(l.available_kg,-l.reserved_kg));
        if (amount > 0) allocations.push({
          procurement_id: l.id,
          quantity_kg: amount
        });
        remaining = addKg(remaining,-amount);
        if (!remaining) break;
      }
      ensure(!remaining, `Insufficient procurement lots for source_id=${source.id}, season_id=${data.season_id}, scheme_code="${data.scheme_code}". Requested=${qty} kg; available in lots=${addKg(qty,-remaining)} kg. Sync matching Paddy procurement first.`, 'INSUFFICIENT_LOTS');
    }
    for (const l of allocations.sort((a, b) => a.procurement_id - b.procurement_id)) {
      const p = await repository.createShipmentFindProcurement(connection, l);
      ensure(p.miller_id!=null,`procurement_id=${l.procurement_id}: allotted miller is missing; correct the RO first`,'PROCUREMENT_MILLER_REQUIRED');
      ensure(Number(p.miller_id)===data.miller_id,`procurement_id=${l.procurement_id}: RO is allotted to a different miller`,'PROCUREMENT_MILLER_MISMATCH');
      ensure(p.facility_id === source.id && p.season_id === data.season_id, `procurement_id=${l.procurement_id} does not match shipment source_id=${source.id} and season_id=${data.season_id}.`);
      ensure(p.scheme_code===data.scheme_code && p.commodity==='PADDY',`procurement_id=${l.procurement_id} does not match shipment scheme_code="${data.scheme_code}" and commodity=PADDY.`,'SCHEME_MISMATCH',400);
      ensure(addKg(p.available_kg,-p.reserved_kg) >= l.quantity_kg, 'Procurement lot is already allocated', 'INSUFFICIENT_LOTS');
      await repository.createShipmentUpdateProcurement(connection, l, p);
      await repository.createShipmentInsertShipmentLots(connection, id, l);
    }
  } else await repository.createShipmentUpdateCmrOrders(connection, qty, order);
  await event(connection, id, 'PLANNED', new Date(), {
    quantity_kg: qty,
    flow_type: flowType,
    expected_completion_at: null,
    driver_name: submission.driver_name ?? data.driver_name ?? null,
    driver_phone: submission.driver_phone ?? data.driver_phone ?? null,
    district_id: source.district_id,
    actor_id: context.user.id
  });
  return {
    id,
    shipment_no: data.shipment_no,
    route,
    route_id: route.id,
    driver_user_id: driver?.id ?? null,
    driver_account: driver,
    ...masters,
    vehicle_type_id: v.vehicle_type_id ?? null,
    status: 'PLANNED',
    trip_status: 0,
    trip_started_at: null,
    trip_completed_at: null,
    expected_completion_at: null,
    flow_type: flowType,
    quantity_kg: qty,
    recovery_percent: recovery,
    driver_name: submission.driver_name ?? data.driver_name ?? null,
    driver_phone: submission.driver_phone ?? data.driver_phone ?? null
  };
}
export async function deliverShipment(connection, data, context, s) {
  if (s.leg === 'CMR') ensure(!(await repository.deliverShipmentFindCmrReceipts(connection, s)), 'Rejected CMR requires return resolution before delivery', 'CMR_REJECTED', 409);
  ensure(['DISPATCHED', 'IN_TRANSIT', 'ARRIVED'].includes(s.status), 'Shipment is not awaiting delivery');
  if (s.leg === 'CMR') ensure(['ADMIN', 'OPERATOR'].includes(context.user.role), 'Only SFC operators can accept CMR rice', 'FORBIDDEN', 403);
  if (s.status !== 'ARRIVED') ensure(['ADMIN', 'OPERATOR'].includes(context.user.role) && data.gps_override_reason, 'Shipment must be ARRIVED before receiving', 'GPS_ARRIVAL_REQUIRED');
  const accepted = kilograms(data.accepted_quantity, true);
  ensure(Number.isInteger(data.received_bags) && data.received_bags >= 0 && data.received_bags <= 10000000,
    'received_bags must be a nonnegative whole number', 'VALIDATION', 400);
  ensure(accepted === 0 || data.received_bags > 0, 'Received bags are required for a positive receipt', 'VALIDATION', 400);
  ensure(accepted <= s.quantity_kg, 'Accepted quantity exceeds dispatched quantity');
  const shortage = addKg(s.quantity_kg,-accepted);
  ensure(data.delivered_at >= new Date(s.trip_completed_at || s.trip_started_at || s.dispatched_at), 'Delivery timestamp precedes transport events');
  await lockFacilities(connection, [s.destination_id]);
  await stock(connection, s.destination_id, s.season_id, s.leg === 'PADDY' ? 'PADDY' : 'RICE', accepted, 0, 'DELIVERY', s.id, s.scheme_code, context.user);
  const obligation = s.leg === 'PADDY' ? recoveryKg(accepted, s.recovery_percent) : null;
  if (s.order_id) {
    const o = await repository.deliverShipmentFindCmrOrders(connection, s);
    const delivered = addKg(o.delivered_kg,accepted),
      committed = addKg(o.committed_kg,-s.quantity_kg);
    ensure(committed >= 0 && delivered <= o.rice_quantity_kg, 'CMR reconciliation conflict');
    await repository.deliverShipmentUpdateCmrOrders(connection, delivered, committed, o);
  }
  await repository.deliverShipmentUpdateShipments(connection, accepted, shortage, obligation, data, s);
  await event(connection, s.id, 'DELIVERED', data.delivered_at, {
    accepted_kg: accepted,
    shortage_kg: shortage,
    expected_rice_kg: obligation,
    received_bags: data.received_bags,
    receipt_no: data.receipt_no,
    remarks: data.remarks,
    gps_override_reason: data.gps_override_reason,
    actor_id: context.user.id
  });
  return {
    id: s.id,
    status: 'DELIVERED',
    trip_status: 2,
    trip_started_at: s.trip_started_at || null,
    trip_completed_at: s.trip_completed_at || data.delivered_at,
    accepted_kg: accepted,
    shortage_kg: shortage,
    expected_rice_kg: obligation,
    received_bags: data.received_bags,
    delivered_at: data.delivered_at
  };
}
export async function dispatchShipment(connection, data, context) {
  const s = await ownedShipment(connection, context);
  ensure(s.status === 'PLANNED', 'Only a PLANNED shipment can be dispatched');
  data={...data,driver_name:data.driver_name??s.driver_name,driver_phone:data.driver_phone??s.driver_phone};
  ensure(data.driver_name,'driver_name is required.','VALIDATION',400);
  ensure(data.driver_phone,'driver_phone is required.','VALIDATION',400);
  await lockFacilities(connection, [s.source_id]);
  await transport(connection, s.vehicle_id, ['PACS','LAMPS'].includes(context.user.role)?{...context.user,role:'MILLER',miller_id:s.miller_id}:context.user);
  const source = await repository.dispatchShipmentFindFacilities(connection, s);
  ensure(source.active, 'Source is inactive');
  const lots = await repository.dispatchShipmentListShipmentLots(connection, s);
  if(s.leg==='PADDY'){
    ensure(lots.length>0,'Paddy shipment has no allocated RO','PROCUREMENT_MILLER_REQUIRED');
    ensure(lots.every(l=>l.miller_id!=null),'An allocated RO has no allotted miller; correct the RO first','PROCUREMENT_MILLER_REQUIRED');
    ensure(lots.every(l=>Number(l.miller_id)===Number(s.miller_id)),'Allocated RO miller does not match shipment destination','PROCUREMENT_MILLER_MISMATCH');
  }
  ensure(lots.every(l => data.dispatched_at >= new Date(l.procured_at)), 'Dispatch precedes a procurement receipt');
  if (s.order_id) {
    const o = await repository.dispatchShipmentFindCmrOrders(connection, s);
    ensure(o.status === 'OPEN' && data.dispatched_at >= new Date(o.ordered_at), 'Dispatch precedes order or order is closed');
  }
  await stock(connection, s.source_id, s.season_id, s.leg === 'PADDY' ? 'PADDY' : 'RICE', -s.quantity_kg, -s.quantity_kg, 'DISPATCH', s.id, s.scheme_code, context.user);
  for (const l of lots) await repository.dispatchShipmentUpdateProcurement(connection, l);
  const ownerId = ['PACS','LAMPS'].includes(context.user.role) ? context.user.facility_id : s.miller_id;
  const driver = await ensureDriver(connection, {name:data.driver_name,phone:data.driver_phone}, context, ownerId);
  data.driver_user_id = driver.id;
  await repository.dispatchShipmentUpdateShipments(connection, data, s);
  await event(connection, s.id, 'DISPATCHED', data.dispatched_at, {
    receipt_no: data.receipt_no,
    driver_name: data.driver_name,
    driver_phone: data.driver_phone,
    actor_id: context.user.id
  });
  return {
    id: s.id,
    status: 'DISPATCHED',
    driver_user_id:driver.id,
    driver_account:driver,
    trip_status: s.trip_status,
    trip_started_at: s.trip_started_at,
    trip_completed_at: s.trip_completed_at,
    expected_completion_at: null
  };
}
export async function completeDelivery(connection, data, context) {
  const shipment=await ownedShipment(connection,context);
  return deliverShipment(connection,{
    accepted_quantity:{value:data.value,unit:data.unit},received_bags:data.received_bags,
    delivered_at:secondPrecision(new Date()),remarks:shipment.remarks??null
  },context,shipment);
}
export async function cancelShipment(connection, data, context) {
  const s = await ownedShipment(connection, context);
  ensure(s.status === 'PLANNED', 'Only PLANNED shipments may be cancelled');
  await lockFacilities(connection, [s.source_id]);
  await stock(connection, s.source_id, s.season_id, s.leg === 'PADDY' ? 'PADDY' : 'RICE', 0, -s.quantity_kg, 'CANCEL', s.id, s.scheme_code, context.user);
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
  for (const field of ['season_id', 'miller_id', 'vehicle_id', 'status', 'leg', 'order_id', 'commodity_code']) if (context.query[field]) {
    sql += ` AND s.${field}=?`;
    args.push(String(context.query[field]));
  }
  if(context.query.scheme_code){sql+=' AND s.scheme_code=?';args.push(String(context.query.scheme_code));}
  if(context.query.trip_status!==undefined){
    ensure(/^[012]$/.test(String(context.query.trip_status)),'trip_status must be 0, 1 or 2.','VALIDATION',400);
    sql+=' AND s.trip_status=?';args.push(Number(context.query.trip_status));
  }
  if(context.query.exclude_cancelled!==undefined){
    ensure(['true','false'].includes(String(context.query.exclude_cancelled)),'exclude_cancelled must be true or false.','VALIDATION',400);
    if(String(context.query.exclude_cancelled)==='true')sql+=" AND s.status<>'CANCELLED'";
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
        route: await shipmentRoute(pool,s.id),
        events,
        lots
      }
    },
    status: 200,
    ...effects
  };
}

