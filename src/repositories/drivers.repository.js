import {one, rows, insert} from './database.js';
import {pool} from '../config/database.js';

export function findByPhone(connection, phone) {
  return one(connection, 'SELECT id,name,phone,role,active,facility_id FROM users WHERE phone=? FOR UPDATE', [phone], false);
}
export function create(connection, data) {
  return insert(connection, 'users', data);
}
export function associate(connection, driverId, facilityId, actorId) {
  return rows(connection, 'INSERT INTO driver_owners (driver_id,facility_id,created_by) VALUES (?,?,?) ON DUPLICATE KEY UPDATE driver_id=VALUES(driver_id)', [driverId,facilityId,actorId]);
}
export function list(facilityId) {
  return rows(pool, `SELECT u.id,u.name,u.phone,u.active,u.facility_id FROM users u
    JOIN driver_owners d ON d.driver_id=u.id WHERE d.facility_id=? AND u.role='DRIVER' ORDER BY u.id`, [facilityId]);
}
