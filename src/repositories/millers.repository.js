import { insert, rows } from "../repositories/database.js";
import { pool } from "../config/database.js";
export async function registerMillerInsertUsers(connection, data, facility, actor, encodedPassword) {
  return insert(connection, 'users', {
    name: data.user.name,
    email: data.user.email,
    password_hash: encodedPassword,
    role: 'MILLER',
    miller_id: facility.id,
    facility_id: facility.id,
    created_by: actor.id ?? null
  });
}
export async function listLocationOptionsListTblDistrictMaster(ids) {
  return rows(pool, `SELECT id,district_name FROM tbl_district_master WHERE status=1 AND id IN (${ids.map(() => '?').join(',')}) ORDER BY district_name`, ids);
}
export async function listLocationOptionsListTblBlockMaster(districtId) {
  return rows(pool, 'SELECT id,district_id,block_name FROM tbl_block_master WHERE district_id=? ORDER BY block_name', [districtId]);
}
