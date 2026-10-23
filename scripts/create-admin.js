import { pool } from "../src/config/database.js";
import { one, insert } from "../src/repositories/database.js";
import { passwordHash } from "../src/utils/core.js";
import { user } from "../src/validators/schemas.js";
try {
  const d = user.parse({
    name: process.env.ADMIN_NAME || 'SFC Administrator',
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    role: 'ADMIN'
  });
  if (d.password.startsWith('replace_')) throw new Error('Set a unique ADMIN_PASSWORD');
  const existing = await one(pool, 'SELECT id FROM users WHERE email=?', [d.email], false);
  if (existing) throw new Error('Account exists; existing password was not changed');
  const {
    password,
    ...fields
  } = d;
  const id = await insert(pool, 'users', {
    ...fields,
    password_hash: await passwordHash(password)
  });
  console.log(`Administrator created (id ${id}). Remove ADMIN_PASSWORD from .env.`);
} finally {
  await pool.end();
}
