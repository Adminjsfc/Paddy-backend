import { pool } from "../config/database.js";
import { rows, one } from "../repositories/database.js";
export async function moduleGuardFindModulePermissions(key) {
  return one(pool, 'SELECT can_view,can_add,can_edit FROM module_permissions WHERE role=? AND module_key=?', ['MILLER', key], false);
}
export async function listAssignedModulesListModulePermissions(context) {
  return rows(pool, 'SELECT module_key,can_view,can_add,can_edit FROM module_permissions WHERE role=?', [context.user.role]);
}
export async function listModulePermissionsListModulePermissions() {
  return rows(pool, "SELECT * FROM module_permissions WHERE role='MILLER' ORDER BY module_key");
}
export async function updateModulePermissionsExecuteModulePermissions(connection, data, module, context) {
  return rows(connection, `INSERT INTO module_permissions (role,module_key,can_view,can_add,can_edit,updated_by)
    VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE can_view=VALUES(can_view),can_add=VALUES(can_add),can_edit=VALUES(can_edit),updated_by=VALUES(updated_by),updated_at=CURRENT_TIMESTAMP()`, [data.role, module.key, module.can_view, module.can_view && module.can_add, module.can_view && module.can_edit, context.user.id]);
}
export async function getProfileFindFacilities(user) {
  return one(pool, `SELECT f.id,f.code,f.name,f.address,f.phone,f.contact_name,f.district_id,f.block_id,
    d.district_name,b.block_name,f.capacity_g,f.milling_capacity_g_per_day,f.recovery_percent
    FROM facilities f LEFT JOIN tbl_district_master d ON d.id=f.district_id LEFT JOIN tbl_block_master b ON b.id=f.block_id WHERE f.id=?`, [user.miller_id]);
}
export async function updateProfileUpdateUsers(connection, fields, data, context) {
  return rows(connection, `UPDATE users SET ${fields.map(field => `${field}=?`).join(',')},updated_by=?,updated_at=CURRENT_TIMESTAMP() WHERE id=?`, [...Object.values(data), context.user.id, context.user.id]);
}
export async function listMillerMasterOptionsListTblDistrictMaster() {
  return rows(pool, 'SELECT id,district_name FROM tbl_district_master WHERE status=1 ORDER BY district_name');
}
export async function listMillerMasterOptionsListTblBlockMaster(context) {
  return rows(pool, 'SELECT id,block_name FROM tbl_block_master WHERE district_id=? ORDER BY block_name', [Number(context.query.district_id)]);
}
export async function listMillerMasterOptionsListVehicleTypes() {
  return rows(pool, 'SELECT id,name FROM vehicle_types WHERE active=1 ORDER BY name');
}
export async function listMillerMasterOptionsListTransporters(context) {
  return rows(pool, 'SELECT id,name FROM transporters WHERE miller_id=? AND active=1 ORDER BY name', [context.user.miller_id ?? null]);
}
export async function listMillerMasterOptionsListVehicles(context) {
  return rows(pool, 'SELECT v.id,v.registration_no FROM vehicles v WHERE v.miller_id=? AND v.active=1 ORDER BY v.registration_no', [context.user.miller_id ?? null]);
}
