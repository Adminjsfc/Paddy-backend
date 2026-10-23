import * as repository from "../repositories/masters.repository.js";
import { ensure, grams, millerAccess, vehicleAccess, pageParams } from "../utils/core.js";
import { readSelectedStore } from "./store-locations.service.js";
export async function ensureLocation(connection, districtId, blockId) {
  await repository.ensureLocationFindTblDistrictMaster(connection, districtId);
  await repository.ensureLocationFindTblBlockMaster(connection, blockId, districtId);
}
export async function createMaster(connection, type, d, user) {
  let table = type.replaceAll('-', '_'),
    data = {
      ...d
    };
  if (type === 'imeis') {
    await ensureLocation(connection, d.district_id, d.block_id);
    data.mapping_status = null;
    data.status_updated_at = null;
  }
  if (type === 'facilities') {
    data.created_by_core_user_id = user.core_user_id ?? null;
    data.created_by_user_type = user.core_user_type ?? null;
    await ensureLocation(connection, d.district_id, d.block_id);
    data.capacity_g = grams(d.capacity);
    delete data.capacity;
    data.milling_capacity_g_per_day = d.milling_capacity_per_day ? grams(d.milling_capacity_per_day) : null;
    delete data.milling_capacity_per_day;
  }
  if (type === 'farmers' || type === 'transporters') await ensureLocation(connection, d.district_id, d.block_id);
  if (type === 'transporters') {
    millerAccess(user, d.miller_id);
    await repository.createMasterFindFacilities(connection, d);
  }
  if (type === 'vehicles') {
    data.mapping_status = null;
    data.status_updated_at = null;
    if (d.transporter_id) {
      const t = await repository.createMasterFindTransporters(connection, d);
      ensure(!d.miller_id || d.miller_id === t.miller_id, 'Transporter and miller do not match', 'VALIDATION', 400);
      data.miller_id = t.miller_id;
    } else data.transporter_id = null;
    await repository.createMasterFindFacilities2(connection, data);
    vehicleAccess(user, {
      transporter_id: data.transporter_id,
      miller_id: data.miller_id
    });
    data.capacity_g = grams(d.capacity);
    delete data.capacity;
    await repository.createMasterFindVehicleTypes(connection, d);
  }
  if (type === 'gps-devices') {
    await ensureLocation(connection, d.district_id, d.block_id);
    await repository.findActiveImei(connection, d.imei_id);
    const v = await repository.createMasterFindVehicles(connection, d);
    vehicleAccess(user, v);
  }
  if (type === 'route-tags') {
    const a = await repository.createMasterFindFacilities3(connection, d);
    const b = await repository.createMasterFindFacilities4(connection, d);
    await repository.createMasterFindSeasons(connection, d);
    data.created_by = user.id ?? null;
    ensure(['PACS', 'LAMPS'].includes(a.kind) && b.kind === 'MILLER' || a.kind === 'MILLER' && ['SFC_GODOWN', 'FCI'].includes(b.kind), 'Tag must be PACS/LAMPS → MILLER or MILLER → SFC_GODOWN/FCI', 'INVALID_ROUTE', 400);
  }
  if (type === 'seasons') {
    const existing = await repository.createSeasonFindByCode(connection, data.code);
    if (existing && !existing.active) {
      const update = {
        ...data,
        active: true,
        updated_by: user.id ?? null,
        updated_at: new Date()
      };
      await repository.updateSeasonUpdateSeasons(connection, update, existing);
      return { id: existing.id, ...update };
    }
  }
  data.created_by = user.id ?? null;
  const id = await repository.createMasterInsertRecord(connection, table, data);
  if (type === 'gps-devices') await repository.updateDeviceMappingState(connection, d.imei_id, true, d);
  return {
    id,
    ...data
  };
}
export function visibility(type, u) {
  if (['ADMIN', 'OPERATOR'].includes(u.role) || ['seasons', 'schemes', 'commodities'].includes(type)) return {
    sql: '',
    args: []
  };
  if (type === 'imeis') {
    ensure(false, 'IMEI master is restricted to SFC operators', 'FORBIDDEN', 403);
  }
  if (type === 'vehicle-types') {
    ensure(false, 'Vehicle type master is restricted to SFC operators', 'FORBIDDEN', 403);
  }
  if (type === 'farmers') {
    ensure(false, 'Farmer details are restricted to SFC operators', 'FORBIDDEN', 403);
  }
  if (type === 'facilities') return {
    sql: ' AND (x.id=? OR x.id IN (SELECT source_id FROM route_tags WHERE destination_id=?) OR x.id IN (SELECT destination_id FROM route_tags WHERE source_id=?))',
    args: [u.miller_id, u.miller_id, u.miller_id]
  };
  if (type === 'route-tags') return {
    sql: ' AND (x.source_id=? OR x.destination_id=?)',
    args: [u.miller_id, u.miller_id]
  };
  if (type === 'transporters') return u.role === 'MILLER' ? {
    sql: ' AND x.miller_id=?',
    args: [u.miller_id]
  } : {
    sql: ' AND x.id=?',
    args: [u.transporter_id]
  };
  const clause = u.role === 'MILLER' ? 't.miller_id=?' : 't.id=?',
    arg = u.role === 'MILLER' ? u.miller_id : u.transporter_id;
  if (type === 'vehicles') return u.role === 'MILLER' ? {
    sql: ' AND x.miller_id=?',
    args: [u.miller_id]
  } : {
    sql: ` AND x.transporter_id IN (SELECT t.id FROM transporters t WHERE ${clause})`,
    args: [arg]
  };
  return u.role === 'MILLER' ? {
    sql: ' AND x.vehicle_id IN (SELECT id FROM vehicles WHERE miller_id=?)',
    args: [u.miller_id]
  } : {
    sql: ` AND x.vehicle_id IN (SELECT v.id FROM vehicles v JOIN transporters t ON t.id=v.transporter_id WHERE ${clause})`,
    args: [arg]
  };
}
export async function listRouteTagAssignmentOptions(context) {
  const effects = {
    headers: []
  };
  const [seasons, sources, millers] = await Promise.all([repository.listRouteTagAssignmentOptionsListSeasons(), repository.listRouteTagAssignmentOptionsListFacilities(), repository.listRouteTagAssignmentOptionsListFacilities2()]);
  return {
    body: {
      ok: true,
      data: {
        seasons,
        sources,
        millers
      }
    },
    status: 200,
    ...effects
  };
}
export async function listLocationOptions(context) {
  const effects = {
    headers: []
  };
  const districts = await repository.listLocationOptionsListTblDistrictMaster();
  const districtId = context.query.district_id ? Number(context.query.district_id) : null;
  const blocks = districtId ? await repository.listLocationOptionsListTblBlockMaster(districtId) : [];
  return {
    body: {
      ok: true,
      data: {
        districts,
        blocks
      }
    },
    status: 200,
    ...effects
  };
}
export function createMasterRecord(connection, data, context, config, type) {
  return createMaster(connection, type, data, context.user);
}
export async function listMasterRecords(context, type, table) {
  const effects = {
    headers: []
  };
  const {
    page,
    limit,
    offset
  } = pageParams(context.query);
  const v = visibility(type, context.user);
  let sql = v.sql;
  const args = [...v.args];
  if (type === 'route-tags') {
    for (const field of ['season_id', 'source_id', 'destination_id']) if (context.query[field]) {
      sql += ` AND x.${field}=?`;
      args.push(String(context.query[field]));
    }
    if (context.query.active !== undefined) {
      ensure(['true', 'false'].includes(String(context.query.active)), 'active must be true or false', 'VALIDATION', 400);
      sql += ' AND x.active=?';
      args.push(context.query.active === 'true');
    } else {
      sql += ' AND x.active=?';
      args.push(true);
    }
    const base = `FROM route_tags x JOIN seasons se ON se.id=x.season_id JOIN facilities source ON source.id=x.source_id JOIN facilities destination ON destination.id=x.destination_id LEFT JOIN tbl_district_master source_district ON source_district.id=source.district_id LEFT JOIN tbl_district_master destination_district ON destination_district.id=destination.district_id LEFT JOIN users creator ON creator.id=x.created_by LEFT JOIN users unassigner ON unassigner.id=x.unassigned_by WHERE 1=1${sql}`;
    const count = await repository.listMasterRecordsCountRecords(base, args);
    const data = await repository.listMasterRecordsListRecords(base, limit, offset, args);
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
  if (context.query.code) {
    sql += ' AND x.code=?';
    ensure(['seasons', 'facilities', 'farmers', 'transporters', 'vehicle-types', 'schemes', 'commodities'].includes(type), 'code filter unsupported', 'VALIDATION', 400);
    args.push(String(context.query.code));
  }
  if (type === 'imeis' && context.query.imei) {
    sql += ' AND x.imei=?';
    args.push(String(context.query.imei));
  }
  if (type === 'gps-devices') {
    for (const field of ['imei_id', 'vehicle_id', 'district_id', 'block_id']) {
      if (context.query[field] !== undefined) {
        const value = Number(context.query[field]);
        ensure(Number.isSafeInteger(value) && value > 0, `${field} must be a positive ID`, 'VALIDATION', 400);
        sql += ` AND x.${field}=?`;
        args.push(value);
      }
    }
  }
  if (type === 'facilities' && context.query.kind) {
    sql += ' AND x.kind=?';
    args.push(String(context.query.kind));
  }
  if (context.query.active !== undefined) {
    ensure(['true', 'false'].includes(String(context.query.active)), 'active must be true or false', 'VALIDATION', 400);
    sql += ' AND x.active=?';
    args.push(context.query.active === 'true');
  } else {
    sql += ' AND x.active=?';
    args.push(true);
  }
  const count = await repository.listMasterRecordsCountX(table, sql, args);
  const data = await repository.listMasterRecordsListX(table, sql, limit, offset, args);
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
export async function getMasterRecord(context, type, table) {
  const effects = {
    headers: []
  };
  const v = visibility(type, context.user);
  const data = await repository.getMasterRecordFindX(table, v, context);
  return {
    body: {
      ok: true,
      data
    },
    status: 200,
    ...effects
  };
}
export async function updateFacility(connection, data, context) {
  const f = await repository.updateFacilityFindFacilities(connection, context);
  const update = {
    ...data
  };
  if (data.capacity) {
    update.capacity_g = grams(data.capacity);
    delete update.capacity;
    const s = await repository.updateFacilityFindStocks(connection, f);
    ensure(update.capacity_g >= s.total, 'Capacity is less than current stock');
  }
  if ('milling_capacity_per_day' in data) {
    update.milling_capacity_g_per_day = data.milling_capacity_per_day ? grams(data.milling_capacity_per_day) : null;
    delete update.milling_capacity_per_day;
  }
  if ('district_id' in data || 'block_id' in data) await ensureLocation(connection, update.district_id ?? f.district_id, update.block_id ?? f.block_id);
  const coreStoreId = update.core_store_id === undefined ? f.core_store_id : update.core_store_id;
  if (coreStoreId != null) {
    ensure(['FCI', 'SFC_GODOWN'].includes(f.kind), 'Only receiving stores can link to a core store', 'INVALID_STORE', 400);
    await readSelectedStore(coreStoreId, update.district_id ?? f.district_id, f.kind === 'FCI' ? 'CCMR' : 'SCMR');
  }
  ensure(f.kind === 'MILLER' || !update.recovery_percent && !update.milling_capacity_g_per_day, 'Milling settings only apply to millers', 'VALIDATION', 400);
  update.updated_by = context.user.id ?? null;
  update.updated_at = new Date();
  await repository.updateFacilityUpdateFacilities(connection, update, f);
  return {
    id: f.id,
    ...update
  };
}
export async function updateSeason(connection, data, context) {
  const s = await repository.updateSeasonFindSeasons(connection, context),
    update = {
      ...data,
      updated_by: context.user.id ?? null,
      updated_at: new Date()
    };
  await repository.updateSeasonUpdateSeasons(connection, update, s);
  return {
    id: s.id,
    ...update
  };
}
export async function setFacilityOrSeasonStatus(connection, data, context, type) {
  const table = type;
  const record = await repository.setFacilityOrSeasonStatusFindWHERE(connection, table, context);
  await repository.setFacilityOrSeasonStatusUpdateSET(connection, table, data, context, record);
  return {
    id: record.id,
    ...data
  };
}
export async function setMasterStatus(connection, data, context, type) {
  const v = visibility(type, context.user),
    table = type.replaceAll('-', '_');
  const r = await repository.setMasterStatusFindX(connection, table, v, context);
  if (type === 'gps-devices' && data.active) await repository.findActiveImei(connection, r.imei_id);
  if (type === 'imeis' && !data.active) {
    const linked = await repository.findActiveImeiDevice(connection, r.id);
    ensure(!linked, 'Deactivate the linked GPS device before deleting this IMEI', 'IMEI_IN_USE', 409);
  }
  if (!data.active && ['vehicles', 'gps-devices', 'transporters'].includes(type)) {
    const filter = type === 'transporters' ? 'vehicle_id IN (SELECT id FROM vehicles WHERE transporter_id=?)' : 'vehicle_id=?';
    const active = await repository.setMasterStatusCountShipments(connection, filter, type, r);
    ensure(active.n === 0, 'Finish or cancel active shipments before deactivating this transport record');
  }
  if (type === 'route-tags') {
    const unassignedAt = data.active ? null : new Date(),
      unassignedBy = data.active ? null : context.user.id ?? null;
    await repository.setMasterStatusUpdateRouteTags(connection, data, unassignedBy, unassignedAt, r);
    return {
      id: r.id,
      ...data,
      unassigned_by: unassignedBy,
      unassigned_at: unassignedAt?.toISOString() ?? null
    };
  }
  await repository.setMasterStatusUpdateSET(connection, table, data, context, r);
  if (type === 'gps-devices') await repository.updateDeviceMappingState(connection, r.imei_id, data.active, r);
  return {
    id: r.id,
    ...data
  };
}
export function importMasterRecord(connection, data, context, type) {
  return createMaster(connection, type, data, context.user);
}
export async function updateMasterProfile(connection, data, context, schema, type) {
  const v = visibility(type, context.user),
    table = type.replaceAll('-', '_');
  const record = await repository.updateMasterProfileFindX(connection, table, v, context);
  const update = {
    ...data
  };
  if (data.capacity) {
    update.capacity_g = grams(data.capacity);
    delete update.capacity;
    const s = await repository.updateMasterProfileFindShipments(connection, record);
    ensure(!s.max_load || update.capacity_g >= s.max_load, 'Capacity is below active shipment load');
  }
  if (type === 'vehicles' && data.vehicle_type_id) await repository.updateMasterProfileFindVehicleTypes(connection, data);
  if ('district_id' in data || 'block_id' in data) await ensureLocation(connection, update.district_id ?? record.district_id, update.block_id ?? record.block_id);
  update.updated_by = context.user.id ?? null;
  update.updated_at = new Date();
  await repository.updateMasterProfileUpdateSET(connection, table, update, record);
  if (['imeis', 'gps-devices'].includes(type) && ('district_id' in data || 'block_id' in data)) {
    await repository.syncImeiLocation(connection, type === 'imeis' ? record.id : record.imei_id, {
      district_id: update.district_id ?? record.district_id,
      block_id: update.block_id ?? record.block_id
    });
  }
  return {
    id: record.id,
    ...update
  };
}
