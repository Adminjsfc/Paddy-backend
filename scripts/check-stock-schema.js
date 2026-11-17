// Read-only deployment check. Prints column names only, never credentials/data.
import {pool} from '../src/config/database.js';
const required={
  facilities:['id','kind','active','capacity_value','capacity_unit'],
  seasons:['id','active'],
  stocks:['id','facility_id','season_id','scheme_code','commodity_code','on_hand_kg','reserved_kg','status','created_by','created_by_actor','updated_at','updated_by','updated_by_actor'],
  stock_ledger:['id','stock_id','remarks','facility_id','season_id','scheme_code','commodity_code','on_hand_delta_kg','reserved_delta_kg','reference_type','reference_id','created_by','created_by_actor']
};
try{
  let missing=0;
  for(const [table,names] of Object.entries(required)){
    const [columns]=await pool.execute('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[table]);
    const actual=new Set(columns.map(c=>c.COLUMN_NAME));
    for(const name of names)if(!actual.has(name)){console.log(`MISSING: ${table}.${name}`);missing++;}
  }
  console.log(missing?'Stock database schema is outdated. Apply the latest migrations.':'Stock database schema matches the current stock API.');
  process.exitCode=missing?1:0;
}finally{await pool.end();}
