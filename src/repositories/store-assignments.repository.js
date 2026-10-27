import { pool } from "../config/database.js";
import { one, rows } from "../repositories/database.js";
import { id } from "../utils/core.js";
export async function createMillerStoreAssignmentsFindSeasons(connection, data) {
  return one(connection, "SELECT id FROM seasons WHERE id=? AND active=1", [data.season_id]);
}
export async function createMillerStoreAssignmentsFindFacilities(connection, data) {
  return one(connection, "SELECT id FROM facilities WHERE id=? AND kind='MILLER' AND active=1", [data.miller_id]);
}
export async function createMillerStoreAssignmentsFindFacilities2(connection, data) {
  return one(connection, "SELECT id FROM facilities WHERE id=? AND kind IN ('SFC_GODOWN','FCI') AND active=1", [data.store_id]);
}
export async function createMillerStoreAssignmentsExecuteMillerStoreAssignments(connection, data, context) {
  return rows(connection, 'INSERT INTO miller_store_assignments (season_id,miller_id,store_id,created_by) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE active=TRUE,created_by=VALUES(created_by),created_at=CURRENT_TIMESTAMP(),unassigned_by=NULL,unassigned_at=NULL', [data.season_id, data.miller_id, data.store_id, context.user.id ?? null]);
}
export async function createMillerStoreAssignmentsFindMillerStoreAssignments(connection, data) {
  return one(connection, 'SELECT id,season_id,miller_id,store_id,active,created_by,created_at,unassigned_by,unassigned_at FROM miller_store_assignments WHERE season_id=? AND miller_id=? AND store_id=?', [data.season_id, data.miller_id, data.store_id]);
}
export async function listMillerStoreAssignmentsCountRecords(base, args) {
  return one(pool, `SELECT COUNT(a.id) total ${base}`, args);
}
export async function listMillerStoreAssignmentsListRecords(base, limit, offset, args) {
  return rows(pool, `SELECT a.id,a.season_id,se.code season_code,a.miller_id,m.code miller_code,m.name miller_name,a.store_id,s.code store_code,s.name store_name,s.kind store_kind,s.district_id,sd.district_name,a.active,a.created_by,creator.name created_by_name,creator.email created_by_email,a.created_at,a.unassigned_by,unassigner.name unassigned_by_name,unassigner.email unassigned_by_email,a.unassigned_at ${base} ORDER BY a.active DESC,sd.district_name,m.name,s.name,a.id LIMIT ${limit} OFFSET ${offset}`, args);
}
export async function listMillerStoreAssignmentOptionsListSeasons() {
  return rows(pool, 'SELECT id,code,name,start_date,end_date FROM seasons WHERE active=1 ORDER BY start_date DESC,id DESC');
}
export async function listMillerStoreAssignmentOptionsListFacilities() {
  return rows(pool, "SELECT f.id,f.code,f.name,f.district_id,f.block_id,d.district_name,b.block_name FROM facilities f LEFT JOIN tbl_district_master d ON d.id=f.district_id LEFT JOIN tbl_block_master b ON b.id=f.block_id WHERE f.kind='MILLER' AND f.active=1 ORDER BY d.district_name,f.name,f.id");
}
export async function listMillerStoreAssignmentOptionsListFacilities2() {
  return rows(pool, "SELECT f.id,f.code,f.name,f.kind,f.district_id,f.block_id,d.district_name,b.block_name FROM facilities f LEFT JOIN tbl_district_master d ON d.id=f.district_id LEFT JOIN tbl_block_master b ON b.id=f.block_id WHERE f.kind IN ('SFC_GODOWN','FCI') AND f.active=1 ORDER BY d.district_name,f.name,f.id");
}
export async function setAssignmentStatusFindMillerStoreAssignments(connection, context) {
  return one(connection, 'SELECT id,season_id,miller_id,store_id,active,created_by,created_at,unassigned_by,unassigned_at FROM miller_store_assignments WHERE id=? FOR UPDATE', [id.parse(Number(context.params.id))]);
}
export async function setAssignmentStatusFindSeasons(connection, assignment) {
  return one(connection, 'SELECT id FROM seasons WHERE id=? AND active=1', [assignment.season_id]);
}
export async function setAssignmentStatusFindFacilities(connection, assignment) {
  return one(connection, "SELECT id FROM facilities WHERE id=? AND kind='MILLER' AND active=1", [assignment.miller_id]);
}
export async function setAssignmentStatusFindFacilities2(connection, assignment) {
  return one(connection, "SELECT id FROM facilities WHERE id=? AND kind IN ('SFC_GODOWN','FCI') AND active=1", [assignment.store_id]);
}
export async function setAssignmentStatusUpdateMillerStoreAssignments(connection, context, now, assignment) {
  return rows(connection, 'UPDATE miller_store_assignments SET active=TRUE,created_by=?,created_at=?,unassigned_by=NULL,unassigned_at=NULL WHERE id=?', [context.user.id ?? null, now, assignment.id]);
}
export async function setAssignmentStatusUpdateMillerStoreAssignments2(connection, context, now, assignment) {
  return rows(connection, 'UPDATE miller_store_assignments SET active=FALSE,unassigned_by=?,unassigned_at=? WHERE id=?', [context.user.id ?? null, now, assignment.id]);
}
