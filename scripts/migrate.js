import fs from 'node:fs/promises';
import {migrateCommonLifting,removeLegacyLiftingTable} from './common-lifting-migration.js';
import {normalizeProcurementMasters,removePaddyReleaseOrders} from './procurement-master-migration.js';
import {normalizeStockAudit} from './stock-audit-migration.js';
import {normalizeShipmentMasters} from './shipment-master-migration.js';
import { checkLocationPrerequisites } from './location-prerequisites.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from "../src/config/database.js";
const dir = fileURLToPath(new URL('../sql/', import.meta.url));
const c = await pool.getConnection();
try {
  const [lock] = await c.query("SELECT GET_LOCK('sfc_cmr_schema_migration',30) acquired");
  if (!lock[0].acquired) throw new Error('Migration already running');
  await c.query('CREATE TABLE IF NOT EXISTS schema_migrations(version VARCHAR(80) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
  for (const filename of (await fs.readdir(dir)).filter(n => /^\d+.*\.sql$/.test(n)).sort()) {
    const [existing] = await c.execute('SELECT version FROM schema_migrations WHERE version=?', [filename]);
    if (existing.length) {
      console.log(`Already applied: ${filename}`);
      continue;
    }
    if (['009_location_users_and_dispatch_driver.sql', '012_shipment_flow_and_location.sql'].includes(filename)) await checkLocationPrerequisites(c);
    if (filename === '029_all_datetimes_seconds.sql') {
      const [duplicates] = await c.query("SELECT device_id FROM gps_packets GROUP BY device_id,DATE_FORMAT(gps_at,'%Y-%m-%d %H:%i:%s') HAVING COUNT(*)>1 LIMIT 1");
      if (duplicates.length) throw new Error('Cannot remove milliseconds: multiple GPS packets exist for the same device and second. Resolve these collisions before migration 029.');
    }
    if(filename==='032_common_lifting.sql')await migrateCommonLifting(c,true);
    if(filename==='033_remove_paddy_liftings.sql')await removeLegacyLiftingTable(c);
    if(filename==='035_procurement_master_ids.sql')await normalizeProcurementMasters(c);
    if(filename==='036_remove_paddy_release_orders.sql')await removePaddyReleaseOrders(c);
    if(filename==='037_stock_ids_and_audit.sql')await normalizeStockAudit(c);
    if(filename==='039_shipment_master_ids.sql')await normalizeShipmentMasters(c);
    const text = await fs.readFile(path.join(dir, filename), 'utf8');
    // Versioned SQL contains plain DDL only. MySQL DDL commits implicitly.
    for (const statement of text.split(';').map(s => s.trim()).filter(Boolean)) await c.query(statement);
    if(filename==='032_common_lifting.sql')await migrateCommonLifting(c);
    if(filename==='063_shipment_route_endpoints.sql')await c.query(`CREATE TRIGGER shipment_route_endpoints_immutable BEFORE UPDATE ON shipment_routes FOR EACH ROW
      BEGIN
        IF NOT(NEW.source_id <=> OLD.source_id) OR NOT(NEW.destination_id <=> OLD.destination_id) THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Route source/destination are immutable. Create a new route instead.';
        END IF;
      END`);
    if(filename==='063_shipment_route_endpoints.sql')await c.query(`CREATE TRIGGER shipment_route_link_immutable BEFORE UPDATE ON shipments FOR EACH ROW
      BEGIN
        IF NOT(NEW.route_id <=> OLD.route_id) THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Shipment route cannot change after creation.';
        END IF;
      END`);
    await c.execute('INSERT INTO schema_migrations(version) VALUES (?)', [filename]);
    console.log(`Applied: ${filename}`);
  }
} finally {
  await c.query("SELECT RELEASE_LOCK('sfc_cmr_schema_migration')");
  c.release();
  await pool.end();
}
