import { AppError } from "../utils/core.js";
import { secondPrecision } from '../utils/datetime.js';
export async function rows(db, sql, values = []) {
  const [r] = await db.execute(sql, values.map(value => value instanceof Date ? secondPrecision(value) : value));
  return r;
}
export async function one(db, sql, values = [], required = true, missing = {}) {
  const r = await rows(db, sql, values);
  if (!r[0] && required) throw new AppError(missing.status ?? 404, missing.code ?? 'NOT_FOUND', missing.message ?? 'Record not found');
  return r[0];
}
export async function insert(db, table, data) {
  const fields = Object.keys(data); // table/fields are internal constants, never client input.
  const r = await rows(db, `INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`, Object.values(data));
  return r.insertId;
}
