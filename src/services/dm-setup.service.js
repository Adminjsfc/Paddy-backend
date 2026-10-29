import { storeFacilityData } from '../utils/store-facility.js';
import {requireStockMasters} from '../repositories/stock-masters.repository.js';
import * as repository from "../repositories/dm-setup.repository.js";
import crypto from 'node:crypto';
import { stock } from "./stock.service.js";
import { lockFacilities } from "../repositories/facilities.repository.js";
import { ensure, grams, passwordHash } from "../utils/core.js";
import { createMaster } from "./masters.service.js";
import * as S from "../validators/schemas.js";
export async function scopedDMFacility(connection, user, facilityId, kind) {
  const facility = await repository.scopedDMFacilityFindFacilities(connection, facilityId);
  ensure(user.district_ids.includes(Number(facility.district_id)), 'Facility is outside your DM districts', 'DISTRICT_FORBIDDEN', 403);
  const kinds = {
    MILLER: ['MILLER'],
    STORE: ['FCI', 'SFC_GODOWN'],
    PADDY: ['PACS', 'LAMPS']
  };
  ensure(kinds[kind]?.includes(facility.kind), 'Invalid facility kind', 'VALIDATION', 400);
  return facility;
}
export async function listPaddyOptions(context) {
  const effects = {
    headers: []
  };
  const ids = context.user.district_ids,
    marks = ids.map(() => '?').join(',');
  const sources = await repository.listPaddyOptionsListFacilities(marks, ids);
  const millers = await repository.listPaddyOptionsListFacilities2(marks, ids);
  const seasons = await repository.listPaddyOptionsListSeasons();
  const assignments = await repository.listPaddyOptionsListRouteTags(marks, ids);
  return {
    body: {
      ok: true,
      data: {
        sources,
        millers,
        seasons,
        assignments
      }
    },
    status: 200,
    ...effects
  };
}
export async function createPaddyFacility(connection, data, context) {
  ensure(context.user.district_ids.includes(data.district_id), 'Facility is outside your DM districts', 'DISTRICT_FORBIDDEN', 403);
  const {email,...details}=data;
  const facility=await createMaster(connection, 'facilities', {
    ...details,
    code: `${data.kind}-${crypto.randomUUID().toUpperCase()}`
  }, context.user);
  const userId=await repository.createPaddyUser(connection,{
    name:details.contact_name||details.name,email,role:details.kind,facility_id:facility.id,
    password_hash:await passwordHash('123456789'),created_by:context.user.id??null
  });
  return {...facility,user_id:userId,email,role:details.kind};
}
export async function assignPaddySource(connection, data, context) {
  await scopedDMFacility(connection, context.user, data.source_id, 'PADDY');
  await scopedDMFacility(connection, context.user, data.destination_id, 'MILLER');
  await repository.assignPaddySourceFindSeasons(connection, data);
  await repository.assignPaddySourceExecuteRouteTags(connection, data);
  const assignment=await repository.assignPaddySourceFindRouteTags(connection,data);
  return assignment;
}
export async function getSetupOptions(context) {
  const effects = {
    headers: []
  };
  const ids = context.user.district_ids,
    marks = ids.map(() => '?').join(',');
  const millers = await repository.getSetupOptionsListFacilities(marks, ids);
  const depots = await repository.getSetupOptionsListFacilities2(marks, ids);
  const seasons = await repository.getSetupOptionsListSeasons();
  const assignments = await repository.getSetupOptionsListMillerStoreAssignments(marks, ids);
  const orders = await repository.getSetupOptionsListCmrOrders(marks, ids);
  const stocks = await repository.getSetupOptionsListStocks(marks, ids);
  const vehicles = await repository.getSetupOptionsListGpsDevices(marks, ids);
  const vehicleTypes = await repository.getSetupOptionsListVehicleTypes();
  return {
    body: {
      ok: true,
      data: {
        millers,
        depots,
        seasons,
        assignments,
        orders,
        stocks,
        vehicles,
        vehicle_types: vehicleTypes,
        test_stock_enabled: process.env.ENABLE_CMR_TEST_SETUP === 'true'
      }
    },
    status: 200,
    ...effects
  };
}
export async function resolveDMDepot(connection, data, context, legacyField) {
  ensure(Boolean(data.store_location_id) !== Boolean(data[legacyField]), 'Provide either store_location_id or ' + legacyField, 'VALIDATION', 400);
  if (!data.store_location_id) return scopedDMFacility(connection, context.user, data[legacyField], 'STORE');
  const store = await repository.lockSelectedDepot(connection, data.store_location_id);
  ensure(context.user.district_ids.includes(Number(store.district_id)), 'Store is outside your DM districts', 'DISTRICT_FORBIDDEN', 403);
  const existing = await repository.findDepotFacility(connection, store.id);
  if (existing) {
    ensure(existing.active && Number(existing.district_id) === Number(store.district_id) && existing.kind === (Number(store.store_type) === 1 ? 'FCI' : 'SFC_GODOWN'), 'Store facility link is inactive or inconsistent', 'INVALID_STORE', 400);
    return existing;
  }
  const { districts, blocks: blockRows } = await repository.depotLocationMasters(connection);
  const blocks = new Map();
  for (const block of blockRows) {
    const key = block.district_id + ':' + block.rgi_block_code;
    blocks.set(key, [...(blocks.get(key) || []), block]);
  }
  const normalized = storeFacilityData(store, { districts, blocks, code: 'CORE-STORE-' + store.id, capacityUnit: 'MT', radiusUnit: 'KM' });
  ensure(!normalized.problems.length, 'Store requires valid facility details: ' + normalized.problems.join('; '), 'INVALID_STORE_DETAILS', 400);
  const facility = { ...normalized.data, created_by_core_user_id: context.user.core_user_id ?? null, created_by_user_type: context.user.core_user_type ?? null };
  return { ...facility, id: await repository.insertDepotFacility(connection, facility) };
}
export async function assignReceivingStore(connection, data, context) {
  await scopedDMFacility(connection, context.user, data.miller_id, 'MILLER');
  const depot = await resolveDMDepot(connection, data, context, 'store_id');
  data = { ...data, store_id: depot.id };
  delete data.store_location_id;
  await repository.assignReceivingStoreFindSeasons(connection, data);
  await repository.assignReceivingStoreExecuteMillerStoreAssignments(connection, data);
  return data;
}
export async function createCmrOrder(connection, data, context) {
  await requireStockMasters(connection,data.scheme_code,'RICE');
  await scopedDMFacility(connection, context.user, data.miller_id, 'MILLER');
  const depot = await resolveDMDepot(connection, data, context, 'destination_id');
  data = { ...data, destination_id: depot.id };
  delete data.store_location_id;
  await repository.createCmrOrderFindSeasons(connection, data);
  await repository.createCmrOrderFindMillerStoreAssignments(connection, data);
  ensure(data.due_date >= new Date(Date.now() + 19800000).toISOString().slice(0, 10), 'Due date is in the past', 'VALIDATION', 400);
  const id = await repository.createCmrOrderInsertCmrOrders(connection, context, data);
  return {
    id
  };
}
export async function addTestRice(connection, data, context) {
  ensure(process.env.ENABLE_CMR_TEST_SETUP === 'true', 'Test stock entry is disabled', 'TEST_SETUP_DISABLED', 403);
  await scopedDMFacility(connection, context.user, data.miller_id, 'MILLER');
  await requireStockMasters(connection,data.scheme_code,'RICE');
  await repository.addTestRiceFindSeasons(connection, data);
  await lockFacilities(connection, [data.miller_id]);
  const amount = grams(data.quantity);
  const entry = await repository.addTestRiceInsertTestStockEntries(connection, data, amount);
  await stock(connection, data.miller_id, data.season_id, 'RICE', amount, 0, 'TEST_RICE', entry, data.scheme_code, context.user);
  return {
    id: entry,
    quantity_g: amount
  };
}
export async function registerMillerVehicle(connection, data, context) {
  const miller = await scopedDMFacility(connection, context.user, data.miller_id, 'MILLER');
  const actor = {
    ...context.user,
    role: 'OPERATOR'
  };
  const vehicle = data.vehicle_id
    ? await repository.findSelectedMillerVehicle(connection, data.vehicle_id, miller.id)
    : await createMaster(connection, 'vehicles', S.vehicle.parse({
    miller_id: data.miller_id,
    vehicle_type_id: data.vehicle_type_id,
    registration_no: data.registration_no,
    capacity: data.capacity
  }), actor);
  const device = await createMaster(connection, 'gps-devices', S.device.parse({
    vehicle_id: vehicle.id,
    imei_id: data.imei_id,
    district_id: miller.district_id,
    block_id: miller.block_id
  }), actor);
  return {
    id: vehicle.id,
    device_id: device.id
  };
}
