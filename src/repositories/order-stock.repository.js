import {one,rows} from './database.js';
export const source=(c,id)=>one(c,'SELECT miller_id,season_id FROM cmr_orders WHERE id=?',[id]);
export const masters=(c,s)=>one(c,"SELECT f.id FROM facilities f JOIN seasons se ON se.id=? WHERE f.id=? AND f.kind='MILLER'",[s.season_id,s.miller_id],false);
export const lockOrder=(c,id)=>one(c,'SELECT id,miller_id,season_id,scheme_code,commodity,status,rice_quantity_kg,stock_credited_kg FROM cmr_orders WHERE id=? FOR UPDATE',[id]);
export const setCredit=(c,target,id)=>rows(c,'UPDATE cmr_orders SET stock_credited_kg=? WHERE id=?',[target,id]);
export const allocated=(c,id)=>one(c,"SELECT COALESCE(SUM(quantity_kg),0) kg FROM shipments WHERE order_id=? AND status<>'CANCELLED'",[id]);
