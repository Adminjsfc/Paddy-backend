import { pool } from "../config/database.js";
import { rows, one, insert } from "../repositories/database.js";
export async function ownedShipmentFindShipments(connection, scope, lock, context) {
  return one(connection, `SELECT s.id,s.shipment_no,s.leg,s.flow_type,s.season_id,s.miller_id,s.route_id,s.district_id,s.block_id,s.vehicle_id,s.order_id,s.quantity_g,s.accepted_g,s.shortage_g,s.recovery_percent,s.expected_rice_g,s.status,s.trip_status,s.trip_started_at,s.trip_completed_at,s.expected_completion_at,s.source_lat,s.source_lng,s.source_radius_m,s.destination_lat,s.destination_lng,s.destination_radius_m,s.source_geofence,s.destination_geofence,s.dispatched_at,s.delivered_at,s.last_gps_at,s.dispatch_receipt,s.driver_name,s.driver_phone,s.delivery_receipt,s.remarks,s.created_at,s.submitted_on,s.agency,s.cmr_lot_count,s.stenciling_code,s.gunny_bag_year,s.gunny_bag_type,s.total_bags,s.core_store_location_id,s.scheme_id,s.commodity_id,s.vehicle_type_id,s.driver_user_id,s.source_id,s.destination_id,sc.code scheme_code,co.code commodity_code,vt.name vehicle_type FROM shipment_details s
    JOIN schemes sc ON sc.id=s.scheme_id JOIN commodities co ON co.id=s.commodity_id
    LEFT JOIN vehicle_types vt ON vt.id=s.vehicle_type_id WHERE s.id=?${scope.sql}${lock ? ' FOR UPDATE' : ''}`, [context.params.id, ...scope.params]);
}
export async function transportFindVehicles(connection, vehicleId) {
  return one(connection, `SELECT v.id,v.transporter_id,v.vehicle_type_id,v.registration_no,v.capacity_g,v.active,v.created_by,v.created_at,v.updated_by,v.updated_at,v.mapping_status,v.status_updated_at,COALESCE(v.miller_id,t.miller_id) miller_id,COALESCE(t.active,1) transporter_active FROM vehicles v LEFT JOIN transporters t ON t.id=v.transporter_id WHERE v.id=? FOR UPDATE`, [vehicleId],true,{code:'VEHICLE_NOT_FOUND',message:`vehicle_id=${vehicleId} was not found. Select a registered vehicle.`});
}
export async function transportFindGpsDevices(connection, v) {
  return one(connection, 'SELECT id FROM gps_devices WHERE vehicle_id=? AND active=1', [v.id],true,{code:'GPS_DEVICE_NOT_FOUND',message:`vehicle_id=${v.id} has no active GPS device. Map an active GPS device before lifting.`});
}
export async function createShipmentFindFacilities(connection, data) {
  return one(connection, 'SELECT id,code,kind,name,address,district_id,block_id,latitude,longitude,radius_m,capacity_g,milling_capacity_g_per_day,recovery_percent,contact_name,phone,active,created_by,created_by_core_user_id,created_by_user_type,created_at,updated_by,updated_at,core_store_id FROM facilities WHERE id=? AND active=1', [data.source_id],true,{code:'SOURCE_NOT_FOUND',message:`source_id=${data.source_id} was not found or is inactive.`});
}
export async function createShipmentFindFacilities2(connection, data) {
  return one(connection, 'SELECT id,code,kind,name,address,district_id,block_id,latitude,longitude,radius_m,capacity_g,milling_capacity_g_per_day,recovery_percent,contact_name,phone,active,created_by,created_by_core_user_id,created_by_user_type,created_at,updated_by,updated_at,core_store_id FROM facilities WHERE id=? AND active=1', [data.destination_id],true,{code:'DESTINATION_NOT_FOUND',message:`destination_id=${data.destination_id} was not found or is inactive.`});
}
export async function createShipmentFindRouteTags(connection, data, source, dest) {
  return one(connection, 'SELECT id FROM route_tags WHERE season_id=? AND source_id=? AND destination_id=? AND active=1', [data.season_id, source.id, dest.id],true,{code:'PADDY_MAPPING_NOT_FOUND',message:`PACS/LAMPS source_id=${source.id} is not mapped to Miller destination_id=${dest.id} for season_id=${data.season_id}. Create or activate this mapping before lifting.`});
}
export async function createShipmentFindMillerStoreAssignments(connection, data, dest) {
  return one(connection, 'SELECT id FROM miller_store_assignments WHERE season_id=? AND miller_id=? AND store_id=? AND active=1', [data.season_id, data.miller_id, dest.id],true,{code:'CMR_MAPPING_NOT_FOUND',message:`miller_id=${data.miller_id} is not assigned to godown destination_id=${dest.id} for season_id=${data.season_id}.`});
}
export async function createShipmentFindShipments(connection, v) {
  return one(connection, "SELECT id FROM shipment_details WHERE vehicle_id=? AND status IN ('PLANNED','DISPATCHED','IN_TRANSIT','ARRIVED') FOR UPDATE", [v.id], false);
}
export async function createShipmentFindCmrOrders(connection, data) {
  return one(connection, 'SELECT id,external_ref,payload_hash,season_id,miller_id,destination_id,order_no,ordered_at,due_date,rice_quantity_g,committed_g,delivered_g,status,scheme_code,commodity FROM cmr_orders WHERE id=? FOR UPDATE', [data.order_id],true,{code:'CMR_ORDER_NOT_FOUND',message:`order_id=${data.order_id} does not match a CMR order.`});
}
export async function createShipmentInsertShipments(connection, data, flowType, source, dest, v, qty, recovery, submission, masters, routeId) {
  return insert(connection, 'shipments', {
    shipment_no: data.shipment_no,
    ...masters,
    vehicle_type_id: v.vehicle_type_id ?? null,
    leg: data.leg,
    flow_type: flowType,
    season_id: data.season_id,
    miller_id: data.miller_id,
    route_id: routeId,
    district_id: source.district_id,
    block_id: source.block_id,
    vehicle_id: v.id,
    order_id: data.order_id,
    driver_name: data.driver_name ?? null,
    driver_phone: data.driver_phone ?? null,
    expected_completion_at: data.expected_completion_at ?? null,
    quantity_g: qty,
    recovery_percent: recovery,
    source_lat: source.latitude,
    source_lng: source.longitude,
    source_radius_m: source.radius_m,
    destination_lat: dest.latitude,
    destination_lng: dest.longitude,
    destination_radius_m: dest.radius_m,
    remarks: data.remarks,
    ...submission
  });
}
export async function createShipmentListProcurement(connection, source, data) {
  return rows(connection, "SELECT p.id,p.available_g,p.reserved_g FROM procurement p JOIN schemes sc ON sc.id=p.scheme_id JOIN commodities co ON co.id=p.commodity_id WHERE p.facility_id=? AND p.season_id=? AND sc.code=? AND co.code='PADDY' AND p.available_g>p.reserved_g ORDER BY p.procured_at,p.id FOR UPDATE", [source.id, data.season_id, data.scheme_code]);
}
export async function createShipmentFindProcurement(connection, l) {
  return one(connection, 'SELECT p.id,p.external_ref,p.payload_hash,p.season_id,p.farmer_id,p.facility_id,p.procured_at,p.quantity_g,p.available_g,p.reserved_g,p.moisture_percent,p.receipt_no,p.created_at,p.scheme_id,p.commodity_id,sc.code scheme_code,co.code commodity FROM procurement p JOIN schemes sc ON sc.id=p.scheme_id JOIN commodities co ON co.id=p.commodity_id WHERE p.id=? FOR UPDATE', [l.procurement_id],true,{code:'PROCUREMENT_LOT_NOT_FOUND',message:`procurement_id=${l.procurement_id} was not found. Select a synced procurement lot.`});
}
export async function createShipmentUpdateProcurement(connection, l, p) {
  return rows(connection, 'UPDATE procurement SET reserved_g=reserved_g+? WHERE id=?', [l.quantity_g, p.id]);
}
export async function createShipmentInsertShipmentLots(connection, id, l) {
  return insert(connection, 'shipment_lots', {
    shipment_id: id,
    ...l
  });
}
export async function createShipmentUpdateCmrOrders(connection, qty, order) {
  return rows(connection, 'UPDATE cmr_orders SET committed_g=committed_g+? WHERE id=?', [qty, order.id]);
}
export async function deliverShipmentFindCmrReceipts(connection, s) {
  return one(connection, "SELECT id FROM cmr_receipts WHERE shipment_id=? AND decision='REJECTED'", [s.id], false);
}
export async function deliverShipmentFindCmrOrders(connection, s) {
  return one(connection, 'SELECT id,external_ref,payload_hash,season_id,miller_id,destination_id,order_no,ordered_at,due_date,rice_quantity_g,committed_g,delivered_g,status,scheme_code,commodity FROM cmr_orders WHERE id=? FOR UPDATE', [s.order_id]);
}
export async function deliverShipmentUpdateCmrOrders(connection, delivered, committed, o) {
  return rows(connection, 'UPDATE cmr_orders SET delivered_g=?,committed_g=?,status=? WHERE id=?', [delivered, committed, delivered === o.rice_quantity_g ? 'FULFILLED' : 'OPEN', o.id]);
}
export async function deliverShipmentUpdateShipments(connection, accepted, shortage, obligation, data, s) {
  return rows(connection, "UPDATE shipments SET status='DELIVERED',accepted_g=?,shortage_g=?,expected_rice_g=?,delivered_at=?,delivery_receipt=?,remarks=?,trip_status=2,trip_completed_at=COALESCE(trip_completed_at,?) WHERE id=?", [accepted, shortage, obligation, data.delivered_at, data.receipt_no, data.remarks, data.delivered_at, s.id]);
}
export async function dispatchShipmentFindFacilities(connection, s) {
  return one(connection, 'SELECT active FROM facilities WHERE id=?', [s.source_id]);
}
export async function dispatchShipmentListShipmentLots(connection, s) {
  return rows(connection, 'SELECT l.shipment_id,l.procurement_id,l.quantity_g,p.procured_at FROM shipment_lots l JOIN procurement p ON p.id=l.procurement_id WHERE l.shipment_id=? ORDER BY l.procurement_id FOR UPDATE', [s.id]);
}
export async function dispatchShipmentFindCmrOrders(connection, s) {
  return one(connection, 'SELECT ordered_at,status FROM cmr_orders WHERE id=?', [s.order_id]);
}
export async function dispatchShipmentUpdateProcurement(connection, l) {
  return rows(connection, 'UPDATE procurement SET available_g=available_g-?,reserved_g=reserved_g-? WHERE id=?', [l.quantity_g, l.quantity_g, l.procurement_id]);
}
export async function dispatchShipmentUpdateShipments(connection, data, s) {
  return rows(connection, "UPDATE shipments SET status='DISPATCHED',dispatched_at=?,dispatch_receipt=?,driver_name=?,driver_phone=?,expected_completion_at=?,driver_user_id=? WHERE id=?", [data.dispatched_at, data.receipt_no, data.driver_name, data.driver_phone, data.expected_completion_at, data.driver_user_id, s.id]);
}
export async function cancelShipmentListShipmentLots(connection, s) {
  return rows(connection, 'SELECT shipment_id,procurement_id,quantity_g FROM shipment_lots WHERE shipment_id=? ORDER BY procurement_id', [s.id]);
}
export async function cancelShipmentUpdateProcurement(connection, l) {
  return rows(connection, 'UPDATE procurement SET reserved_g=reserved_g-? WHERE id=?', [l.quantity_g, l.procurement_id]);
}
export async function cancelShipmentUpdateCmrOrders(connection, s) {
  return rows(connection, 'UPDATE cmr_orders SET committed_g=committed_g-? WHERE id=?', [s.quantity_g, s.order_id]);
}
export async function cancelShipmentUpdateShipments(connection, s) {
  return rows(connection, "UPDATE shipments SET status='CANCELLED' WHERE id=?", [s.id]);
}
export async function listShipmentsCountShipments(sql, args) {
  return one(pool, `SELECT COUNT(s.id) total FROM shipment_details s JOIN schemes sc ON sc.id=s.scheme_id WHERE 1=1${sql}`, args);
}
export async function listShipmentsListShipmentEvents(sql, limit, offset, args) {
  return rows(pool, `SELECT s.id,s.shipment_no,s.leg,s.flow_type,s.season_id,s.miller_id,s.route_id,s.district_id,s.block_id,s.vehicle_id,s.order_id,s.quantity_g,s.accepted_g,s.shortage_g,s.recovery_percent,s.expected_rice_g,s.status,s.trip_status,s.trip_started_at,s.trip_completed_at,s.expected_completion_at,s.source_lat,s.source_lng,s.source_radius_m,s.destination_lat,s.destination_lng,s.destination_radius_m,s.source_geofence,s.destination_geofence,s.dispatched_at,s.delivered_at,s.last_gps_at,s.dispatch_receipt,s.driver_name,s.driver_phone,s.delivery_receipt,s.remarks,s.created_at,s.submitted_on,s.agency,s.cmr_lot_count,s.stenciling_code,s.gunny_bag_year,s.gunny_bag_type,s.total_bags,s.core_store_location_id,s.scheme_id,s.commodity_id,s.vehicle_type_id,s.driver_user_id,s.source_id,s.destination_id,sc.code scheme_code,co.code commodity_code,vt.name vehicle_type,v.registration_no,f.name source_name,t.name destination_name,
    dd.district_name destination_district_name,COALESCE(r.decision,s.status) display_status,
    COALESCE(r.received_at,(SELECT MAX(e.occurred_at) FROM shipment_events e WHERE e.shipment_id=s.id AND e.event_type=s.status),s.created_at) status_at
    FROM shipment_details s JOIN vehicles v ON v.id=s.vehicle_id JOIN facilities f ON f.id=s.source_id JOIN facilities t ON t.id=s.destination_id
    JOIN schemes sc ON sc.id=s.scheme_id JOIN commodities co ON co.id=s.commodity_id LEFT JOIN vehicle_types vt ON vt.id=s.vehicle_type_id
    LEFT JOIN tbl_district_master dd ON dd.id=t.district_id LEFT JOIN cmr_receipts r ON r.shipment_id=s.id
    WHERE 1=1${sql} ORDER BY s.id DESC LIMIT ${limit} OFFSET ${offset}`, args);
}
export async function getShipmentListShipmentEvents(s) {
  return rows(pool, 'SELECT id,shipment_id,event_type,occurred_at,detail,created_at FROM shipment_events WHERE shipment_id=? ORDER BY occurred_at,id', [s.id]);
}
export async function getShipmentListShipmentLots(s) {
  return rows(pool, `SELECT l.shipment_id,l.procurement_id,l.quantity_g,p.external_ref,p.farmer_id,p.receipt_no FROM shipment_lots l JOIN procurement p ON p.id=l.procurement_id WHERE shipment_id=?`, [s.id]);
}

