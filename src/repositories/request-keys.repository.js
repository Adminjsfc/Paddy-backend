import { rows, one, insert } from './database.js';
export function reserve(connection, actor, route, key, digest) {
  return rows(connection, 'INSERT INTO request_keys (actor,route,request_key,payload_hash) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE request_key=request_key', [actor, route, key, digest]);
}
export function lock(connection, actor, route, key) {
  return one(connection, 'SELECT payload_hash,response FROM request_keys WHERE actor=? AND route=? AND request_key=? FOR UPDATE', [actor, route, key]);
}
export function saveResponse(connection, actor, route, key, result) {
  return rows(connection, 'UPDATE request_keys SET response=? WHERE actor=? AND route=? AND request_key=?', [JSON.stringify(result), actor, route, key]);
}
export function audit(connection, data) {
  return insert(connection, 'audit_log', data);
}
