import {requireStockMasters} from './stock-masters.repository.js';
import { rows, one, insert } from './database.js';
export async function balanceMasters(connection,commodity,schemeCode) {
  return requireStockMasters(connection,schemeCode,commodity);
}
export async function ensureBalance(connection, facilityId, seasonId, masters, audit) {
  const existing=await one(connection,'SELECT id FROM stocks WHERE facility_id=? AND season_id=? AND scheme_code=? AND commodity_code=?',[facilityId,seasonId,masters.scheme_code,masters.commodity_code],false);
  if(existing)return;
  return rows(connection, 'INSERT INTO stocks(facility_id,season_id,scheme_code,commodity_code,created_by,created_by_actor) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)', [facilityId, seasonId, masters.scheme_code,masters.commodity_code,audit.userId,audit.actor]);
}
export function lockBalance(connection, facilityId, seasonId, masters) {
  return one(connection, 'SELECT id,on_hand_kg,reserved_kg,status FROM stocks WHERE facility_id=? AND season_id=? AND scheme_code=? AND commodity_code=? FOR UPDATE', [facilityId, seasonId, masters.scheme_code,masters.commodity_code]);
}
export function findCapacity(connection, facilityId) {
  return one(connection, 'SELECT capacity_value,capacity_unit FROM facilities WHERE id=?', [facilityId]);
}
export function totalOnHand(connection, facilityId) {
  return one(connection, 'SELECT COALESCE(SUM(on_hand_kg),0) AS amount FROM stocks WHERE facility_id=?', [facilityId]);
}
export function updateBalance(connection, stockId, onHandDelta, reservedDelta, audit) {
  return rows(connection, 'UPDATE stocks SET on_hand_kg=on_hand_kg+?,reserved_kg=reserved_kg+?,updated_at=UTC_TIMESTAMP(),updated_by=?,updated_by_actor=? WHERE id=?', [onHandDelta, reservedDelta, audit.userId,audit.actor,stockId]);
}
export function insertLedger(connection, data) {
  return insert(connection, 'stock_ledger', data);
}
