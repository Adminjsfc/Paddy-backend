import {pool} from '../config/database.js';
import {one,rows} from './database.js';

export async function listMappedSources(millerId,seasonId,{limit,offset},schemeCode=null) {
  const args=[millerId,...(seasonId?[seasonId]:[]),...(schemeCode?[schemeCode]:[])];
  const base=`SELECT f.id source_id,f.code,f.kind,f.name source_name,f.address,
    d.district_name,b.block_name,m.season_id,se.name season_name,st.scheme_id,st.commodity_id,sc.code scheme_code,
    COALESCE(st.on_hand_g,0) on_hand_g,COALESCE(st.reserved_g,0) reserved_g,
    CASE WHEN st.status=1 THEN st.on_hand_g-st.reserved_g ELSE 0 END available_g,
    COALESCE((SELECT SUM(p.quantity_g) FROM procurement p WHERE p.facility_id=f.id AND p.season_id=m.season_id AND p.scheme_id=st.scheme_id),0) procured_g,
    COALESCE((SELECT SUM(l.quantity_g) FROM shipments l
      WHERE l.source_id=f.id AND l.destination_id=m.destination_id AND l.season_id=m.season_id
      AND l.scheme_id=st.scheme_id AND l.leg='PADDY' AND l.status IN ('DISPATCHED','IN_TRANSIT','ARRIVED','DELIVERED')),0) lifted_g
    FROM (SELECT DISTINCT source_id,destination_id,season_id FROM route_tags WHERE active=1 AND destination_id=?${seasonId?' AND season_id=?':''}) m
    JOIN facilities f ON f.id=m.source_id AND f.kind IN ('PACS','LAMPS')
    JOIN seasons se ON se.id=m.season_id
    LEFT JOIN tbl_district_master d ON d.id=f.district_id LEFT JOIN tbl_block_master b ON b.id=f.block_id
    LEFT JOIN stocks st ON st.facility_id=f.id AND st.season_id=m.season_id AND st.commodity_id=(SELECT id FROM commodities WHERE code='PADDY')
    LEFT JOIN schemes sc ON sc.id=st.scheme_id${schemeCode?' WHERE sc.code=?':''}`;
  const totals=await one(pool,`SELECT COUNT(*) total,COALESCE(SUM(procured_g),0) procured_g,
    COALESCE(SUM(available_g),0) available_g,COALESCE(SUM(reserved_g),0) reserved_g,
    COALESCE(SUM(lifted_g),0) lifted_g FROM (${base}) summary`,args);
  const data=await rows(pool,`SELECT summary.*,available_g liftable_g FROM (${base}) summary
    ORDER BY source_name,source_id,season_id DESC,scheme_code LIMIT ${limit} OFFSET ${offset}`,args);
  return {data,totals};
}

export const mappedMillers=(sourceId,seasonId)=>rows(pool,`SELECT DISTINCT f.id miller_id,f.name miller_name,r.season_id
 FROM route_tags r JOIN facilities f ON f.id=r.destination_id AND f.kind='MILLER' AND f.active=1
 WHERE r.source_id=? AND r.season_id=? AND r.active=1 ORDER BY f.name,f.id`,[sourceId,seasonId]);
export const mappedMiller=(sourceId,millerId,seasonId)=>one(pool,`SELECT r.id FROM route_tags r
 JOIN facilities f ON f.id=r.destination_id AND f.kind='MILLER' AND f.active=1
 WHERE r.source_id=? AND r.destination_id=? AND r.season_id=? AND r.active=1 LIMIT 1`,[sourceId,millerId,seasonId],false);
export const mappedVehicles=millerId=>rows(pool,`SELECT v.id,v.registration_no,v.capacity_g FROM vehicles v
 LEFT JOIN transporters t ON t.id=v.transporter_id
 WHERE v.active=1 AND COALESCE(t.active,1)=1 AND COALESCE(v.miller_id,t.miller_id)=? ORDER BY v.registration_no`,[millerId]);
export const lockVehicle=(connection,registration)=>one(connection,`SELECT v.*,COALESCE(v.miller_id,t.miller_id) owner_miller_id
 FROM vehicles v LEFT JOIN transporters t ON t.id=v.transporter_id WHERE v.registration_no=? FOR UPDATE`,[registration],false);
export const facility=id=>one(pool,`SELECT f.id,f.name,f.district_id,d.district_name FROM facilities f
 LEFT JOIN tbl_district_master d ON d.id=f.district_id WHERE f.id=? AND f.active=1`,[id]);
