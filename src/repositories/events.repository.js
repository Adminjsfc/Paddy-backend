import { insert } from "./database.js";
export async function event(connection, shipmentId, type, at, detail = {}) {
  await insert(connection, 'shipment_events', {
    shipment_id: shipmentId,
    event_type: type,
    occurred_at: at,
    detail: JSON.stringify(detail)
  });
}
