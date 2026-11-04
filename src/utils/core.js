import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import { secondPrecision } from './datetime.js';
export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function ensure(ok, message, code = 'BUSINESS_RULE', status = 409) {
  if (!ok) throw new AppError(status, code, message);
}
export const id = z.number().int().positive().max(4294967295);
export const code = z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_.:/-]+$/, 'Use a registered code without spaces, asterisks (*) or unresolved {{variables}}');
export const name = z.string().trim().min(1).max(150);
export const phone = z.string().trim().regex(/^\+?[0-9]{10,15}$/);
export const percent = z.number().positive().max(100).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-7, 'At most two decimal places');
export const dateOnly = z.iso.date();
// All API timestamps require an explicit offset; normalize before database use.
export const timestamp = z.iso.datetime({
  offset: true
}).transform(v => secondPrecision(new Date(v)));
export const pastTimestamp = timestamp.refine(v => v.getTime() <= Date.now() + 120000, 'Timestamp cannot be in the future');
export const quantity = z.object({
  value: z.union([z.string().regex(/^\d+(\.\d{1,3})?$/), z.number().nonnegative()]),
  unit: z.enum(['KG', 'QTL', 'MT']).default('KG')
}).strict();
export function grams(q, allowZero = false) {
  const text = String(q.value);
  ensure(/^\d+(\.\d{1,3})?$/.test(text), 'Quantity must have at most 3 decimal places', 'INVALID_QUANTITY', 400);
  const [a, b = ''] = text.split('.');
  const scaled = BigInt(a) * 1000n + BigInt(b.padEnd(3, '0'));
  const n = scaled * ({
    KG: 1n,
    QTL: 100n,
    MT: 1000n
  }[q.unit] ?? 0n);
  ensure(n < 1000000000000000n && (allowZero ? n >= 0 : n > 0), 'Quantity is outside allowed range', 'INVALID_QUANTITY', 400);
  return Number(n);
}
export const recoveryGrams = (g, p) => Number((BigInt(g) * BigInt(Math.round(Number(p) * 100)) + 5000n) / 10000n);
export const kg = g => Number((Number(g) / 1000).toFixed(3));
// Gram integers are used only for exact arithmetic; database/API weights are kg.
export const kilograms = (q, allowZero = false) => grams({ ...q, unit: q.unit ?? 'KG' }, allowZero) / 1000;
export const roundKg = value => Math.round(Number(value) * 1000) / 1000;
export const addKg = (...values) => values.reduce((sum, value) => sum + Math.round(Number(value) * 1000), 0) / 1000;
export const recoveryKg = (value, percent) => recoveryGrams(Math.round(Number(value) * 1000), percent) / 1000;
export const capacityKg = (record, daily = false) => {
  const amount = capacityGrams(record, daily);
  return amount == null ? null : amount / 1000;
};
export function capacityFields(quantity, daily = false) {
  if (quantity) grams(quantity);
  return {
    [daily ? 'milling_capacity_value_per_day' : 'capacity_value']: quantity ? Number(quantity.value) : null,
    [daily ? 'milling_capacity_unit' : 'capacity_unit']: quantity?.unit ?? null
  };
}
export function capacityGrams(record, daily = false) {
  const value = record[daily ? 'milling_capacity_value_per_day' : 'capacity_value'];
  const unit = record[daily ? 'milling_capacity_unit' : 'capacity_unit'];
  if (value == null) return null;
  const factor = {KG: 1000, QTL: 100000, MT: 1000000}[unit];
  const result = Math.round(Number(value) * factor);
  ensure(Number.isSafeInteger(result) && result >= 0, 'Invalid stored capacity', 'INVALID_CAPACITY', 500);
  return result;
}
export function canonical(v) {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])]));
  return v;
}
export const hash = v => crypto.createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(canonical(v))).digest('hex');
const scrypt = promisify(crypto.scrypt);
export async function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt:${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  const [algo, salt, key] = encoded.split(':');
  if (algo !== 'scrypt' || !salt || !key) return false;
  const actual = await scrypt(password, salt, 64);
  const expected = Buffer.from(key, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
export const token = () => crypto.randomBytes(32).toString('hex');
export const actor = u => u?.id ? `user:${u.id}` : u?.actor || 'system';
export function millerAccess(user, millerId) {
  ensure(['ADMIN', 'OPERATOR', 'INTEGRATION', 'GPS'].includes(user.role) || user.miller_id === Number(millerId), 'Miller access denied', 'FORBIDDEN', 403);
}
export function vehicleAccess(user, vehicle) {
  ensure(vehicle, 'Vehicle not found', 'NOT_FOUND',404);
  ensure(['ADMIN','OPERATOR','MILLER','PACS','LAMPS','TRANSPORTER','CORE_DM'].includes(user.role), 'Vehicle access denied','FORBIDDEN',403);
  if (user.role === 'CORE_DM') ensure(user.district_ids?.includes(Number(vehicle.district_id)), 'District is outside your DM assignment','DISTRICT_FORBIDDEN',403);
}
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const r = v => v * Math.PI / 180;
  const p1 = r(Number(lat1)),
    p2 = r(Number(lat2));
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(r(Number(lng2) - Number(lng1)) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}
export function gpsTransition(s, p) {
  if (!s.dispatched_at || p.gps_at <= new Date(s.dispatched_at) || s.last_gps_at && p.gps_at <= new Date(s.last_gps_at)) return null;
  if (!['DISPATCHED', 'IN_TRANSIT', 'ARRIVED'].includes(s.status)) return null;
  const source = distanceMeters(p.latitude, p.longitude, s.source_lat, s.source_lng) <= s.source_radius_m ? 'IN' : 'OUT';
  const destination = distanceMeters(p.latitude, p.longitude, s.destination_lat, s.destination_lng) <= s.destination_radius_m ? 'IN' : 'OUT';
  let status = s.status;
  const events = [];
  if (source !== s.source_geofence) events.push(`SOURCE_${source}`);
  if (destination !== s.destination_geofence) events.push(`DESTINATION_${destination}`);
  if (status === 'DISPATCHED' && source === 'OUT') {
    status = 'IN_TRANSIT';
    events.push('DEPARTED');
  }
  if (status === 'IN_TRANSIT' && destination === 'IN') {
    status = 'ARRIVED';
    events.push('ARRIVED');
  }
  return {
    status,
    trip_status: Math.max(s.trip_status || 0, status==='ARRIVED'?2:status==='IN_TRANSIT'?1:0),
    trip_started_at: s.trip_started_at || (events.includes('DEPARTED') ? p.gps_at : null),
    trip_completed_at: s.trip_completed_at || (events.includes('ARRIVED') ? p.gps_at : null),
    source,
    destination,
    events
  };
}
export function pageParams(q) {
  const page = z.coerce.number().int().positive().max(100000).default(1).parse(q.page);
  const limit = z.coerce.number().int().positive().max(200).default(50).parse(q.limit);
  return {
    page,
    limit,
    offset: (page - 1) * limit
  };
}
export function scopedWhere(user, alias = 's') {
  if (user.role === 'DRIVER') return {sql:` AND ${alias}.driver_user_id=?`,params:[user.id]};
  if(['PACS','LAMPS'].includes(user.role)) {
    ensure(user.facility_id,'PACS/LAMPS facility is required','FORBIDDEN',403);
    return {sql:` AND ${alias}.leg='PADDY' AND EXISTS (SELECT 1 FROM shipment_routes scope_route WHERE scope_route.id=${alias}.route_id AND scope_route.source_id=?)`,params:[user.facility_id]};
  }
  if (user.role === 'MILLER') return {
    sql: ` AND ${alias}.miller_id=?`,
    params: [user.miller_id]
  };
  if (user.role === 'TRANSPORTER') return {
    sql: ` AND ${alias}.vehicle_id IN (SELECT id FROM vehicles WHERE created_by=?)`,
    params: [user.id]
  };
  return {
    sql: '',
    params: []
  };
}
