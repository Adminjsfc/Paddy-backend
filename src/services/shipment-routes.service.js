import * as repository from '../repositories/shipment-routes.repository.js';
import {computeDrivingRoute} from './google-routes.service.js';
import {ensure} from '../utils/core.js';

export function routeDetails(route) {
  if(!route)return null;
  return {...route,geometry:typeof route.geometry==='string'?JSON.parse(route.geometry):route.geometry,
    distance_km:route.distance_km==null?null:Number(route.distance_km),
    duration_minutes:route.duration_minutes==null?null:Number(route.duration_minutes)};
}
export function expectedArrival(dispatchedAt,route) {
  return route?.duration_minutes!=null?new Date(new Date(dispatchedAt).getTime()+Number(route.duration_minutes)*60000):null;
}
export async function planRoute(connection,sourceId,destinationId,actorId=null) {
  const existing=await repository.findPlan(connection,sourceId,destinationId);
  if(existing){
    if(existing.geometry)return routeDetails(existing);
  }
  const points=await repository.facilities(connection,sourceId,destinationId);
  const source=points.find(p=>Number(p.id)===Number(sourceId)),destination=points.find(p=>Number(p.id)===Number(destinationId));
  ensure(source && destination,'Route facilities not found','INVALID_ROUTE',422);
  const route=await computeDrivingRoute(source,destination);
  if(existing)await repository.completePlan(connection,existing.id,route,actorId);
  else await repository.savePlan(connection,source,destination,route,actorId);
  return routeDetails(await repository.findPlan(connection,sourceId,destinationId));
}
export async function shipmentRoute(connection,id) {return routeDetails(await repository.findShipment(connection,id));}
