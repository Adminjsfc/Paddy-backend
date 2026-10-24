import crypto from 'node:crypto';
import { ZodError } from 'zod';
export function requestId(req, res, next) {
  req.requestId = crypto.randomUUID();
  res.set('X-Request-Id', req.requestId);
  next();
}
export function notFound(req, res) {
  return res.status(404).json({
    ok: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found'
    },
    request_id: req.requestId
  });
}
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  let status = err.status || 500,
    code = err.code || 'INTERNAL_ERROR',
    message = err.message;
  if (err instanceof ZodError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
  }
  if (err.code === 'ER_DUP_ENTRY') {
    status = 409;
    code = 'DUPLICATE_RECORD';
    message = 'Unique code, reference, device, vehicle or active vehicle assignment already exists.';
    const path = (req.originalUrl || req.url || '').split('?')[0];
    if (req.method === 'POST' && /\/(schemes|commodities)\/?$/.test(path)) {
      message = path.replace(/\/$/, '').endsWith('/schemes') ? 'Scheme with this code already exists.' : 'Commodity with this code already exists.';
    }
    if (['POST', 'PATCH'].includes(req.method) && /\/imeis(?:\/\d+)?\/?$/.test(path)) {
      message = 'IMEI already exists.';
    }
    if (req.method === 'POST' && /\/gps-devices\/?$/.test(path)) {
      message = 'This vehicle or IMEI is already assigned to a GPS device.';
    }
    if (req.method === 'POST' && /\/vehicles\/?$/.test(path) && !path.includes('/core/')) {
      message = 'Vehicle with this registration number already exists.';
    }
    if (['POST', 'PATCH'].includes(req.method) && /\/vehicle-types(?:\/\d+)?\/?$/.test(path)) {
      message = 'Vehicle type with this code already exists.';
    }
    if (['POST', 'PATCH'].includes(req.method) && /\/facilities(?:\/\d+)?\/?$/.test(path) && !path.includes('/core/')) {
      const labels = { MILLER: 'Miller facility', PACS: 'PACS facility', LAMPS: 'LAMPS facility', SFC_GODOWN: 'SFC godown', FCI: 'FCI facility' };
      const label = labels[req.body?.kind] || 'Facility';
      message = `${label} with this code already exists. Use a unique facility code.`;
      if (/uq_facility_core_store/.test(err.sqlMessage || err.message || '')) {
        message = 'A facility is already linked to this core store.';
      }
    }
  }
  if (['ER_NO_REFERENCED_ROW_2', 'ER_CHECK_CONSTRAINT_VIOLATED'].includes(err.code)) {
    status = 409;
    code = 'DATA_CONSTRAINT';
    message = 'Referenced record or database constraint is invalid.';
  }
  if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(err.code)) {
    status = 503;
    code = 'TRANSACTION_BUSY';
    message = 'Retry the same request with the same Idempotency-Key.';
    res.set('Retry-After', '1');
  }
  if (err.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Request body is not valid JSON.';
  }
  if (status >= 500) {
    console.error(JSON.stringify({
      event: 'REQUEST_ERROR',
      request_id: req.requestId,
      code: err.code || err.name,
      method: req.method,
      path: (req.originalUrl || req.url || '').split('?')[0],
      message: err.code === 'ER_BAD_FIELD_ERROR'
        ? (err.sqlMessage || err.message)
        : undefined
    }));
    if (code !== 'TRANSACTION_BUSY' && code !== 'INTEGRATION_DISABLED') message = 'Service error; check server logs with the request ID.';
  }
  res.status(status).json({
    ok: false,
    error: {
      code,
      message
    },
    request_id: req.requestId
  });
}
