import {pool} from '../config/database.js';
import {one,rows} from './database.js';

// Procurement is the report source; route tags only enrich each receipt with Miller mappings.
export async function sourceProcurementReport(sourceId,seasonId,{limit,offset},schemeCode=null) {
  const args=[sourceId,...(seasonId?[seasonId]:[]),...(schemeCode?[schemeCode]:[])];
  const filter=`WHERE p.facility_id=? AND p.commodity_code='PADDY'${seasonId?' AND p.season_id=?':''}${schemeCode?' AND p.scheme_code=?':''}`;
  const totals=await one(pool,`SELECT COUNT(p.id) procurement_count,
    COALESCE(SUM(p.quantity_g),0) quantity_g,COALESCE(SUM(p.available_g),0) available_g,
    COALESCE(SUM(p.reserved_g),0) reserved_g,COALESCE(SUM(p.available_g-p.reserved_g),0) unreserved_g
    FROM procurement p ${filter}`,args);
  const data=await rows(pool,`SELECT p.id,p.external_ref,p.facility_id,p.facility_id source_id,
    src.name source_name,src.code source_code,p.season_id,se.name season_name,p.scheme_code,p.commodity_code,
    p.farmer_id,p.procured_at,p.quantity_g,p.available_g,p.reserved_g,p.available_g-p.reserved_g unreserved_g,
    p.moisture_percent,p.receipt_no,p.created_at
    FROM procurement p JOIN facilities src ON src.id=p.facility_id JOIN seasons se ON se.id=p.season_id
    ${filter} ORDER BY p.procured_at DESC,p.id DESC LIMIT ${limit} OFFSET ${offset}`,args);
  const bySeason=new Map();
  if(data.length) {
    const seasons=[...new Set(data.map(row=>Number(row.season_id)))];
    const mappings=await rows(pool,`SELECT r.id route_tag_id,r.season_id,m.id miller_id,m.name miller_name,m.address miller_address
      FROM route_tags r JOIN facilities m ON m.id=r.destination_id AND m.kind='MILLER' AND m.active=1
      WHERE r.source_id=? AND r.active=1 AND r.season_id IN (${seasons.map(()=>'?').join(',')})
      ORDER BY m.name,m.id,r.id`,[sourceId,...seasons]);
    for(const mapping of mappings) {
      const season=Number(mapping.season_id);
      if(!bySeason.has(season))bySeason.set(season,new Map());
      const group=bySeason.get(season);
      if(!group.has(Number(mapping.miller_id))) {
        const {season_id,...details}=mapping;
        group.set(Number(mapping.miller_id),details);
      }
    }
  }
  for(const row of data) {
    row.procurement_ids=[Number(row.id)];
    row.mapped_millers=[...(bySeason.get(Number(row.season_id))?.values()||[])].map(mapping=>({...mapping}));
    row.has_route_tag=row.mapped_millers.length>0;
  }
  return {data,totals,total:Number(totals.procurement_count)};
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
