import { one, rows } from "../repositories/database.js";
export async function verifyCoreDMFindTblUserMaster(db, id) {
  return one(db, 'SELECT id,user_type,status,full_name FROM tbl_user_master WHERE id=?', [id], false);
}
export async function verifyCoreDMListTblUserDistrictwiseStoreAssignment(db, id) {
  return rows(db, `SELECT DISTINCT district_id FROM tbl_user_districtwise_store_assignment
      WHERE user_id=? AND status=1 AND district_id IS NOT NULL`, [id]);
}
