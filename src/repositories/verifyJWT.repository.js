import { pool } from "../config/database.js";
import { one } from "../repositories/database.js";
import { hash } from "../utils/core.js";
export async function verifyJWTFindSessions(raw) {
  return one(pool, `SELECT u.id,u.name,u.email,u.role,u.miller_id,u.facility_id,f.district_id,d.district_name
    FROM sessions s JOIN users u ON u.id=s.user_id
    LEFT JOIN facilities f ON f.id=COALESCE(u.facility_id,u.miller_id) AND u.role IN ('PACS','LAMPS','MILLER')
    LEFT JOIN tbl_district_master d ON d.id=f.district_id
    WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP() AND u.active=1`, [hash(raw)], false);
}
