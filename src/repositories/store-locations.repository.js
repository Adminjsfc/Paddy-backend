import { pool } from "../config/database.js";
import { rows, one } from "../repositories/database.js";
export async function readStoresListTblStoreLocationMaster(districtId, schemeStoreType, scheme) {
  return rows(pool, `SELECT id,store_id store_code,store_name,store_type,district_id
    FROM tbl_store_location_master WHERE district_id=? AND store_type=? AND status=1 ORDER BY store_name,id`, [districtId, schemeStoreType[scheme]]);
}
export async function readSelectedStoreFindTblStoreLocationMaster(storeId, districtId, schemeStoreType, scheme) {
  return one(pool, `SELECT id,store_id store_code,store_name,store_type,district_id
    FROM tbl_store_location_master WHERE id=? AND district_id=? AND store_type=? AND status=1`, [storeId, districtId, schemeStoreType[scheme]], false);
}
