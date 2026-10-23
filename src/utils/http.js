import { setSessionCookies, clearSessionCookies } from '../middlewares/browser-session.js';

// Pass request data to services without passing the Express response object.
export function requestContext(req) {
  return {
    user: req.user,
    body: req.body,
    params: req.params,
    query: req.query,
    requestId: req.requestId,
    path: req.path,
    method: req.method,
    get: name => req.get(name)
  };
}
export function respond(res, result) {
  for (let index = 0; index < (result.headers?.length || 0); index += 2) res.set(result.headers[index], result.headers[index + 1]);
  if (result.cookies) setSessionCookies(res, ...result.cookies);
  if (result.clearCookies) clearSessionCookies(res);
  return res.status(result.status ?? 200).json(result.body);
}
