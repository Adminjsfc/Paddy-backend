import {pool} from '../config/database.js';
import {rows} from './database.js';

export function setupContexts(selectors) {
  const clauses=[],args=[];
  for(const [key,column] of Object.entries({season_code:'se.code',miller_code:'m.code',destination_code:'d.code',source_code:'src.code'})){
    if(selectors[key]){clauses.push(`${column}=?`);args.push(selectors[key]);}
  }
  return rows(pool,`SELECT DISTINCT se.id season_id,se.code season_code,se.start_date,se.end_date,
    m.id miller_id,m.code miller_code,m.name miller_name,
    d.id destination_id,d.code destination_code,d.name destination_name,d.kind destination_kind,
    d.district_id,dm.district_name,dm.status district_active,d.core_store_id store_location_id,
    src.id pacs_id,src.code pacs_code,src.kind source_kind,src.district_id source_district_id
    FROM miller_store_assignments a
    JOIN seasons se ON se.id=a.season_id AND se.active=1
    JOIN facilities m ON m.id=a.miller_id AND m.kind='MILLER' AND m.active=1
    JOIN facilities d ON d.id=a.store_id AND d.kind IN ('SFC_GODOWN','FCI') AND d.active=1
    LEFT JOIN tbl_district_master dm ON dm.id=d.district_id
    LEFT JOIN route_tags rt ON rt.destination_id=m.id AND rt.season_id=se.id AND rt.active=1
    LEFT JOIN facilities src ON src.id=rt.source_id AND src.kind IN ('PACS','LAMPS') AND src.active=1
    WHERE a.active=1${clauses.length?' AND '+clauses.join(' AND '):''}
    ORDER BY se.id DESC,m.id,d.id,src.id LIMIT 101`,args);
}

export function setupVehicles(vehicleNo) {
  return rows(pool,`SELECT v.id vehicle_id,v.registration_no vehicle_no,v.vehicle_type_id,
    i.id imei_id,i.imei,d.id device_id,
    EXISTS(SELECT 1 FROM shipments s WHERE s.vehicle_id=v.id
      AND s.status IN ('PLANNED','DISPATCHED','IN_TRANSIT','ARRIVED')) busy
    FROM vehicles v JOIN gps_devices d ON d.vehicle_id=v.id AND d.active=1
    JOIN imeis i ON i.id=d.imei_id AND i.active=1 WHERE v.active=1
    ${vehicleNo?' AND UPPER(TRIM(v.registration_no))=?':''}
    ORDER BY v.id LIMIT 101`,vehicleNo?[vehicleNo]:[]);
}
