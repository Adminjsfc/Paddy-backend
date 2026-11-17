import {one} from './database.js';
export const facility=(c,id)=>one(c,'SELECT id,kind,active FROM facilities WHERE id=?',[id],true,{code:'FACILITY_NOT_FOUND',message:'Selected facility was not found.'});
export const season=(c,id)=>one(c,'SELECT id FROM seasons WHERE id=? AND active=1',[id],true,{code:'SEASON_NOT_FOUND',message:'Selected season was not found or is inactive.'});
export const find=(c,data)=>one(c,'SELECT id FROM stocks WHERE facility_id=? AND season_id=? AND scheme_code=? AND commodity_code=?',[data.facility_id,data.season_id,data.scheme_code,data.commodity_code],false);
export const get=(c,id,lock=false)=>one(c,`SELECT id,facility_id,season_id,scheme_code,commodity_code,on_hand_kg,reserved_kg,status FROM stocks WHERE id=?${lock?' FOR UPDATE':''}`,[id],true,{code:'STOCK_NOT_FOUND',message:'Stock record was not found.'});
