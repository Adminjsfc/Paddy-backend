import { one } from "./database.js";
export async function lockFacilities(connection, ids) {
  for (const n of [...new Set(ids)].sort((a, b) => a - b)) await one(connection, 'SELECT id FROM facilities WHERE id=? FOR UPDATE', [n],true,{code:'FACILITY_NOT_FOUND',message:`facility_id=${n} was not found. Use the registered source/destination facility ID.`});
}
