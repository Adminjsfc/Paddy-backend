import * as repository from "../repositories/cmr-submissions.repository.js";
import { z } from 'zod';
import crypto from 'node:crypto';
import { id, ensure } from "../utils/core.js";
import { createShipment } from "./shipments.service.js";
import * as S from "../validators/schemas.js";
import { readStores, readSelectedStore, storeMatchesFacility } from "./store-locations.service.js";
export async function submitCMR(connection, data, context) {
  const order = await repository.selectedSubmissionOrder(connection,data,context);
  data = {...data, scheme_type: order.scheme_code,
    lot_count: data.lot_count ?? order.lot_count,
    stenciling_code: data.stenciling_code ?? order.stenciling_code,
    submitted_on: data.submitted_on ?? new Date(Date.now()+19800000).toISOString().slice(0,10)};
  await repository.requireActiveCmrMasters(connection, data);
  const destination = await repository.submitCMRFindFacilities(connection, data);
  ensure(destination.district_id === data.district_id, 'Depot does not belong to the selected district', 'INVALID_DESTINATION', 400);
  const stores = data.store_location_id || destination.core_store_id ? [] : await readStores(data.district_id,data.scheme_type);
  const matching = stores.filter(candidate=>storeMatchesFacility(candidate,destination));
  const storeId = data.store_location_id ?? destination.core_store_id ?? (matching.length===1?matching[0].id:null);
  ensure(storeId,'Order destination is not linked to an active store','STORE_NOT_LINKED',400);
  const store = await readSelectedStore(storeId, data.district_id, data.scheme_type);
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
  const only=z.enum(['all','base','seasons','schemes','commodities','districts','stores','orders']).parse(context.query.only||'all');
  if(only==='districts')return {body:{ok:true,data:{districts:await repository.listDistricts()}},status:200,headers:[]};
  if(['seasons','schemes','commodities'].includes(only)){
    const values=only==='seasons'?await repository.getSubmissionOptionsListSeasons():only==='schemes'?await repository.listCmrSchemes():await repository.listCmrCommodities();
    return {body:{ok:true,data:{[only]:values}},status:200,headers:[]};
  }
  if(!['all','base'].includes(only))ensure(context.query.season_id,'season_id is required for this dropdown','VALIDATION',400);
  if(only==='stores')ensure(context.query.district_id,'district_id is required for the store dropdown','VALIDATION',400);
  if(only==='orders')ensure(context.query.destination_id,'destination_id is required for the order dropdown','VALIDATION',400);
  const effects = {
    headers: []
  };
  const seasons = ['all','base'].includes(only)?await repository.getSubmissionOptionsListSeasons():[];
  const [schemes, commodities] = ['all','base'].includes(only)?await Promise.all([repository.listCmrSchemes(), repository.listCmrCommodities()]):[[],[]];
  const seasonId = context.query.season_id ? id.parse(Number(context.query.season_id)) : null;
  const districts = seasonId&&['all','districts','stores'].includes(only) ? await repository.getSubmissionOptionsListTblDistrictMaster(context, seasonId) : [];
  const scheme = only==='orders'?null:z.enum(['SCMR', 'CCMR']).parse(context.query.scheme_type || 'SCMR');
  let stores = [];
  if (context.query.district_id&&['all','stores'].includes(only)) {
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
  if (context.query.season_id&&['all','orders'].includes(only)) {
    orders = await repository.getSubmissionOptionsListCmrOrders(context, seasonId, scheme);
    stock = await repository.getSubmissionOptionsFindStocks(context, seasonId, scheme);
    if(context.query.destination_id){const destinationId=id.parse(Number(context.query.destination_id));orders=orders.filter(o=>Number(o.destination_id)===destinationId);}
    if(context.query.district_id){const districtId=id.parse(Number(context.query.district_id));orders=orders.filter(o=>Number(o.district_id)===districtId);}
  }
  if(only!=='all'){
    const data=only==='base'?{seasons,schemes,commodities}:only==='districts'?{districts}:only==='stores'?{stores}:
      {orders,rice_stock:stock||{on_hand_kg:0,reserved_kg:0,available_kg:0}};
    return {body:{ok:true,data},status:200,headers:[]};
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
          on_hand_kg: 0,
          reserved_kg: 0,
          available_kg: 0
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
