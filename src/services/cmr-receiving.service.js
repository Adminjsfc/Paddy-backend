import * as repository from "../repositories/cmr-receiving.repository.js";
import { z } from 'zod';
import { event } from "../repositories/events.repository.js";
import { ensure, pageParams } from "../utils/core.js";
import { deliverShipment } from "./shipments.service.js";
export function scaled(text, places) {
  const [whole, fraction = ''] = text.split('.');
  return Number(BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0')));
}
export function receivingCalculation(data) {
  ensure(new Set(data.stacks.map(row => row.stack_no.toUpperCase())).size === data.stacks.length, 'Duplicate stack numbers', 'VALIDATION', 400);
  const stacks = data.stacks.map(row => ({
    ...row,
    quantity_g: scaled(row.received_quantity_qtl, 5)
  }));
  const totalBags = stacks.reduce((sum, row) => sum + row.bags, 0),
    received = stacks.reduce((sum, row) => sum + row.quantity_g, 0);
  const gross = scaled(data.gross_weight_kg, 3),
    perBag = scaled(data.empty_bag_weight_kg, 3),
    tare = perBag * totalBags,
    net = gross - tare;
  ensure([gross, perBag, tare, net, received].every(Number.isSafeInteger), 'Weights are outside allowed range', 'VALIDATION', 400);
  ensure(stacks.every(row => row.quantity_g > 0) && perBag > 0 && net > 0, 'Rice and bag weights must be positive', 'VALIDATION', 400);
  ensure(received === net, 'Stack received quantities must equal gross weight minus total empty bag weight', 'WEIGHT_MISMATCH', 400);
  ensure(data.decision !== 'ACCEPTED' || data.compliance_confirmed, 'Confirm rice quality compliance before accepting', 'QUALITY_CONFIRMATION_REQUIRED', 400);
  ensure(data.decision !== 'REJECTED' || data.remarks.length >= 10, 'Provide the rejection reason (at least 10 characters)', 'VALIDATION', 400);
  return {
    stacks,
    total_bags: totalBags,
    gross_g: gross,
    tare_per_bag_g: perBag,
    tare_g: tare,
    net_g: net
  };
}
export function receivingScope(user, alias = 'f') {
  ensure(user.stores?.length, 'No assigned receiving stores', 'STORE_SCOPE_REQUIRED', 403);
  return {
    sql: `(${user.stores.map(() => `(${alias}.core_store_id=? AND ${alias}.district_id=?)`).join(' OR ')})`,
    args: user.stores.flatMap(row => [row.store_id, row.district_id])
  };
}
export async function receiveCMR(connection, data, context) {
  const scope = receivingScope(context.user);
  const shipment = await repository.receiveCMRFindShipments(connection, scope, context);
  ensure(['DISPATCHED', 'IN_TRANSIT', 'ARRIVED'].includes(shipment.status), 'Only shipped CMR awaiting receipt can be reviewed', 'INVALID_STATUS', 409);
  ensure(!(await repository.receiveCMRFindCmrReceipts(connection, shipment)), 'This shipment has already been reviewed', 'ALREADY_REVIEWED', 409);
  ensure(shipment.status === 'ARRIVED' || data.gps_override_reason, 'GPS arrival is missing; provide an arrival override reason', 'GPS_ARRIVAL_REQUIRED', 409);
  ensure(data.received_at >= new Date(shipment.trip_completed_at || shipment.trip_started_at || shipment.dispatched_at), 'Receipt precedes transport events', 'VALIDATION', 400);
  const calc = receivingCalculation(data);
  ensure(calc.net_g <= shipment.quantity_g, 'Net rice weight exceeds dispatched quantity', 'OVER_RECEIPT', 400);
  ensure(calc.net_g === shipment.quantity_g || data.remarks.length > 0, 'Remarks are required for a shortage', 'VALIDATION', 400);
  const receiptId = await repository.receiveCMRInsertCmrReceipts(connection, shipment, data, calc, context);
  for (const stack of calc.stacks) await repository.receiveCMRInsertCmrReceiptStacks(connection, receiptId, stack);
  if (data.decision === 'ACCEPTED') {
    // The receiver was scoped above; the shared delivery helper retains stock,
    // capacity, order commitment and shipment reconciliation in this transaction.
    await deliverShipment(connection, {
      accepted_quantity: {
        value: (calc.net_g / 1000).toFixed(3),
        unit: 'KG'
      },
      delivered_at: data.received_at,
      receipt_no: data.receipt_no,
      remarks: data.remarks || null,
      gps_override_reason: data.gps_override_reason
    }, {
      ...context,
      user: {
        ...context.user,
        role: 'OPERATOR'
      }
    }, shipment);
  }
  await event(connection, shipment.id, `CMR_${data.decision}`, data.received_at, {
    receipt_id: receiptId,
    actor: context.user.actor,
    net_g: calc.net_g,
    remarks: data.remarks
  });
  return {
    id: receiptId,
    shipment_id: shipment.id,
    decision: data.decision,
    net_g: calc.net_g,
    shortage_g: shipment.quantity_g - calc.net_g
  };
}
export async function listShipments(context) {
  const effects = {
    headers: []
  };
  const scope = receivingScope(context.user),
    {
      page,
      limit,
      offset
    } = pageParams(context.query);
  let filter = `s.leg='CMR' AND s.status<>'CANCELLED' AND f.kind IN ('SFC_GODOWN','FCI') AND ${scope.sql}`;
  const args = [...scope.args];
  if (context.query.status) {
    const status = z.enum(['PLANNED', 'DISPATCHED', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'ACCEPTED', 'REJECTED']).parse(context.query.status);
    filter += ' AND COALESCE(r.decision,s.status)=?';
    args.push(status);
  }
  const base = `FROM shipments s JOIN facilities f ON f.id=s.destination_id JOIN facilities m ON m.id=s.miller_id JOIN vehicles v ON v.id=s.vehicle_id
    JOIN schemes sc ON sc.id=s.scheme_id JOIN commodities co ON co.id=s.commodity_id
    JOIN seasons se ON se.id=s.season_id LEFT JOIN cmr_receipts r ON r.shipment_id=s.id WHERE ${filter}`;
  const count = await repository.listShipmentsCountRecords(base, args);
  const data = await repository.listShipmentsListRecords(base, limit, offset, args);
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
export async function listStock(context) {
  const effects = {
    headers: []
  };
  const scope = receivingScope(context.user),
    {
      page,
      limit,
      offset
    } = pageParams(context.query);
  const base = `FROM cmr_receipt_stacks st JOIN cmr_receipts r ON r.id=st.receipt_id JOIN shipments s ON s.id=r.shipment_id
    JOIN schemes sc ON sc.id=s.scheme_id
    JOIN facilities f ON f.id=s.destination_id JOIN facilities m ON m.id=s.miller_id JOIN seasons se ON se.id=s.season_id
    WHERE r.decision='ACCEPTED' AND ${scope.sql}`;
  const count = await repository.listStockCountRecords(base, scope);
  const data = await repository.listStockListRecords(base, limit, offset, scope);
  const balances = await repository.listStockListStocks(scope);
  return {
    body: {
      ok: true,
      data,
      balances,
      received_g: count.received_g,
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
  const scope = receivingScope(context.user);
  const shipment = await repository.getShipmentFindShipments(scope, context);
  const receipt = await repository.getShipmentFindCmrReceipts(shipment);
  const stacks = receipt ? await repository.getShipmentListCmrReceiptStacks(receipt) : [];
  return {
    body: {
      ok: true,
      data: {
        ...shipment,
        receipt: receipt ? {
          ...receipt,
          stacks
        } : null
      }
    },
    status: 200,
    ...effects
  };
}
