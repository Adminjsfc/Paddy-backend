import mysql from 'mysql2/promise';
import fs from 'node:fs';
import { ensure } from "../utils/core.js";
let corePool;
export function coreDatabase() {
  if (!corePool) {
    for (const name of ['CORE_DB_HOST', 'CORE_DB_USER', 'CORE_DB_NAME']) ensure(process.env[name], `Configure ${name}`, 'CORE_AUTH_DISABLED', 503);
    corePool = mysql.createPool({
      host: process.env.CORE_DB_HOST,
      port: Number(process.env.CORE_DB_PORT || 3306),
      user: process.env.CORE_DB_USER,
      password: process.env.CORE_DB_PASSWORD || '',
      database: process.env.CORE_DB_NAME,
      connectionLimit: 3,
      connectTimeout: 5000,
      ...(process.env.CORE_DB_SSL_CA_FILE ? {
        ssl: {
          ca: fs.readFileSync(process.env.CORE_DB_SSL_CA_FILE),
          rejectUnauthorized: true
        }
      } : {})
    });
  }
  return corePool;
}
export async function closeCoreDMPool() {
  if (corePool) {
    await corePool.end();
    corePool = undefined;
  }
}
