import * as repository from "../repositories/verifyCoreReceiver.repository.js";
import jwt from 'jsonwebtoken';
import { coreDatabase } from "../config/core-database.js";
import { ensure } from "../utils/core.js";
export function createVerifyCoreReceiver({
  database = coreDatabase
} = {}) {
  return async (req, res, next) => {
    ensure(process.env.CORE_DM_ENABLED === 'true' && process.env.CORE_JWT_ACCESS_SECRET, 'Core authentication is not configured', 'CORE_AUTH_DISABLED', 503);
    const token = req.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.CORE_JWT_ACCESS_SECRET, {
        algorithms: ['HS256']
      });
    } catch {
      ensure(false, 'Core session expired or invalid', 'UNAUTHORIZED', 401);
    }
    const userId = Number(decoded?.id);
    ensure(Number.isSafeInteger(userId) && userId > 0 && Number.isFinite(decoded.exp), 'Invalid core token payload', 'UNAUTHORIZED', 401);
    const db = database();
    const user = await repository.queryFindTblUserMaster(db, userId);
    ensure(user && Number(user.status) === 1, 'Invalid or inactive core user', 'UNAUTHORIZED', 401);
    ensure([4, 8].includes(Number(user.user_type)), 'Only AGM or Lifting Incharge may receive CMR', 'FORBIDDEN', 403);
    const assignments = await repository.queryListTblUserDistrictwiseStoreAssignment(db, userId);
    const stores = assignments.map(row => ({
      district_id: Number(row.district_id),
      store_id: Number(row.store_id)
    })).filter(row => Number.isSafeInteger(row.store_id) && row.store_id > 0 && Number.isSafeInteger(row.district_id) && row.district_id > 0);
    ensure(stores.length, 'No active receiving store assignments', 'STORE_SCOPE_REQUIRED', 403);
    req.user = {
      role: 'CORE_RECEIVER',
      actor: `core-receiver:${userId}`,
      core_user_id: userId,
      core_user_type: Number(user.user_type),
      name: user.full_name,
      stores
    };
    next();
  };
}
export const verifyCoreReceiver = createVerifyCoreReceiver();
