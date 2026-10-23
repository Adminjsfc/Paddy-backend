import * as repository from "../repositories/verifyCoreDM.repository.js";
import jwt from 'jsonwebtoken';
import { ensure } from "../utils/core.js";
import { coreDatabase } from "../config/core-database.js";
export function createVerifyCoreDM({
  database = coreDatabase
} = {}) {
  return async function verifyCoreDM(req, res, next) {
    ensure(process.env.CORE_DM_ENABLED === 'true', 'Core DM registration is not configured', 'CORE_AUTH_DISABLED', 503);
    ensure(process.env.CORE_JWT_ACCESS_SECRET, 'Configure CORE_JWT_ACCESS_SECRET', 'CORE_AUTH_DISABLED', 503);
    // Core access tokens are passed explicitly, so CMR's accessToken cookie
    // cannot shadow the core backend's cookie with the same name.
    const token = req.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.CORE_JWT_ACCESS_SECRET, {
        algorithms: ['HS256']
      });
    } catch {
      ensure(false, 'Core session expired or invalid', 'UNAUTHORIZED', 401);
    }
    const id = Number(decoded?.id);
    ensure(Number.isSafeInteger(id) && id > 0 && Number.isFinite(decoded.exp), 'Invalid core token payload', 'UNAUTHORIZED', 401);
    const db = database();
    const user = await repository.verifyCoreDMFindTblUserMaster(db, id);
    ensure(user && Number(user.status) === 1, 'Invalid or inactive core user', 'UNAUTHORIZED', 401);
    ensure(Number(user.user_type) === 3, 'Only core DM users may register millers through this endpoint', 'FORBIDDEN', 403);
    const assignments = await repository.verifyCoreDMListTblUserDistrictwiseStoreAssignment(db, id);
    const districtIds = [...new Set(assignments.map(row => Number(row.district_id)).filter(value => Number.isSafeInteger(value) && value > 0))];
    ensure(districtIds.length, 'DM has no active district assignments', 'DISTRICT_SCOPE_REQUIRED', 403);
    req.user = {
      role: 'CORE_DM',
      actor: `core-dm:${id}`,
      core_user_id: id,
      core_user_type: Number(user.user_type),
      name: user.full_name,
      district_ids: districtIds
    };
    next();
  };
}
export const verifyCoreDM = createVerifyCoreDM();
