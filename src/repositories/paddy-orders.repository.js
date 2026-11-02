import {pool} from '../config/database.js';
import {one,rows} from './database.js';

// Source balances are shared by all mapped millers; aggregate them before joining mappings.
export async function sourceLiftingSummary(sourceId,seasonId,{limit,offset},schemeCode=null) {
  const args=[sourceId,...(seasonId?[seasonId]:[]),...(schemeCode?[schemeCode]:[])];
  const balances=`SELECT p.facility_id source_id,p.season_id,p.scheme_code,SUM(p.quantity_g) target_g
    FROM procurement p
    WHERE p.facility_id=?${seasonId?' AND p.season_id=?':''} AND p.commodity_code='PADDY'${schemeCode?' AND p.scheme_code=?':''}
    GROUP BY p.facility_id,p.season_id,p.scheme_code`;
  const lifted=`SELECT source_id,season_id,scheme_code,destination_id,SUM(quantity_g) lifted_g
    FROM shipment_details WHERE leg='PADDY' AND status IN ('DISPATCHED','IN_TRANSIT','ARRIVED','DELIVERED')
    GROUP BY source_id,season_id,scheme_code,destination_id`;
  const sourceBalances=`SELECT b.source_id,b.season_id,b.scheme_code,b.target_g,COALESCE(l.lifted_g,0) source_lifted_g,
    b.target_g-COALESCE(l.lifted_g,0) pending_g FROM (${balances}) b
    LEFT JOIN (SELECT source_id,season_id,scheme_code,SUM(lifted_g) lifted_g FROM (${lifted}) lifted
      GROUP BY source_id,season_id,scheme_code) l
      ON l.source_id=b.source_id AND l.season_id=b.season_id AND l.scheme_code=b.scheme_code`;
  const totals=await one(pool,`SELECT COALESCE(SUM(target_g),0) target_g,
    COALESCE(SUM(source_lifted_g),0) lifted_g,COALESCE(SUM(pending_g),0) pending_g FROM (${sourceBalances}) balances`,args);
  const base=`FROM (${sourceBalances}) b
    JOIN facilities src ON src.id=b.source_id
    JOIN (SELECT DISTINCT source_id,destination_id,season_id FROM route_tags WHERE active=1) r
      ON r.source_id=b.source_id AND r.season_id=b.season_id
    JOIN facilities m ON m.id=r.destination_id AND m.kind='MILLER' AND m.active=1
    LEFT JOIN (${lifted}) l ON l.source_id=b.source_id AND l.season_id=b.season_id
      AND l.scheme_code=b.scheme_code AND l.destination_id=m.id`;
  const count=await one(pool,`SELECT COUNT(m.id) total ${base}`,args);
  const data=await rows(pool,`SELECT b.source_id,b.season_id,b.scheme_code,b.target_g,b.source_lifted_g,b.pending_g,src.name source_name,src.code source_code,
    m.id miller_id,m.name miller_name,m.address miller_address,
    COALESCE(l.lifted_g,0) lifted_g ${base}
    ORDER BY m.name,m.id,b.scheme_code,b.season_id DESC LIMIT ${limit} OFFSET ${offset}`,args);
  return {data,totals,total:count.total};
}

export async function listMappedSources(millerId,seasonId,{limit,offset},schemeCode=null) {
  const args=[millerId,...(seasonId?[seasonId]:[]),...(schemeCode?[schemeCode]:[])];
  const base=`SELECT f.id source_id,f.code,f.kind,f.name source_name,f.address,
    d.district_name,m.season_id,se.name season_name,st.scheme_code,st.commodity_code,
    COALESCE(st.on_hand_g,0) on_hand_g,COALESCE(st.reserved_g,0) reserved_g,
    CASE WHEN st.status=1 THEN st.on_hand_g-st.reserved_g ELSE 0 END available_g,
    COALESCE((SELECT SUM(p.quantity_g) FROM procurement p WHERE p.facility_id=f.id AND p.season_id=m.season_id AND p.scheme_code=st.scheme_code),0) procured_g,
    COALESCE((SELECT SUM(l.quantity_g) FROM shipment_details l
      WHERE l.source_id=f.id AND l.destination_id=m.destination_id AND l.season_id=m.season_id
      AND l.scheme_code=st.scheme_code AND l.leg='PADDY' AND l.status IN ('DISPATCHED','IN_TRANSIT','ARRIVED','DELIVERED')),0) lifted_g
    FROM (SELECT DISTINCT source_id,destination_id,season_id FROM route_tags WHERE active=1 AND destination_id=?${seasonId?' AND season_id=?':''}) m
    JOIN facilities f ON f.id=m.source_id AND f.kind IN ('PACS','LAMPS')
    JOIN seasons se ON se.id=m.season_id
    LEFT JOIN tbl_district_master d ON d.id=f.district_id
    LEFT JOIN stocks st ON st.facility_id=f.id AND st.season_id=m.season_id AND st.commodity_code='PADDY'${schemeCode?' WHERE st.scheme_code=?':''}`;
  const totals=await one(pool,`SELECT COUNT(*) total,COALESCE(SUM(procured_g),0) procured_g,
    COALESCE(SUM(available_g),0) available_g,COALESCE(SUM(reserved_g),0) reserved_g,
    COALESCE(SUM(lifted_g),0) lifted_g FROM (${base}) summary`,args);
  const data=await rows(pool,`SELECT summary.source_id,summary.code,summary.kind,summary.source_name,summary.address,summary.district_name,summary.season_id,summary.season_name,summary.scheme_code,summary.commodity_code,summary.on_hand_g,summary.reserved_g,summary.available_g,summary.procured_g,summary.lifted_g,available_g liftable_g FROM (${base}) summary
    ORDER BY source_name,source_id,season_id DESC,scheme_code LIMIT ${limit} OFFSET ${offset}`,args);
  return {data,totals};
}

export const mappedMillers=(sourceId,seasonId)=>rows(pool,`SELECT DISTINCT f.id miller_id,f.name miller_name,r.season_id
 FROM route_tags r JOIN facilities f ON f.id=r.destination_id AND f.kind='MILLER' AND f.active=1
 WHERE r.source_id=? AND r.season_id=? AND r.active=1 ORDER BY f.name,f.id`,[sourceId,seasonId]);
export const mappedMiller=(sourceId,millerId,seasonId)=>one(pool,`SELECT r.id FROM route_tags r
 JOIN facilities f ON f.id=r.destination_id AND f.kind='MILLER' AND f.active=1
 WHERE r.source_id=? AND r.destination_id=? AND r.season_id=? AND r.active=1 LIMIT 1`,[sourceId,millerId,seasonId],false);
export const mappedVehicles=()=>rows(pool,`SELECT v.id,v.registration_no,v.capacity_g,v.transporter_name,v.transporter_contact_no,v.district_id FROM vehicles v
 WHERE v.active=1 ORDER BY v.registration_no`);
export const lockVehicle=(connection,registration)=>one(connection,`SELECT v.id,v.transporter_name,v.transporter_contact_no,v.district_id,v.vehicle_type_id,v.registration_no,v.capacity_g,v.active,v.created_by,v.created_at,v.updated_by,v.updated_at,v.mapping_status,v.status_updated_at
 FROM vehicles v WHERE v.registration_no=? FOR UPDATE`,[registration],false);
export const facility=id=>one(pool,`SELECT f.id,f.name,f.district_id,d.district_name FROM facilities f
 LEFT JOIN tbl_district_master d ON d.id=f.district_id WHERE f.id=? AND f.active=1`,[id]);
