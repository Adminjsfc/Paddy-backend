import crypto from 'node:crypto';
import { ensure, hash } from "../utils/core.js";
import { verifyJWT } from "./verifyJWT.js";
export function roles(...allowed) {
  return (req, res, next) => {
    ensure(allowed.includes(req.user.role), 'This role cannot perform this action', 'FORBIDDEN', 403);
    next();
  };
}
export const auth = verifyJWT;
export function apiKey(envName, role) {
  return (req, res, next) => {
    const expected = process.env[envName] || '',
      provided = req.get('X-API-Key') || '';
    ensure(expected.length >= 32, 'Integration credential is not configured', 'INTEGRATION_DISABLED', 503);
    ensure(provided.length >= 32 && crypto.timingSafeEqual(Buffer.from(hash(provided), 'hex'), Buffer.from(hash(expected), 'hex')), 'Invalid API key', 'UNAUTHORIZED', 401);
    req.user = {
      role,
      actor: role.toLowerCase()
    };
    next();
  };
}
