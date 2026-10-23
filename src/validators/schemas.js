import { z } from 'zod';
import { id, code, name, phone, percent, quantity, dateOnly, pastTimestamp, timestamp } from "../utils/core.js";
const nullable = v => v.nullable().default(null);
export const schemeMaster = z.object({
  code,
  scheme_name: name,
  description: nullable(z.string().trim().max(500))
}).strict();
export const commodityMaster = z.object({
  code,
  commodity_name: name,
  description: nullable(z.string().trim().max(500))
}).strict();
export const empty = z.object({}).strict();
export const season = z.object({
  code,
  name,
  start_date: dateOnly,
  end_date: dateOnly,
  recovery_percent: percent.default(68)
}).strict().refine(v => v.end_date >= v.start_date, 'End date must follow start date');
export const facility = z.object({
  code,
  kind: z.enum(['PACS', 'LAMPS', 'MILLER', 'SFC_GODOWN', 'FCI']),
  name,
  address: z.string().min(1).max(500),
  district_id: id,
  block_id: id,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radius_m: z.number().int().min(10).max(10000).default(200),
  capacity: quantity,
  milling_capacity_per_day: nullable(quantity),
  recovery_percent: nullable(percent),
  contact_name: nullable(name),
  phone: nullable(phone)
}).strict().refine(v => v.kind === 'MILLER' || v.recovery_percent === null && v.milling_capacity_per_day === null, 'Milling settings are only for MILLER facilities');
export const farmer = z.object({
  code,
  name,
  phone: nullable(phone),
  village: name,
  district_id: id,
  block_id: id
}).strict();
export const transporter = z.object({
  miller_id: id,
  code,
  name,
  contact_name: name,
  phone,
  address: z.string().min(1).max(500),
  district_id: id,
  block_id: id
}).strict();
export const vehicleType = z.object({
  code,
  name
}).strict();
export const vehicle = z.object({
  transporter_id: id.nullable().optional(),
  miller_id: id.optional(),
  vehicle_type_id: id,
  registration_no: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{5,20}$/),
  capacity: quantity
}).strict().refine(value => Boolean(value.miller_id || value.transporter_id), 'Miller is required for direct vehicle registration');
export const imeiMaster = z.object({
  imei: z.string().regex(/^\d{10,20}$/),
  provider: z.string().trim().min(1).max(120),
  district_id: id,
  block_id: id
}).strict();
export const device = z.object({
  vehicle_id: id,
  imei_id: id,
  district_id: id,
  block_id: id,
  model: nullable(z.string().max(100)),
  sim_no: nullable(z.string().regex(/^\+?\d{10,22}$/))
}).strict();
export const tag = z.object({
  season_id: id,
  source_id: id,
  destination_id: id
}).strict();
export const procurement = z.object({
  scheme_code: code,
  commodity_code: z.literal('PADDY'),
  external_ref: z.string().min(1).max(120),
  season_code: code,
  farmer_code: code.optional(),
  facility_code: code,
  procured_at: pastTimestamp,
  quantity,
  moisture_percent: nullable(z.number().min(0).max(100)),
  receipt_no: z.string().min(1).max(100)
}).strict();
export const cmrOrder = z.object({
  scheme_code: code,
  commodity_code: z.literal('RICE'),
  external_ref: z.string().min(1).max(120),
  season_code: code,
  miller_code: code,
  destination_code: code,
  order_no: z.string().min(1).max(100),
  ordered_at: pastTimestamp,
  due_date: dateOnly,
  rice_quantity: quantity
}).strict();
export const procurementBatch = z.object({
  records: z.array(procurement).min(1).max(100)
}).strict();
export const procurementPatch = z.object({
  external_ref: z.string().trim().min(1).max(120).optional(),
  quantity: quantity.optional(),
  reason: z.string().trim().min(3).max(500)
}).strict().refine(value=>value.external_ref!==undefined||value.quantity!==undefined,'Provide external_ref or quantity to update');
export const orderBatch = z.object({
  records: z.array(cmrOrder).min(1).max(100)
}).strict();
export const milling = z.object({
  scheme_code: code,
  miller_id: id,
  season_id: id,
  batch_no: z.string().min(1).max(100),
  paddy_quantity: quantity,
  rice_quantity: quantity.optional(),
  milled_at: pastTimestamp,
  remarks: nullable(z.string().max(500))
}).strict();
export const shipment = z.object({
  scheme_code: code,
  shipment_no: z.string().min(1).max(100),
  leg: z.enum(['PADDY', 'CMR']),
  season_id: id,
  miller_id: id,
  source_id: id,
  destination_id: id,
  vehicle_id: id,
  order_id: nullable(id),
  driver_name: nullable(name),
  driver_phone: nullable(phone),
  expected_completion_at: nullable(timestamp),
  quantity,
  lots: z.array(z.object({
    procurement_id: id,
    quantity
  }).strict()).max(100).default([]),
  remarks: nullable(z.string().max(500))
}).strict().refine(value=>(value.driver_name===null)===(value.driver_phone===null),{
  message:'driver_name and driver_phone must be supplied together',path:['driver_phone']
});
export const dispatch = z.object({
  dispatched_at: pastTimestamp,
  expected_completion_at: timestamp.nullable().optional(),
  receipt_no: z.string().min(1).max(100),
  driver_name: name.optional(),
  driver_phone: phone.optional()
}).strict();
export const delivery = z.object({
  delivered_at: pastTimestamp,
  accepted_quantity: quantity,
  receipt_no: z.string().min(1).max(100),
  remarks: nullable(z.string().max(500)),
  gps_override_reason: nullable(z.string().min(10).max(500))
}).strict();
export const reason = z.object({
  reason: z.string().min(10).max(500)
}).strict();
export const gps = z.object({
  imei: z.string().regex(/^\d{10,20}$/),
  gps_at: timestamp,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speed_kph: z.number().min(0).max(300).default(0),
  gps_fix: z.literal(true),
  packet_type: z.string().min(1).max(20).default('PVT'),
  raw: z.record(z.string(), z.unknown()).default({})
}).strict();
export const gpsBatch = z.object({
  packets: z.array(gps).min(1).max(500)
}).strict();
export const user = z.object({
  name,
  email: z.email().max(190).transform(v => v.toLowerCase()),
  password: z.string().min(12).max(128),
  role: z.enum(['ADMIN', 'OPERATOR', 'PACS', 'LAMPS', 'MILLER', 'TRANSPORTER']),
  miller_id: nullable(id),
  transporter_id: nullable(id),
  facility_id: nullable(id)
}).strict();
export const login = z.object({
  email: z.email().max(190).transform(v => v.toLowerCase()),
  password: z.string().max(128)
}).strict();
export const passwordChange = z.object({
  current_password: z.string().max(128),
  new_password: z.string().min(12).max(128)
}).strict();
export const facilityPatch = z.object({
  name: name.optional(),
  address: z.string().min(1).max(500).optional(),
  district_id: id.optional(),
  block_id: id.optional(),
  core_store_id: id.nullable().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radius_m: z.number().int().min(10).max(10000).optional(),
  capacity: quantity.optional(),
  milling_capacity_per_day: quantity.nullable().optional(),
  recovery_percent: percent.nullable().optional(),
  contact_name: name.nullable().optional(),
  phone: phone.nullable().optional(),
  active: z.boolean().optional()
}).strict().refine(v => Object.keys(v).length > 0, 'At least one field required');
export const activePatch = z.object({
  active: z.boolean()
}).strict();
export const seasonPatch = z.object({
  name: name.optional(),
  recovery_percent: percent.optional()
}).strict().refine(v => Object.keys(v).length > 0, 'At least one field required');
export const orderPatch = z.object({
  rice_quantity: quantity.optional(),
  due_date: dateOnly.optional(),
  reason: z.string().min(10).max(500)
}).strict();
