import { pool } from "../config/database.js";
import { one, rows, insert } from "../repositories/database.js";
import { hash } from "../utils/core.js";
export function findUserByPhone(connection, phone) {
  return one(connection, 'SELECT id FROM users WHERE phone=?', [phone], false);
}
export async function loginFindUsers(data) {
  const identifier = data.phone ?? data.email;
  const select = `SELECT u.id,u.name,u.email,u.password_hash,u.role,u.miller_id,u.facility_id,u.active,u.created_at,u.created_by,u.updated_by,u.updated_at,u.phone,
    f.district_id,d.district_name FROM users u
    LEFT JOIN facilities f ON f.id=COALESCE(u.facility_id,u.miller_id) AND u.role IN ('PACS','LAMPS','MILLER')
    LEFT JOIN tbl_district_master d ON d.id=f.district_id`;
  return one(pool, `${select} WHERE ${identifier.includes('@') ? 'u.email=?' : "u.phone=? AND u.role='DRIVER'"}`, [identifier], false);
}
export async function loginInsertSessions(raw, u, expires, refresh, refreshExpires) {
  return insert(pool, 'sessions', {
    token_hash: hash(raw),
    user_id: u.id,
    expires_at: expires,
    refresh_token_hash: hash(refresh),
    refresh_expires_at: refreshExpires
  });
}
export async function queryFindSessions(connection, refresh) {
  return one(connection, `SELECT s.token_hash,s.refresh_expires_at FROM sessions s JOIN users u ON u.id=s.user_id
        WHERE s.refresh_token_hash=? AND s.refresh_expires_at>UTC_TIMESTAMP() AND u.active=1 FOR UPDATE`, [hash(refresh)], false);
}
export async function queryUpdateSessions(connection, raw, expires, refresh) {
  return rows(connection, 'UPDATE sessions SET token_hash=?,expires_at=? WHERE refresh_token_hash=?', [hash(raw), expires, hash(refresh)]);
}
export async function logoutDeleteSessions(raw, refresh) {
  return rows(pool, 'DELETE FROM sessions WHERE token_hash=? OR refresh_token_hash=?', [raw ? hash(raw) : null, refresh ? hash(refresh) : null]);
}
export async function changePasswordFindUsers(context) {
  return one(pool, 'SELECT password_hash FROM users WHERE id=?', [context.user.id]);
}
export async function queryUpdateUsers(connection, encoded, context) {
  return rows(connection, 'UPDATE users SET password_hash=?,password=NULL,updated_by=?,updated_at=? WHERE id=?', [encoded, context.user.id, new Date(), context.user.id]);
}
export async function queryDeleteSessions(connection, context) {
  return rows(connection, 'DELETE FROM sessions WHERE user_id=?', [context.user.id]);
}
export async function createUserFindFacilities(connection, data) {
  return one(connection, "SELECT id FROM facilities WHERE id=? AND kind='MILLER' AND active=1", [data.miller_id]);
}

export async function createUserFindFacilities2(connection, data) {
  return one(connection, 'SELECT id FROM facilities WHERE id=? AND kind=? AND active=1', [data.facility_id, data.role]);
}
export async function createUserInsertUsers(connection, safe, encodedPassword, context) {
  return insert(connection, 'users', {
    ...safe,
    password_hash: encodedPassword,
    created_by: context.user.id ?? null
  });
}
export async function listUsersListUsers(active) {
  return rows(pool, `SELECT u.id,u.name,u.email,u.role,u.miller_id,u.facility_id,u.active,u.created_at,u.updated_at,
    creator.name created_by_name,creator.email created_by_email,updater.name updated_by_name,updater.email updated_by_email
    FROM users u LEFT JOIN users creator ON creator.id=u.created_by LEFT JOIN users updater ON updater.id=u.updated_by WHERE u.active=? ORDER BY u.id LIMIT 200`, [active]);
}
export async function setUserStatusFindUsers(connection, context) {
  return one(connection, 'SELECT id FROM users WHERE id=? FOR UPDATE', [context.params.id]);
}
export async function setUserStatusUpdateUsers(connection, data, context) {
  return rows(connection, 'UPDATE users SET active=?,updated_by=?,updated_at=? WHERE id=?', [data.active, context.user.id ?? null, new Date(), context.params.id]);
}
export async function setUserStatusDeleteSessions(connection, context) {
  return rows(connection, 'DELETE FROM sessions WHERE user_id=?', [context.params.id]);
}
