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
  return ['vehicles', 'gps-devices'].find(key => path === `/${key}` || new RegExp(`^/${key}/\\d+(?:/status)?$`).test(path));
}
export function allowedModule(permission, method) {
  const action = ['GET', 'HEAD'].includes(method) ? 'can_view' : method === 'POST' ? 'can_add' : 'can_edit';
  return Boolean(permission && Number(permission.can_view) === 1 && Number(permission[action]) === 1);
}
export async function moduleGuard(context, res, next) {
  if (context.user.role === 'DRIVER') {
    const summary=context.method==='POST'&&['/tripsummary_for_driver','/driver_detailsList','/active_tripList','/getTripDetailsForDriver','/alert_report_for_driver'].includes(context.path);
    ensure(summary||context.method === 'GET' && /^\/shipments(?:\/\d+)?$/.test(context.path), 'Drivers can only view their assigned shipments and trip summary', 'FORBIDDEN', 403);
    return next();
  }
  if (context.user.role !== 'MILLER') return next();
  const key = moduleForRequest(context);
  if (!key) return next();
  const permission = await repository.moduleGuardFindModulePermissions(key);
  const message = key==='cmr'
    ? (context.method==='POST' ? 'CMR submission permission is not enabled for your Miller role. Please contact your administrator to enable CMR View and Add permissions.' : 'CMR access is not enabled for your Miller role. Please contact your administrator to enable CMR View permission.')
    : 'You do not have permission to perform this action. Please contact your administrator.';
  ensure(allowedModule(permission, context.method), message, 'MODULE_FORBIDDEN', 403);
  next();
}
