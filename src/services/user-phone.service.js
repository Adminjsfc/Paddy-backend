import { findUserByPhone } from '../repositories/auth.repository.js';
import { ensure } from '../utils/core.js';

export async function ensureUniqueUserPhone(connection, phone) {
  if (phone == null) return;
  const existing = await findUserByPhone(connection, phone);
  ensure(!existing, 'Mobile number already registered.', 'MOBILE_ALREADY_EXISTS', 409);
}
