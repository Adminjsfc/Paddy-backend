import * as repository from "../repositories/store-locations.repository.js";
import { ensure } from "../utils/core.js";
export const schemeStoreType = {
  SCMR: 2,
  CCMR: 1
};
export function storeMatchesFacility(store, facility) {
  const kind = Number(store.store_type) === 1 ? 'FCI' : 'SFC_GODOWN';
  if (Number(store.district_id) !== Number(facility.district_id) || facility.kind !== kind || !facility.active) return false;
  return facility.core_store_id != null ? Number(facility.core_store_id) === Number(store.id) : Boolean(store.store_code && String(facility.code) === String(store.store_code));
}
export async function readStores(districtId, scheme) {
  return repository.readStoresListTblStoreLocationMaster(districtId, schemeStoreType, scheme);
}
export async function readSelectedStore(storeId, districtId, scheme) {
  const store = await repository.readSelectedStoreFindTblStoreLocationMaster(storeId, districtId, schemeStoreType, scheme);
  ensure(store, 'Selected store is not active in the selected district and scheme', 'INVALID_STORE', 400);
  return store;
}
