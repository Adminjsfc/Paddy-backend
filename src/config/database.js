import mysql from 'mysql2/promise';
import fs from 'node:fs';
export const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'sfc_cmr_app',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sfc_cmr',
  timezone: 'Z',
  connectionLimit: Number(process.env.DB_POOL_LIMIT || 10),
  waitForConnections: true,
  queueLimit: 100,
  supportBigNumbers: true,
  bigNumberStrings: false,
  decimalNumbers: true,
  ...(process.env.DB_SSL_CA_FILE ? {
    ssl: {
      ca: fs.readFileSync(process.env.DB_SSL_CA_FILE),
      rejectUnauthorized: true
    }
  } : {})
};
export const pool = mysql.createPool(dbConfig);
pool.on('connection', connection => connection.query("SET time_zone='+00:00'"));
