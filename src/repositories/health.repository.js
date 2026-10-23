import { pool } from '../config/database.js';
import { one } from './database.js';
export async function checkReadiness() {
  await one(pool, 'SELECT 1 AS ready');
  await one(pool, "SELECT version FROM schema_migrations WHERE version='001_initial.sql'");
}
