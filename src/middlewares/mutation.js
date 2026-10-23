import { ensure, hash, actor } from "../utils/core.js";
import * as repository from '../repositories/request-keys.repository.js';
import { transaction } from "../utils/transaction.js";
export function mutation(schema, fn) {
  return async (req, res) => {
    const data = schema.parse(req.body);
    const key = req.get('Idempotency-Key');
    ensure(key && /^[A-Za-z0-9_.:-]{8,120}$/.test(key), 'Provide an 8–120 character Idempotency-Key', 'IDEMPOTENCY_KEY_REQUIRED', 400);
    const route = req.baseUrl + req.path,
      who = actor(req.user),
      digest = hash(data);
    const result = await transaction(async connection => {
      await repository.reserve(connection, who, route, key, digest);
      const record = await repository.lock(connection, who, route, key);
      ensure(record.payload_hash === digest, 'Idempotency-Key already used with a different body', 'IDEMPOTENCY_CONFLICT');
      if (record.response) return {
        replayed: true,
        data: typeof record.response === 'string' ? JSON.parse(record.response) : record.response
      };
      const out = await fn(connection, data, req);
      await repository.saveResponse(connection, who, route, key, out);
      await repository.audit(connection, {
        actor: who,
        action: route,
        request_id: req.requestId,
        entity_id: out.id ? String(out.id) : null
      });
      return {
        replayed: false,
        data: out
      };
    });
    res.status(result.replayed ? 200 : 201).json({
      ok: true,
      ...result,
      request_id: req.requestId
    });
  };
}
