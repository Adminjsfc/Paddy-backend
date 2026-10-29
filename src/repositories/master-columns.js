// Public master response fields are explicit and independent of runtime schema changes.
const fields = {
  "schemes": "id,code,scheme_name,description,active,created_by,created_at,updated_by,updated_at",
  "commodities": "id,code,commodity_name,description,active,created_by,created_at,updated_by,updated_at",
  "imeis": "id,imei,provider,district_id,block_id,active,created_by,created_at,updated_by,updated_at,mapping_status,status_updated_at",
  "seasons": "id,code,name,start_date,end_date,recovery_percent,active,created_by,created_at,updated_by,updated_at",
  "facilities": "id,code,kind,name,address,district_id,block_id,latitude,longitude,radius_m,capacity_g,milling_capacity_g_per_day,recovery_percent,contact_name,phone,active,created_by,created_by_core_user_id,created_by_user_type,created_at,updated_by,updated_at,core_store_id",
  "farmers": "id,code,name,phone,village,district_id,block_id,active,created_by,created_at,updated_by,updated_at",
  "transporters": "id,miller_id,code,name,contact_name,phone,address,district_id,block_id,active,created_by,created_at,updated_by,updated_at",
  "vehicles": "id,transporter_id,miller_id,vehicle_type_id,registration_no,capacity_g,active,created_by,created_at,updated_by,updated_at,mapping_status,status_updated_at",
  "vehicle_types": "id,code,name,active,created_by,created_at,updated_by,updated_at",
  "gps_devices": "id,vehicle_id,imei_id,district_id,block_id,model,sim_no,active,created_by,created_at,updated_by,updated_at,last_gps_at,latitude,longitude,speed_kph",
  "route_tags": "id,season_id,source_id,destination_id,active,created_by,created_at,unassigned_by,unassigned_at"
};
export function masterColumns(table,alias='x') {
  if(!Object.hasOwn(fields,table))throw new Error('Unsupported master table');
  return fields[table].split(',').map(column=>alias+'.'+column).join(',');
}
