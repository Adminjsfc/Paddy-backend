import * as repository from '../repositories/order-stock.repository.js';
import {lockFacilities} from '../repositories/facilities.repository.js';
import {stock} from './stock.service.js';
import {addKg} from '../utils/core.js';

// Unresolved push records remain importable, but cannot fund stock until their
// Miller and season exist. The locked source row makes retries safe.
export async function syncOrderStock(connection, orderId, user) {
  const source=await repository.source(connection,orderId);
  const masters=await repository.masters(connection,source);
  if(!masters)return {stock_pending:true};
  await lockFacilities(connection,[source.miller_id]);
  const order=await repository.lockOrder(connection,orderId);
  const target=order.status==='CANCELLED'?0:Number(order.rice_quantity_kg);
  const delta=addKg(target,-Number(order.stock_credited_kg));
  if(delta!==0){
    const type=order.status==='CANCELLED'?'CMR_ORDER_CANCEL':Number(order.stock_credited_kg)===0?'CMR_ORDER':'CMR_ORDER_ADJUSTMENT';
    await stock(connection,order.miller_id,order.season_id,'RICE',delta,0,type,order.id,order.scheme_code,user);
    await repository.setCredit(connection,target,order.id);
  }
  return {stock_pending:false,stock_delta_kg:delta};
}

export async function allocatedOrderKg(connection,orderId){
  const used=await repository.allocated(connection,orderId);
  return Number(used.kg);
}
