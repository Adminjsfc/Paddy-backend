import {ensure,id,code,pageParams} from '../utils/core.js';
import * as repository from '../repositories/paddy-orders.repository.js';

export async function listMappedSources(context) {
  ensure(context.user.role==='MILLER'&&context.user.miller_id,'Miller facility is required','FORBIDDEN',403);
  const pagination=pageParams(context.query);
  const seasonId=context.query.season_id?id.parse(Number(context.query.season_id)):null;
  const {data,totals}=await repository.listMappedSources(context.user.miller_id,seasonId,pagination,context.query.scheme_code?code.parse(context.query.scheme_code):null);
  return {body:{ok:true,data,totals,pagination:{page:pagination.page,limit:pagination.limit,total:totals.total}}};
}

export function validateMappedVehicle(vehicle,millerId) {
  ensure(vehicle&&Number(vehicle.active)===1,
    'Select an active registered vehicle','INVALID_VEHICLE',400);
}
function liftingSource(user) {
  ensure(['PACS','LAMPS'].includes(user.role)&&user.facility_id,'PACS/LAMPS facility is required','FORBIDDEN',403);
  return user.facility_id;
}
export async function sourceLiftingSummary(context) {
  const sourceId=liftingSource(context.user);
  const seasonId=context.query.season_id?id.parse(Number(context.query.season_id)):null;
  const pagination=pageParams(context.query);
  const scheme=context.query.scheme_code?code.parse(context.query.scheme_code):null;
  const result=await repository.sourceProcurementReport(sourceId,seasonId,pagination,scheme);
  return {body:{ok:true,data:result.data,totals:result.totals,quantity_scope:'SOURCE_PROCUREMENT',
    pagination:{page:pagination.page,limit:pagination.limit,total:result.total}}};
}
export async function liftingMillers(context) {
  const sourceId=liftingSource(context.user),seasonId=id.parse(Number(context.query.season_id));
  return {body:{ok:true,data:await repository.mappedMillers(sourceId,seasonId)}};
}
export async function liftingVehicles(context) {
  const sourceId=liftingSource(context.user);
  const millerId=id.parse(Number(context.query.miller_id)),seasonId=id.parse(Number(context.query.season_id));
  ensure(await repository.mappedMiller(sourceId,millerId,seasonId),'Miller is not mapped to your facility for this season','FORBIDDEN',403);
  return {body:{ok:true,data:await repository.mappedVehicles(millerId)}};
}
