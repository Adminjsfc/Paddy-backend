import { rows, one, insert } from './database.js';
export async function balanceMasters(connection,commodity,schemeCode) {
  const scheme=await one(connection,'SELECT id FROM schemes WHERE code=?',[schemeCode]);
  const item=await one(connection,'SELECT id FROM commodities WHERE code=?',[commodity]);
  return {scheme_id:scheme.id,commodity_id:item.id};
}
export function ensureBalance(connection, facilityId, seasonId, masters, audit) {
  return rows(connection, 'INSERT INTO stocks(facility_id,season_id,scheme_id,commodity_id,created_by,created_by_actor) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)', [facilityId, seasonId, masters.scheme_id,masters.commodity_id,audit.userId,audit.actor]);
}
export function lockBalance(connection, facilityId, seasonId, masters) {
  return one(connection, 'SELECT * FROM stocks WHERE facility_id=? AND season_id=? AND scheme_id=? AND commodity_id=? FOR UPDATE', [facilityId, seasonId, masters.scheme_id,masters.commodity_id]);
}
export function findCapacity(connection, facilityId) {
  return one(connection, 'SELECT capacity_g FROM facilities WHERE id=?', [facilityId]);
}
export function totalOnHand(connection, facilityId) {
  return one(connection, 'SELECT COALESCE(SUM(on_hand_g),0) AS amount FROM stocks WHERE facility_id=?', [facilityId]);
}
export function updateBalance(connection, stockId, onHandDelta, reservedDelta, audit) {
  return rows(connection, 'UPDATE stocks SET on_hand_g=on_hand_g+?,reserved_g=reserved_g+?,updated_at=UTC_TIMESTAMP(),updated_by=?,updated_by_actor=? WHERE id=?', [onHandDelta, reservedDelta, audit.userId,audit.actor,stockId]);
}
export function insertLedger(connection, data) {
  return insert(connection, 'stock_ledger', data);
}
