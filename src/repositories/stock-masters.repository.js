import {one} from './database.js';

export async function requireStockMasters(connection,schemeCode,commodity) {
  const scheme=await one(connection,'SELECT id FROM schemes WHERE code=? AND active=1',[schemeCode],true,{code:'SCHEME_NOT_FOUND',message:`scheme_code=${schemeCode}: not found or inactive.`});
  const item=await one(connection,'SELECT id FROM commodities WHERE code=? AND active=1',[commodity],true,{code:'COMMODITY_NOT_FOUND',message:`commodity_code=${commodity}: not found or inactive.`});
  return {scheme_id:scheme.id,commodity_id:item.id};
}
