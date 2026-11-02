import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mysql from 'mysql2';
import {pool,dbConfig} from '../src/config/database.js';

const args=process.argv.slice(2);
const expected=args.find(arg=>arg.startsWith('--database='))?.slice('--database='.length);
const apply=args.includes('--apply');
const quote=value=>'`'+String(value).replaceAll('`','``')+'`';
const preserved=new Map([
  ['tbl_district_master','id'],
  ['tbl_store_location_master','id'],
  ['schema_migrations','version']
]);
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
let connection,inTransaction=false,locked=false,foreignKeys;
try {
  if(!expected||expected!==dbConfig.database)throw Error('Pass --database=<configured DB_NAME> to select the exact database.');
  if(!['127.0.0.1','localhost','::1'].includes(dbConfig.host))throw Error('This reset script is restricted to a local database.');
  connection=await pool.getConnection();
  const [tables]=await connection.query("SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
  const names=new Set(tables.map(table=>table.TABLE_NAME));
  for(const table of [...preserved.keys(),'users'])if(!names.has(table))throw Error(`Required preserved table missing: ${table}`);
  if(tables.some(table=>table.ENGINE?.toUpperCase()!=='INNODB'))throw Error('All tables must support transactions before this reset can run.');
  const clear=tables.map(table=>table.TABLE_NAME).filter(table=>!preserved.has(table)&&table!=='users');
  const counts={};
  for(const table of tables) {
    const [[row]]=await connection.query('SELECT COUNT(*) total FROM '+quote(table.TABLE_NAME));
    counts[table.TABLE_NAME]=Number(row.total);
  }
  const [[adminCount]]=await connection.query("SELECT COUNT(*) total FROM users WHERE role='ADMIN'");
  if(!Number(adminCount.total))throw Error('No ADMIN account found; reset cancelled.');
  if(!apply) {
    console.log(JSON.stringify({mode:'preview',database:expected,host:dbConfig.host,preservedTables:[...preserved.keys()],preservedAdminAccounts:Number(adminCount.total),tablesToEmpty:clear,nonAdminUsersToDelete:counts.users-Number(adminCount.total),rows:counts},null,2));
  } else {
    const [[lock]]=await connection.query("SELECT GET_LOCK('sfc_cmr_schema_migration',30) acquired");
    if(Number(lock.acquired)!==1)throw Error('Another schema/reset operation is running.');
    locked=true;
    const [[checks]]=await connection.query('SELECT @@SESSION.FOREIGN_KEY_CHECKS enabled');
    foreignKeys=Number(checks.enabled);
    await connection.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    await connection.beginTransaction();inTransaction=true;
    const snapshots=new Map();
    for(const [table,key] of preserved) {
      const [data]=await connection.query(`SELECT * FROM ${quote(table)} ORDER BY ${quote(key)} FOR UPDATE`);
      snapshots.set(table,{count:data.length,hash:hash(data)});
    }
    const [admins]=await connection.query("SELECT * FROM users WHERE role='ADMIN' ORDER BY id FOR UPDATE");
    const adminIds=new Set(admins.map(admin=>Number(admin.id)));
    for(const admin of admins) {
      if(admin.facility_id!=null||admin.miller_id!=null)throw Error('ADMIN account references operational records; review before reset.');
      for(const field of ['created_by','updated_by'])if(admin[field]!=null&&!adminIds.has(Number(admin[field])))throw Error('Preserved ADMIN audit fields reference a non-admin user; review before reset.');
    }
    const adminHash=hash(admins);
    const directory=path.resolve('.backups');
    const filename=path.join(directory,`${expected}-before-reset-${new Date().toISOString().replace(/[:.]/g,'-')}.sql`);
    fs.mkdirSync(directory,{recursive:true});
    fs.writeFileSync(filename,`-- Local data backup before an explicitly requested reset. Keep private.\n-- Database: ${expected}\nSET time_zone='+00:00';\nSET FOREIGN_KEY_CHECKS=0;\nSTART TRANSACTION;\n`,{flag:'wx',mode:0o600});
    let backedUpRows=0;
    for(const table of [...clear,'users']) {
      const [data]=await connection.query('SELECT * FROM '+quote(table)+(table==='users'?" WHERE role<>'ADMIN'":''));
      const [definition]=await connection.query('SHOW CREATE TABLE '+quote(table));
      fs.appendFileSync(filename,'\n'+definition[0]['Create Table'].replace(/^CREATE TABLE /,'CREATE TABLE IF NOT EXISTS ')+';\n');
      for(let offset=0;offset<data.length;offset+=200) {
        const chunk=data.slice(offset,offset+200);
        const columns=Object.keys(chunk[0]);
        const values=chunk.map(row=>'('+columns.map(column=>{
          let value=row[column];
          if(value!==null&&typeof value==='object'&&!(value instanceof Date)&&!Buffer.isBuffer(value))value=JSON.stringify(value);
          return mysql.escape(value,false,'Z');
        }).join(',')+')').join(',\n');
        fs.appendFileSync(filename,`INSERT INTO ${quote(table)} (${columns.map(quote).join(',')}) VALUES\n${values};\n`);
      }
      backedUpRows+=data.length;
    }
    fs.appendFileSync(filename,'\nCOMMIT;\nSET FOREIGN_KEY_CHECKS=1;\n');
    await connection.query('SET SESSION FOREIGN_KEY_CHECKS=0');
    for(const table of clear)await connection.query('DELETE FROM '+quote(table));
    await connection.query("DELETE FROM users WHERE role<>'ADMIN'");
    for(const table of clear) {
      const [[remaining]]=await connection.query('SELECT COUNT(*) total FROM '+quote(table));
      if(Number(remaining.total)!==0)throw Error(`Reset verification failed for ${table}`);
    }
    const [remainingUsers]=await connection.query('SELECT * FROM users ORDER BY id');
    if(hash(remainingUsers)!==adminHash)throw Error('ADMIN record preservation failed; reset rolled back.');
    for(const [table,key] of preserved) {
      const [data]=await connection.query(`SELECT * FROM ${quote(table)} ORDER BY ${quote(key)}`);
      if(hash(data)!==snapshots.get(table).hash)throw Error(`Preservation failed for ${table}; reset rolled back.`);
    }
    await connection.commit();inTransaction=false;
    await connection.query('SET SESSION FOREIGN_KEY_CHECKS='+foreignKeys);
    const resetIds=[];
    for(const table of [...clear,'users']) {
      const [auto]=await connection.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND EXTRA LIKE '%auto_increment%'",[table]);
      if(auto.length) {await connection.query('ALTER TABLE '+quote(table)+' AUTO_INCREMENT=1');resetIds.push(table);}
    }
    console.log(JSON.stringify({mode:'applied',database:expected,host:dbConfig.host,emptiedTables:clear.length,remainingAdminAccounts:remainingUsers.length,preserved:Object.fromEntries([...snapshots].map(([table,info])=>[table,info.count])),backupFile:filename,backedUpRows,autoIncrementResetTables:resetIds.length,sessionsCleared:true},null,2));
  }
} finally {
  if(connection) {
    if(inTransaction)await connection.rollback();
    if(foreignKeys!==undefined)await connection.query('SET SESSION FOREIGN_KEY_CHECKS='+foreignKeys);
    if(locked)await connection.query("SELECT RELEASE_LOCK('sfc_cmr_schema_migration')");
    connection.release();
  }
  await pool.end();
}
