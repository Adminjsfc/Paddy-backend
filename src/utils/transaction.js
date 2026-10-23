import { pool } from "../config/database.js";
export async function transaction(fn) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const c = await pool.getConnection();
    try {
      await c.query("SET time_zone='+00:00'");
      await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await c.beginTransaction();
      const result = await fn(c);
      await c.commit();
      return result;
    } catch (e) {
      await c.rollback();
      if (!['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(e.code) || attempt === 2) throw e;
    } finally {
      c.release();
    }
  }
}
