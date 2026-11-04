import {ensure,id,pageParams} from '../utils/core.js';
import * as repository from '../repositories/miller-mappings.repository.js';

export async function listSourceMappings(context) {
  ensure(['PACS','LAMPS'].includes(context.user.role)&&context.user.facility_id,
    'PACS/LAMPS facility is required','FORBIDDEN',403);
  const sourceId=id.parse(Number(context.user.facility_id));
  ensure(context.query.facility_id===undefined||Number(context.query.facility_id)===sourceId,
    'Cannot view another facility mappings','FORBIDDEN',403);
  const seasonId=context.query.season_id?id.parse(Number(context.query.season_id)):null;
  const pagination=pageParams(context.query);
  const result=await repository.listSourceMappings(sourceId,seasonId,pagination);
  return {body:{ok:true,data:result.data,
    pagination:{page:pagination.page,limit:pagination.limit,total:result.total}}};
}

export async function listMappings(context) {
  ensure(context.user.role==='MILLER'&&context.user.miller_id,'Miller facility is required','FORBIDDEN',403);
  const type=context.query.type||'PACS';
  ensure(['PACS','DEPOT'].includes(type),'type must be PACS or DEPOT','VALIDATION',400);
  const seasonId=context.query.season_id?id.parse(Number(context.query.season_id)):null;
  const pagination=pageParams(context.query);
  const result=await repository.listMappings(context.user.miller_id,type,seasonId,pagination);
  return {body:{ok:true,data:result.data,pagination:{page:pagination.page,limit:pagination.limit,total:result.total}}};
}
