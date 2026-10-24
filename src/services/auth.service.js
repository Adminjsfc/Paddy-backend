import * as repository from "../repositories/auth.repository.js";
import { transaction } from "../utils/transaction.js";
import { cookieToken } from "../middlewares/browser-session.js";
import { ensure, hash, token, passwordHash, verifyPassword } from "../utils/core.js";
import * as S from "../validators/schemas.js";
import { accessToken } from "../middlewares/verifyJWT.js";
export const dummyHash = await passwordHash(token());
export function duration(name, fallback) {
  const value = Number(process.env[name] || fallback);
  ensure(Number.isFinite(value) && value > 0, `Invalid ${name}`, 'CONFIGURATION', 500);
  return value;
}
export function accessExpiry(limit) {
  const expires = Date.now() + duration('ACCESS_TOKEN_MINUTES', 15) * 60000;
  return new Date(limit ? Math.min(expires, limit.getTime()) : expires);
}
export async function login(context) {
  const effects = {
    headers: []
  };
  const d = S.login.parse(context.body);
  const u = await repository.loginFindUsers(d);
  const valid = await verifyPassword(d.password, u?.password_hash || dummyHash);
  ensure(valid && u?.active, 'Invalid email/phone or password', 'UNAUTHORIZED', 401);
  const raw = token(),
    refresh = token();
  const refreshExpires = new Date(Date.now() + duration('REFRESH_SESSION_DAYS', 7) * 86400000);
  const expires = accessExpiry(refreshExpires);
  await repository.loginInsertSessions(raw, u, expires, refresh, refreshExpires);
  effects.cookies = [raw, refresh, refreshExpires];
  const {
    password_hash,
    ...safe
  } = u;
  return {
    body: {
      ok: true,
      status: 200,
      data: {
        token: raw,
        expires_at: expires.toISOString(),
        user: safe
      }
    },
    status: 200,
    ...effects
  };
}
export function getCurrentUser(context) {
  const effects = {
    headers: []
  };
  return {
    body: {
      ok: true,
      data: context.user
    },
    status: 200,
    ...effects
  };
}
export async function refreshSession(context) {
  const effects = {
    headers: []
  };
  effects.headers.push('Cache-Control', 'no-store');
  const refresh = cookieToken(context, 'refreshToken');
  ensure(refresh, 'Refresh cookie required', 'UNAUTHORIZED', 401);
  const result = await transaction(async connection => {
    const session = await repository.queryFindSessions(connection, refresh);
    ensure(session, 'Refresh session expired or invalid', 'UNAUTHORIZED', 401);
    const presented = cookieToken(context, 'accessToken');
    const raw = presented && hash(presented) === session.token_hash ? presented : token();
    const expires = accessExpiry(new Date(session.refresh_expires_at));
    await repository.queryUpdateSessions(connection, raw, expires, refresh);
    return {
      raw,
      expires,
      refreshExpires: new Date(session.refresh_expires_at)
    };
  });
  effects.cookies = [result.raw, refresh, result.refreshExpires];
  // The legacy Axios client checks a top-level token before retrying.
  return {
    body: {
      ok: true,
      status: 200,
      token: result.raw,
      data: {
        token: result.raw,
        expires_at: result.expires.toISOString()
      }
    },
    status: 200,
    ...effects
  };
}
export async function logout(context) {
  const effects = {
    headers: []
  };
  const refresh = cookieToken(context, 'refreshToken');
  const raw = accessToken(context);
  await repository.logoutDeleteSessions(raw, refresh);
  effects.clearCookies = true;
  return {
    body: {
      ok: true,
      status: 200
    },
    status: 200,
    ...effects
  };
}
export async function changePassword(context) {
  const effects = {
    headers: []
  };
  const d = S.passwordChange.parse(context.body),
    u = await repository.changePasswordFindUsers(context);
  ensure(await verifyPassword(d.current_password, u.password_hash), 'Current password is incorrect', 'UNAUTHORIZED', 401);
  const encoded = await passwordHash(d.new_password);
  await transaction(async connection => {
    await repository.queryUpdateUsers(connection, encoded, context);
    await repository.queryDeleteSessions(connection, context);
  });
  effects.clearCookies = true;
  return {
    body: {
      ok: true,
      data: {
        message: 'Password changed; log in again.'
      }
    },
    status: 200,
    ...effects
  };
}
export async function createUser(connection, data, context) {
  if (data.role === 'MILLER' || data.role === 'TRANSPORTER') {
    ensure(data.miller_id, 'miller_id is required', 'VALIDATION', 400);
    const m = await repository.createUserFindFacilities(connection, data);
    if (data.role === 'TRANSPORTER') {
      ensure(data.transporter_id, 'transporter_id is required', 'VALIDATION', 400);
      await repository.createUserFindTransporters(connection, data, m);
    } else {
      ensure(!data.transporter_id, 'MILLER users cannot have transporter_id', 'VALIDATION', 400);
      data.facility_id = data.miller_id;
    }
  } else if (data.role === 'PACS' || data.role === 'LAMPS') {
    ensure(data.facility_id, 'facility_id is required', 'VALIDATION', 400);
    ensure(!data.miller_id && !data.transporter_id, 'PACS/LAMPS users cannot have Miller or transporter scope', 'VALIDATION', 400);
    await repository.createUserFindFacilities2(connection, data);
  } else ensure(!data.miller_id && !data.transporter_id && !data.facility_id, 'ADMIN/OPERATOR users cannot have entity scopes', 'VALIDATION', 400);
  const {
    password,
    ...safe
  } = data;
  const id = await repository.createUserInsertUsers(connection, safe, await passwordHash(password), context);
  return {
    id,
    ...safe
  };
}
export async function listUsers(context) {
  const effects = {
    headers: []
  };
  const active = context.query.active === undefined ? true : String(context.query.active) === 'true';
  ensure(context.query.active === undefined || ['true', 'false'].includes(String(context.query.active)), 'active must be true or false', 'VALIDATION', 400);
  return {
    body: {
      ok: true,
      data: await repository.listUsersListUsers(active)
    },
    status: 200,
    ...effects
  };
}
export async function setUserStatus(connection, data, context) {
  ensure(Number(context.params.id) !== context.user.id, 'Cannot deactivate your own account');
  await repository.setUserStatusFindUsers(connection, context);
  await repository.setUserStatusUpdateUsers(connection, data, context);
  if (!data.active) await repository.setUserStatusDeleteSessions(connection, context);
  return {
    id: Number(context.params.id),
    ...data
  };
}
