import { one, rows } from "../repositories/database.js";
export async function queryFindTblUserMaster(db, userId) {
  return one(db, 'SELECT id,user_type,status,full_name FROM tbl_user_master WHERE id=?', [userId], false);
}
export async function queryListTblUserDistrictwiseStoreAssignment(db, userId) {
  return rows(db, `SELECT DISTINCT a.district_id,a.store_id FROM tbl_user_districtwise_store_assignment a
      JOIN tbl_store_location_master s ON s.id=a.store_id AND s.district_id=a.district_id
      WHERE a.user_id=? AND a.status=1 AND s.status=1 AND s.store_type IN (1,2)`, [userId]);
}
