import * as repository from "../repositories/cmr-submissions.repository.js";
import { z } from 'zod';
import crypto from 'node:crypto';
import { id, ensure } from "../utils/core.js";
import { createShipment } from "./shipments.service.js";
import * as S from "../validators/schemas.js";
import { readStores, readSelectedStore, storeMatchesFacility } from "./store-locations.service.js";
export async function submitCMR(connection, data, context) {
  await repository.requireActiveCmrMasters(connection, data);
  const destination = await repository.submitCMRFindFacilities(connection, data);
  ensure(destination.district_id === data.district_id, 'Depot does not belong to the selected district', 'INVALID_DESTINATION', 400);
  const store = await readSelectedStore(data.store_location_id, data.district_id, data.scheme_type);
  ensure(storeMatchesFacility(store, destination), 'Selected store is not mapped to the order destination facility', 'STORE_NOT_LINKED', 400);
  if (destination.core_store_id == null) {
    const candidates = await readStores(data.district_id, data.scheme_type);
    ensure(candidates.filter(candidate => candidate.store_code === store.store_code).length === 1, 'Store code is ambiguous; an explicit facility link is required', 'STORE_NOT_LINKED', 400);
  }
  await repository.submitCMRFindVehicles(connection, data);
  const shipment = S.shipment.parse({
    shipment_no: `CMR-${crypto.randomUUID()}`,
    leg: 'CMR',
    scheme_code: data.scheme_type,
    season_id: data.season_id,
    miller_id: context.user.miller_id,
    source_id: context.user.miller_id,
    destination_id: data.destination_id,
    vehicle_id: data.vehicle_id,
    expected_completion_at: data.expected_completion_at?.toISOString() ?? null,
    order_id: data.order_id,
    quantity: data.quantity,
    remarks: data.remarks
  });
  return createShipment(connection, shipment, context, {
    submitted_on: data.submitted_on,
    agency: destination.kind === 'FCI' ? 'FCI' : 'SFC',
    core_store_location_id: store.id,
    cmr_lot_count: data.lot_count,
    stenciling_code: data.stenciling_code,
    gunny_bag_year: data.gunny_bag_year,
    gunny_bag_type: data.gunny_bag_type,
    total_bags: data.total_bags,
    driver_name: data.driver_name,
    driver_phone: data.driver_phone
  });
}
export async function getSubmissionOptions(context) {
  const effects = {
    headers: []
  };
  const seasons = await repository.getSubmissionOptionsListSeasons();
  const [schemes, commodities] = await Promise.all([repository.listCmrSchemes(), repository.listCmrCommodities()]);
  const seasonId = context.query.season_id ? id.parse(Number(context.query.season_id)) : null;
  const districts = seasonId ? await repository.getSubmissionOptionsListTblDistrictMaster(context, seasonId) : [];
  const scheme = z.enum(['SCMR', 'CCMR']).parse(context.query.scheme_type || 'SCMR');
  let stores = [];
  if (context.query.district_id) {
    const districtId = id.parse(Number(context.query.district_id));
    const sourceStores = districts.some(district => Number(district.id) === districtId) ? await readStores(districtId, scheme) : [];
    const facilities = seasonId ? await repository.getSubmissionOptionsListFacilities(districtId, context, seasonId) : [];
    stores = sourceStores.map(store => {
      const matches = facilities.filter(facility => storeMatchesFacility(store, facility));
      // Without an explicit link, reject ambiguous duplicated source codes.
      const ambiguous = sourceStores.filter(other => other.store_code && other.store_code === store.store_code).length > 1;
      const match = matches.length === 1 && (!ambiguous || matches[0].core_store_id != null) ? matches[0] : null;
      return {
        ...store,
        facility_id: match?.id ?? null
      };
    }).filter(store => store.facility_id != null);
  }
  let orders = [];
  let stock = null;
  if (context.query.season_id) {
    orders = await repository.getSubmissionOptionsListCmrOrders(context, seasonId, scheme);
    stock = await repository.getSubmissionOptionsFindStocks(context, seasonId, scheme);
  }
  return {
    body: {
      ok: true,
      data: {
        seasons,
        schemes,
        commodities,
        districts,
        stores,
        orders,
        rice_stock: stock || {
          on_hand_g: 0,
          reserved_g: 0,
          available_g: 0
        }
      }
    },
    status: 200,
    ...effects
  };
}
export async function listEligibleVehicles(context) {
  const effects = {
    headers: []
  };
  const vehicles = await repository.listEligibleVehiclesListVehicles(context);
  return {
    body: {
      ok: true,
      data: vehicles
    },
    status: 200,
    ...effects
  };
}
export async function getVehicle(context) {
  const effects = {
    headers: []
  };
  const registration = z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{5,20}$/).parse(context.query.registration_no);
  const vehicle = await repository.getVehicleFindGpsDevices(registration, context);
  return {
    body: {
      ok: true,
      data: vehicle
    },
    status: 200,
    ...effects
  };
}
