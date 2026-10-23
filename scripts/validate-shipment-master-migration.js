import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {dbConfig,pool} from '../src/config/database.js';
import {normalizeShipmentMasters} from './shipment-master-migration.js';
const suffix=crypto.randomBytes(5).toString('hex');
const databases=[`paddy_shipment_upgrade_${suffix}_test`,`paddy_shipment_fresh_${suffix}_test`];
const connection=await mysql.createConnection(dbConfig);
const created=[];
try {
  const upgrade=databases[0];
  await connection.query('CREATE DATABASE `'+upgrade+'`');created.push(upgrade);
  await connection.query('USE `'+upgrade+'`');
  for(const sql of [
    'CREATE TABLE schemes(id INT UNSIGNED PRIMARY KEY,code VARCHAR(80) UNIQUE)',
    'CREATE TABLE commodities(id INT UNSIGNED PRIMARY KEY,code VARCHAR(80) UNIQUE)',
    'CREATE TABLE vehicle_types(id INT UNSIGNED PRIMARY KEY,name VARCHAR(100))',
    'CREATE TABLE vehicles(id INT UNSIGNED PRIMARY KEY,vehicle_type_id INT UNSIGNED)',
    `CREATE TABLE shipments(id INT UNSIGNED PRIMARY KEY,leg VARCHAR(10),vehicle_id INT UNSIGNED,scheme_code VARCHAR(80),scheme_type VARCHAR(4),commodity_type VARCHAR(30),submitted_vehicle_type VARCHAR(100),quantity_g BIGINT,submitted_on DATE,cmr_lot_count INT,driver_name VARCHAR(100),FOREIGN KEY(scheme_code) REFERENCES schemes(code))`,
    "INSERT INTO schemes VALUES(1,'SCMR'),(2,'CCMR'),(3,'LEGACY_UNSPECIFIED')",
    "INSERT INTO commodities VALUES(4,'PADDY'),(5,'RICE')",
    "INSERT INTO vehicle_types VALUES(6,'Historical truck'),(7,'Current truck')",
    'INSERT INTO vehicles VALUES(8,7)',
    "INSERT INTO shipments VALUES(1,'PADDY',8,'SCMR',NULL,NULL,NULL,1000000,NULL,NULL,'Paddy Driver'),(2,'CMR',8,'SCMR','SCMR','RICE','Historical truck',500000,'2026-10-20',2,'CMR Driver'),(3,'CMR',8,'LEGACY_UNSPECIFIED','CCMR',NULL,NULL,700000,NULL,NULL,NULL)"
  ])await connection.query(sql);
  await assert.rejects(normalizeShipmentMasters(connection),/scheme_type and scheme_code disagree/);
  await connection.query('UPDATE shipments SET scheme_type=NULL WHERE id=3');
  await connection.query("UPDATE shipments SET commodity_type='PADDY' WHERE id=2");
  await assert.rejects(normalizeShipmentMasters(connection),/commodity_type does not match/);
  await connection.query("UPDATE shipments SET commodity_type='RICE',submitted_vehicle_type='Missing type' WHERE id=2");
  await assert.rejects(normalizeShipmentMasters(connection),/no unambiguous master mapping/);
  await connection.query("UPDATE shipments SET submitted_vehicle_type='Historical truck' WHERE id=2");
  const [before]=await connection.query('SELECT id,leg,vehicle_id,quantity_g,submitted_on,cmr_lot_count,driver_name FROM shipments ORDER BY id');
  await normalizeShipmentMasters(connection);
  await normalizeShipmentMasters(connection);
  const [after]=await connection.query('SELECT id,leg,vehicle_id,quantity_g,submitted_on,cmr_lot_count,driver_name FROM shipments ORDER BY id');
  assert.deepEqual(after,before);
  const [mapped]=await connection.query('SELECT id,scheme_id,commodity_id,vehicle_type_id FROM shipments ORDER BY id');
  assert.deepEqual(mapped.map(row=>[row.scheme_id,row.commodity_id,row.vehicle_type_id]),[[1,4,7],[1,5,6],[3,5,7]]);
  const [columns]=await connection.query('SHOW COLUMNS FROM shipments');
  for(const field of ['scheme_code','scheme_type','commodity_type','submitted_vehicle_type'])assert(!columns.some(row=>row.Field===field));
  await assert.rejects(connection.query('UPDATE shipments SET scheme_id=999 WHERE id=1'),error=>error.code==='ER_NO_REFERENCED_ROW_2');
  console.log('PASS: upgrade preserves quantities, dates, lots, drivers, historical vehicle types and legacy schemes; rejects mismatches, resumes after failure and reruns safely.');
  // This database contains only generated fixtures. Exercise the trip upgrade
  // against all historical lifecycle states before testing a fresh installation.
  await connection.query('RENAME TABLE shipments TO shipment_master_fixture');
  await connection.query('CREATE TABLE shipments(id INT PRIMARY KEY,status VARCHAR(20),departed_at DATETIME,arrived_at DATETIME,delivered_at DATETIME,quantity_g BIGINT)');
  await connection.query(`INSERT INTO shipments VALUES
    (1,'PLANNED',NULL,NULL,NULL,1000),(2,'DISPATCHED',NULL,NULL,NULL,2000),
    (3,'IN_TRANSIT','2026-10-20 08:00:00',NULL,NULL,3000),
    (4,'ARRIVED','2026-10-20 08:00:00','2026-10-20 09:00:00',NULL,4000),
    (5,'DELIVERED','2026-10-20 08:00:00','2026-10-20 09:00:00','2026-10-20 10:00:00',5000),
    (6,'DELIVERED',NULL,NULL,'2026-10-20 10:00:00',6000),
    (7,'CANCELLED',NULL,NULL,NULL,7000),(8,'IN_TRANSIT',NULL,NULL,NULL,8000)`);
  const [tripBefore]=await connection.query('SELECT id,status,departed_at,arrived_at,delivered_at,quantity_g FROM shipments ORDER BY id');
  for(const sql of fs.readFileSync(new URL('../sql/040_shipment_trip_tracking.sql',import.meta.url),'utf8').split(';').map(text=>text.trim()).filter(Boolean))await connection.query(sql);
  const [tripAfter]=await connection.query('SELECT id,status,departed_at,arrived_at,delivered_at,quantity_g FROM shipments ORDER BY id');
  assert.deepEqual(tripAfter,tripBefore);
  const [trips]=await connection.query('SELECT * FROM shipments ORDER BY id');
  assert.deepEqual(trips.map(row=>row.trip_status),[0,0,1,2,2,2,0,1]);
  for(const trip of trips){
    assert.deepEqual(trip.trip_started_at,trip.departed_at);assert.equal(trip.expected_completion_at,null);
    assert.deepEqual(trip.trip_completed_at,trip.trip_status===2?trip.arrived_at||trip.delivered_at:null);
  }
  await assert.rejects(connection.query('UPDATE shipments SET trip_status=3 WHERE id=1'));
  await connection.query("INSERT INTO shipments(id,status) VALUES(9,'PLANNED')");
  const [[defaultTrip]]=await connection.query('SELECT trip_status,trip_started_at,trip_completed_at,expected_completion_at FROM shipments WHERE id=9');
  assert.deepEqual(defaultTrip,{trip_status:0,trip_started_at:null,trip_completed_at:null,expected_completion_at:null});
  console.log('PASS: trip upgrade maps planned, dispatched, running, arrived, delivered, cancelled and missing-GPS history; preserves data and validates defaults/status values.');
  const fresh=databases[1];
  await connection.query('CREATE DATABASE `'+fresh+'`');created.push(fresh);
  const env={...process.env,DB_NAME:fresh};
  try {
    const migration=execFileSync(process.execPath,['scripts/migrate.js'],{env,encoding:'utf8'});
    assert(migration.includes('Applied: 039_shipment_master_ids.sql'));
    execFileSync(process.execPath,['--test','--test-concurrency=1','test/integration.test.js'],{env,stdio:'inherit'});
  }catch(error){if(error.stdout)console.error(String(error.stdout));if(error.stderr)console.error(String(error.stderr));throw error;}
}finally {
  await connection.query('USE `'+dbConfig.database.replaceAll('`','``')+'`');
  for(const database of created){
    assert(databases.includes(database)&&/^paddy_shipment_(?:upgrade|fresh)_[a-f0-9]+_test$/.test(database)&&database!==dbConfig.database);
    await connection.query('DROP DATABASE `'+database+'`');
  }
  await connection.end();await pool.end();
}
