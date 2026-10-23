import { checkReadiness } from '../repositories/health.repository.js';
export async function getReadiness() {
  await checkReadiness();
  return {
    ok: true,
    database: 'ready'
  };
}
