// Read-only preview unless --apply is supplied. All adjustments are append-only.
import fs from 'node:fs/promises';
import {pool} from '../src/config/database.js';
import {transaction} from '../src/utils/transaction.js';
import {syncOrderStock} from '../src/services/order-stock.service.js';
import {lockFacilities} from '../src/repositories/facilities.repository.js';
import {stock} from '../src/services/stock.service.js';
import {rows,one} from '../src/repositories/database.js';
import {addKg} from '../src/utils/core.js';
const apply=process.argv.includes('--apply');
try{
  const orders=await rows(pool,"SELECT o.id,o.rice_quantity_kg,o.stock_credited_kg,o.status FROM cmr_orders o JOIN facilities f ON f.id=o.miller_id AND f.kind='MILLER' JOIN seasons se ON se.id=o.season_id WHERE o.stock_credited_kg<>CASE WHEN o.status='CANCELLED' THEN 0 ELSE o.rice_quantity_kg END ORDER BY o.miller_id,o.id");
  const balances=await rows(pool,`SELECT b.id,b.facility_id,b.season_id,b.scheme_code,b.commodity_code,b.reserved_kg,
    COALESCE((SELECT SUM(s.quantity_kg) FROM shipments s JOIN shipment_routes r ON r.id=s.route_id WHERE r.source_id=b.facility_id AND s.season_id=b.season_id AND s.scheme_code=b.scheme_code AND (CASE WHEN s.leg='PADDY' THEN 'PADDY' ELSE 'RICE' END)=b.commodity_code AND s.status='PLANNED'),0) expected_reserved_kg
    FROM stocks b ORDER BY b.facility_id,b.id`);
  const reservations=balances.filter(b=>Number(b.reserved_kg)!==Number(b.expected_reserved_kg));
  const report={apply,orders,reservations};
  if(apply){
    await fs.mkdir('.backups',{recursive:true});
    await fs.writeFile('.backups/document-stock-before-'+Date.now()+'.json',JSON.stringify(report,null,2));
    await transaction(async c=>{
      for(const b of reservations){
        await lockFacilities(c,[b.facility_id]);
        const current=await one(c,'SELECT reserved_kg FROM stocks WHERE id=? FOR UPDATE',[b.id]);
        const expected=await one(c,`SELECT COALESCE(SUM(s.quantity_kg),0) kg FROM shipments s JOIN shipment_routes r ON r.id=s.route_id
          WHERE r.source_id=? AND s.season_id=? AND s.scheme_code=? AND (CASE WHEN s.leg='PADDY' THEN 'PADDY' ELSE 'RICE' END)=? AND s.status='PLANNED'`,[b.facility_id,b.season_id,b.scheme_code,b.commodity_code]);
        const delta=addKg(expected.kg,-current.reserved_kg);
        if(delta)await stock(c,b.facility_id,b.season_id,b.commodity_code,0,delta,'RESERVATION_RECONCILIATION',b.id,b.scheme_code);
      }
      // Keep RO allocation counters consistent with the same planned shipments.
      await rows(c,`UPDATE procurement p SET reserved_kg=(SELECT COALESCE(SUM(l.quantity_kg),0) FROM shipment_lots l JOIN shipments s ON s.id=l.shipment_id WHERE l.procurement_id=p.id AND s.status='PLANNED')`);
      for(const order of orders)await syncOrderStock(c,order.id);
    });
  }
  console.log(JSON.stringify({apply,orders_to_credit:orders.length,reservations_to_adjust:reservations.length}));
}finally{await pool.end();}
