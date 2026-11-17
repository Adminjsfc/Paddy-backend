import * as repository from '../repositories/manual-stock.repository.js';
import * as balances from '../repositories/stock.repository.js';
import {lockFacilities} from '../repositories/facilities.repository.js';
import {stock} from './stock.service.js';
import {ensure,kilograms,addKg,actor,id} from '../utils/core.js';

async function validate(c,data){
  const f=await repository.facility(c,data.facility_id);
  ensure(Number(f.active)===1,'Selected facility is inactive.','FACILITY_INACTIVE',409);
  ensure(data.commodity_code==='PADDY'?['PACS','LAMPS'].includes(f.kind):f.kind==='MILLER',
    data.commodity_code==='PADDY'?'Select a PACS/LAMPS facility for Paddy stock.':'Select a Miller facility for CMR Rice stock.','INVALID_STOCK_FACILITY',400);
  await repository.season(c,data.season_id);
}
async function save(c,current,target,remarks,user,type){
  const before=Number(current.on_hand_kg),delta=addKg(target,-before);
  ensure(Number(current.status)===1,'Stock balance is inactive.','STOCK_INACTIVE',409);
  ensure(target>=Number(current.reserved_kg),`Stock cannot be less than ${Number(current.reserved_kg)} KG already reserved for shipments.`,'STOCK_QUANTITY_RESERVED',409);
  let ledgerId=null;
  if(delta!==0){
    ledgerId=await stock(c,current.facility_id,current.season_id,current.commodity_code,delta,0,type,current.id,current.scheme_code,user,{remarks});
  }
  return {id:current.id,stock_id:current.id,facility_id:current.facility_id,season_id:current.season_id,scheme_code:current.scheme_code,commodity_code:current.commodity_code,
    on_hand_kg:target,reserved_kg:Number(current.reserved_kg),available_kg:addKg(target,-Number(current.reserved_kg)),ledger_id:ledgerId,stock_delta_kg:delta,updated:delta!==0};
}
export async function add(c,data,context){
  await lockFacilities(c,[data.facility_id]);
  await validate(c,data);
  const existing=await repository.find(c,data);
  ensure(!existing,`Stock already exists${existing?` (stock_id=${existing.id})`:''}. Use the stock update API to change its quantity.`,'STOCK_ALREADY_EXISTS',409);
  const amount=kilograms(data.quantity);
  await balances.ensureBalance(c,data.facility_id,data.season_id,data,{userId:context.user.id??null,actor:actor(context.user)});
  const created=await repository.find(c,data);
  return save(c,await repository.get(c,created.id,true),amount,data.remarks,context.user,'STOCK_ADD');
}
export async function update(c,data,context){
  const stockId=id.parse(Number(context.params.id));
  const snapshot=await repository.get(c,stockId);
  await lockFacilities(c,[snapshot.facility_id]);
  const current=await repository.get(c,stockId,true);
  await validate(c,current);
  return save(c,current,kilograms(data.quantity,true),data.remarks,context.user,'STOCK_UPDATE');
}
