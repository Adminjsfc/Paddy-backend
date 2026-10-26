import * as repository from "../repositories/gps.repository.js";
import { event } from "../repositories/events.repository.js";
import { transaction } from "../utils/transaction.js";
import { ensure, gpsTransition, pageParams, vehicleAccess } from "../utils/core.js";
import * as S from "../validators/schemas.js";
export async function ingestPacket(connection, p, binding = null) {
  ensure(p.gps_at.getTime() <= Date.now() + Number(process.env.GPS_MAX_FUTURE_SECONDS || 120) * 1000, 'GPS timestamp is in the future', 'FUTURE_GPS', 400);
  const d = await repository.ingestPacketFindGpsDevices(connection, p);
  if(binding)ensure(Number(d.vehicle_id)===Number(binding.vehicleId),'GPS device no longer belongs to the journaled vehicle','TRIP_BINDING_CHANGED',409);
  const exists = await repository.ingestPacketFindGpsPackets(connection, d, p);
  if (exists) {
    ensure(Number(exists.latitude) === Number(p.latitude.toFixed(7)) && Number(exists.longitude) === Number(p.longitude.toFixed(7)), 'Different GPS coordinates for the same device and timestamp', 'GPS_TIMESTAMP_CONFLICT');
    return {
      imei: p.imei,
      gps_at: p.gps_at,
      result: 'DUPLICATE'
    };
  }
  const s = binding ? await repository.ingestPacketFindBoundShipment(connection,d,binding.shipmentId) : await repository.ingestPacketFindShipments(connection, d);
  const change = s ? gpsTransition(s, p) : null;
  const result = s ? change ? 'PROCESSED' : 'OLDER_THAN_TRIP_WATERMARK' : 'NO_ACTIVE_SHIPMENT';
  await repository.ingestPacketInsertGpsPackets(connection, d, p, result);
  if (!d.last_gps_at || p.gps_at > new Date(d.last_gps_at)) await repository.ingestPacketUpdateGpsDevices(connection, p, d);
  if (change) {
    await repository.ingestPacketUpdateShipments(connection, change, p, s);
    for (const type of change.events) await event(connection, s.id, type, p.gps_at, {
      latitude: p.latitude,
      longitude: p.longitude,
      imei: p.imei
    });
  }
  return {
    imei: p.imei,
    gps_at: p.gps_at,
    result,
    shipment_id: s?.id || null,
    status: change?.status || s?.status || null,
    trip_status: change?.trip_status ?? s?.trip_status ?? null,
    trip_started_at: change?.trip_started_at ?? s?.trip_started_at ?? null,
    trip_completed_at: change?.trip_completed_at ?? s?.trip_completed_at ?? null
  };
}
export async function ingestBatch(input) {
  const {
    packets
  } = S.gpsBatch.parse(input);
  const results = [];
  // Individual packet transactions: invalid/unknown device cannot discard valid packets.
  for (const p of packets.sort((a, b) => a.gps_at - b.gps_at)) {
    try {
      results.push(await transaction(connection => ingestPacket(connection, p)));
    } catch (e) {
      if (!e.status) throw e;
      results.push({
        imei: p.imei,
        gps_at: p.gps_at,
        result: 'ERROR',
        code: e.code,
        message: e.message
      });
    }
  }
  return results;
}
export function normalizeMqtt(input) {
  ensure(input && typeof input === 'object' && !Array.isArray(input), 'MQTT payload must be an object', 'INVALID_GPS', 400);
  let gpsAt = input.gps_at;
  if (!gpsAt && input.gps_timestamp) {
    const date = new Date(Number(input.gps_timestamp));
    ensure(Number.isFinite(date.getTime()), 'Invalid GPS epoch milliseconds', 'INVALID_GPS', 400);
    gpsAt = date.toISOString();
  }
  if (!gpsAt && input.date_time) {
    ensure(typeof input.date_time === 'string', 'date_time must be a UTC string', 'INVALID_GPS', 400);
    gpsAt = /[Zz]|[+-]\d\d:\d\d$/.test(input.date_time) ? input.date_time : input.date_time.replace(' ', 'T') + 'Z';
  }
  return S.gps.parse({
    imei: String(input.imei ?? input.imei_no ?? ''),
    gps_at: gpsAt,
    latitude: Number(input.latitude),
    longitude: Number(input.longitude),
    speed_kph: Number(input.speed_kph ?? input.speed ?? 0),
    gps_fix: input.gps_fix === true || input.gps_fix === 1 || input.gps_fix === '1',
    packet_type: String(input.packet_header ?? input.packet_type ?? 'PVT'),
    raw: input
  });
}
export async function receivePackets(context) {
  const effects = {
    headers: []
  };
  const results = await ingestBatch(context.body);
  const failed = results.filter(r => r.result === 'ERROR').length;
  return {
    body: {
      ok: failed === 0,
      data: {
        processed: results.length - failed,
        failed,
        results
      }
    },
    status: failed ? 207 : 200,
    ...effects
  };
}
export async function getVehicleLocation(context) {
  const effects = {
    headers: []
  };
  const v = await repository.getVehicleLocationFindVehicles(context);
  vehicleAccess(context.user, v);
  const data = await repository.getVehicleLocationFindGpsDevices(v);
  data.stale = !data.last_gps_at || Date.now() - new Date(data.last_gps_at).getTime() > Number(process.env.GPS_STALE_MINUTES || 15) * 60000;
  return {
    body: {
      ok: true,
      data
    },
    status: 200,
    ...effects
  };
}
export async function getVehicleHistory(context) {
  const effects = {
    headers: []
  };
  const v = await repository.getVehicleHistoryFindVehicles(context);
  vehicleAccess(context.user, v);
  const from = S.gps.shape.gps_at.parse(context.query.from),
    to = S.gps.shape.gps_at.parse(context.query.to);
  ensure(to > from && to - from <= 7 * 86400000, 'History window must be positive and at most 7 days', 'VALIDATION', 400);
  const {
    page,
    limit,
    offset
  } = pageParams(context.query);
  const filter = 'FROM gps_packets p JOIN gps_devices d ON d.id=p.device_id WHERE d.vehicle_id=? AND p.gps_at>=? AND p.gps_at<?';
  const args = [v.id, from, to];
  const count = await repository.getVehicleHistoryCountRecords(filter, args);
  return {
    body: {
      ok: true,
      data: await repository.getVehicleHistoryListRecords(filter, limit, offset, args),
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
