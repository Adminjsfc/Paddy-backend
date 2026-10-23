import * as repository from "../repositories/verifyJWT.repository.js";
import { ensure, hash } from "../utils/core.js";
import { cookieToken } from "./browser-session.js";
export function accessToken(req) {
  const authorization = req.get('Authorization');
  if (authorization) return authorization.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  const mobile = req.get('device')?.toLowerCase() === 'mobile' || (req.get('user-agent') || '').toLowerCase().includes('okhttp');
  if (mobile) {
    const raw = req.get('x-auth-token');
    return /^[a-f0-9]{64}$/.test(raw || '') ? raw : undefined;
  }
  return cookieToken(req, 'accessToken');
}

// Named to match the core backend's middleware convention. CMR uses opaque,
// database-backed session tokens rather than signed JWTs. Never decode them.
export async function verifyJWT(req, res, next) {
  const raw = accessToken(req);
  ensure(raw, 'Access token required', 'UNAUTHORIZED', 401);
  const user = await repository.verifyJWTFindSessions(raw);
  ensure(user, 'Session expired or invalid', 'UNAUTHORIZED', 401);
  req.user = {
    ...user,
    user_id: user.id
  };
  req.tokenHash = hash(raw);
  next();
}
