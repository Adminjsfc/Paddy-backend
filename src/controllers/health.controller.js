import { getReadiness } from '../services/health.service.js';
export function live(req, res) {
  res.json({
    ok: true,
    service: 'sfc-cmr-service'
  });
}
export async function ready(req, res) {
  res.json(await getReadiness());
}
