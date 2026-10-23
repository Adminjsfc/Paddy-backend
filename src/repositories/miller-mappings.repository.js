import {pool} from '../config/database.js';
import {one,rows} from './database.js';

export async function listMappings(millerId,type,seasonId,{limit,offset}) {
  const mapping=type==='PACS'?'SELECT id,source_id facility_id,season_id,created_at FROM route_tags WHERE destination_id=? AND active=1':'SELECT id,store_id facility_id,season_id,created_at FROM miller_store_assignments WHERE miller_id=? AND active=1';
  const args=[millerId,...(seasonId?[seasonId]:[])];
  const base=`FROM (${mapping}) a JOIN facilities f ON f.id=a.facility_id
    JOIN seasons se ON se.id=a.season_id
    LEFT JOIN tbl_district_master d ON d.id=f.district_id LEFT JOIN tbl_block_master b ON b.id=f.block_id
    WHERE f.kind IN (${type==='PACS'?"'PACS','LAMPS'":"'SFC_GODOWN','FCI'"})${seasonId?' AND a.season_id=?':''}`;
  const count=await one(pool,`SELECT COUNT(*) total ${base}`,args);
  const data=await rows(pool,`SELECT a.id mapping_id,a.season_id,a.created_at mapped_at,se.name season_name,
    f.id,f.code,f.name,f.kind,f.address,f.active,f.contact_name,f.phone,f.latitude,f.longitude,f.radius_m,f.capacity_g,
    d.district_name,b.block_name ${base} ORDER BY f.name,a.season_id DESC,a.id LIMIT ${limit} OFFSET ${offset}`,args);
  return {data,total:count.total};
}
