import {z} from 'zod';
import {ensure,code} from '../utils/core.js';
import * as repository from '../repositories/postman-setup.repository.js';

const selectors=z.object({season_code:code.optional(),miller_code:code.optional(),
  destination_code:code.optional(),source_code:code.optional(),
  vehicle_no:z.string().trim().toUpperCase().min(3).max(32).optional()}).strict();

export async function postmanSetup(context) {
  ensure(['ADMIN','OPERATOR'].includes(context.user.role),'Setup requires administrator/operator access','FORBIDDEN',403);
  const query=selectors.parse(context.query);
  const [contexts,vehicles]=await Promise.all([repository.setupContexts(query),repository.setupVehicles(query.vehicle_no)]);
  const selected=contexts.length===1?contexts[0]:null;
  const available=vehicles.filter(v=>Number(v.busy)===0);
  const vehicle=available.length===1?available[0]:null;
  const missing=[];
  if(!contexts.length)missing.push('No matching active season/Miller/depot assignment. Create or activate the master records and Miller-store assignment first.');
  else if(!selected)missing.push('Multiple setups found. Select season_code, miller_code, destination_code and source_code from contexts, then reload.');
  if(selected&&(!selected.district_id||Number(selected.district_active)!==1))missing.push('Destination requires an active local district master.');
  if(!available.length)missing.push('No free vehicle with an active vehicle/IMEI mapping. Existing trips may already own the vehicle.');
  else if(!vehicle)missing.push('Select vehicle_no from the free vehicles, then reload.');
  const ready=Boolean(selected&&selected.district_id&&Number(selected.district_active)===1);
  if(selected&&!selected.store_location_id)missing.push('CMR submission requires a linked core store_location_id on the destination facility.');
  return {body:{ok:true,data:{context:selected,contexts,vehicles,vehicle,
    ready_for_orders:ready,ready_for_shipments:ready&&Boolean(vehicle),missing,
    ready_for_cmr_submissions:ready&&Boolean(vehicle)&&Boolean(selected.store_location_id),
    truncated:contexts.length===101||vehicles.length===101}},status:200};
}
