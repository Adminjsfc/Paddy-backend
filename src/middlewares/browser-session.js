import { ensure } from "../utils/core.js";
export function cookieToken(req, name) {
  const entry = (req.get('Cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`));
  const value = entry?.slice(name.length + 1);
  return /^[a-f0-9]{64}$/.test(value || '') ? value : undefined;
}
export function cookieOptions() {
  const sameSite = process.env.COOKIE_SAME_SITE || 'lax';
  const secure = process.env.COOKIE_SECURE === undefined ? process.env.NODE_ENV === 'production' : process.env.COOKIE_SECURE === 'true';
  ensure(['lax', 'strict', 'none'].includes(sameSite), 'Invalid COOKIE_SAME_SITE', 'CONFIGURATION', 500);
  ensure(sameSite !== 'none' || secure, 'SameSite=None requires COOKIE_SECURE=true', 'CONFIGURATION', 500);
  return {
    httpOnly: true,
    secure,
    sameSite,
    path: '/api/v1'
  };
}
export function setSessionCookies(res, access, refresh, refreshExpires) {
  const options = {
    ...cookieOptions(),
    expires: refreshExpires
  };
  // Retain the opaque access cookie for refresh matching; SQL controls its
  // shorter authentication lifetime independently of browser cookie storage.
  res.cookie('accessToken', access, options);
  res.cookie('refreshToken', refresh, options);
  res.set('Cache-Control', 'no-store');
}
export function clearSessionCookies(res) {
  for (const name of ['accessToken', 'refreshToken']) res.clearCookie(name, cookieOptions());
  res.set('Cache-Control', 'no-store');
}
export function browserAccess(req, res, next) {
  const origin = req.get('Origin');
  const allowed = (process.env.FRONTEND_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
  const sameOrigin = origin === `${req.protocol}://${req.get('host')}`;
  if (origin) {
    res.vary('Origin');
    ensure(sameOrigin || allowed.includes(origin), 'Browser origin is not allowed', 'ORIGIN_DENIED', 403);
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Access-Control-Expose-Headers', 'X-Request-Id');
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key, X-Auth-Token, Device');
      return res.sendStatus(204);
    }
  }
  // Also reject cross-site cookie writes when the client omitted Origin.
  if (!origin && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) ensure(req.get('Sec-Fetch-Site') !== 'cross-site', 'Cross-site request denied', 'ORIGIN_DENIED', 403);
  next();
}
