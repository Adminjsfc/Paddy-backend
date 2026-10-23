import * as repository from "../repositories/modules.repository.js";
import { ensure } from "../utils/core.js";
export function moduleForRequest(context) {
  const path = context.path;
  if (path.startsWith('/cmr/')) return 'cmr';
  if (path === '/cmr-orders' || path === '/shipments' && (context.query?.leg === 'CMR' || context.body?.leg === 'CMR')) return 'cmr';
  if (path === '/reports/dashboard' || path === '/reports/dashboard/vehicles') return 'dashboard';
  if (path === '/reports/stocks') return 'stocks';
  if (path === '/reports/ledger' || path === '/reports/lifting-summary') return 'ledger';
  if (/^\/reports\/millers\/\d+\/reconciliation$/.test(path)) return 'reconciliation';
  return ['transporters', 'vehicles', 'gps-devices'].find(key => path === `/${key}` || new RegExp(`^/${key}/\\d+(?:/status)?$`).test(path));
}
export function allowedModule(permission, method) {
  const action = ['GET', 'HEAD'].includes(method) ? 'can_view' : method === 'POST' ? 'can_add' : 'can_edit';
  return Boolean(permission && Number(permission.can_view) === 1 && Number(permission[action]) === 1);
}
export async function moduleGuard(context, res, next) {
  if (context.user.role !== 'MILLER') return next();
  const key = moduleForRequest(context);
  if (!key) return next();
  const permission = await repository.moduleGuardFindModulePermissions(key);
  ensure(allowedModule(permission, context.method), 'Module action is not assigned to your role', 'MODULE_FORBIDDEN', 403);
  next();
}
