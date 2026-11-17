import polyline from '@mapbox/polyline';
import {distanceMeters} from './core.js';
const round=value=>Math.round(value*1000)/1000;
export const numberOrNull=value=>value==null||value===''||!Number.isFinite(Number(value))?null:Number(value);
export function validPoint(p){return p&&numberOrNull(p.lat)!=null&&numberOrNull(p.lng)!=null&&Math.abs(Number(p.lat))<=90&&Math.abs(Number(p.lng))<=180&&!(Number(p.lat)===0&&Number(p.lng)===0);}
export function routePoints(trip){
  try{
    if(trip.encoded_polyline)return polyline.decode(trip.encoded_polyline).map(([lat,lng])=>({lat,lng}));
    const geometry=typeof trip.geometry==='string'?JSON.parse(trip.geometry):trip.geometry;
    return (geometry?.coordinates||[]).map(([lng,lat])=>({lat,lng}));
  }catch{return [];}
}
export function gpsPoints(rows){
  return rows.flatMap(row=>{
    const p={lat:numberOrNull(row.latitude),lng:numberOrNull(row.longitude)};
    if(!validPoint(p)||!Number.isFinite(new Date(row.gps_at).getTime()))return [];
    let raw={};try{raw=typeof row.raw_payload==='string'?JSON.parse(row.raw_payload):row.raw_payload||{};}catch{}
    if(raw.gps_fix===false||raw.gps_fix===0)return [];
    const ignition=raw.ignition??raw.ignition_status;
    return [{latitude:p.lat,longitude:p.lng,speed:numberOrNull(row.speed_kph),ignition:ignition==null?null:typeof ignition==='boolean'?(ignition?'1':'0'):String(ignition),gps_timestamp:new Date(row.gps_at).toISOString(),packet_type:row.packet_type}];
  });
}
function projection(points,p){
  if(points.length<2||!validPoint(p))return null;
  let nearest=Infinity,along=0,total=0;
  const cos=Math.cos(Number(p.lat)*Math.PI/180),kx=111.32*cos,ky=111.32;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];if(!validPoint(a)||!validPoint(b))continue;
    const x=(b.lng-a.lng)*kx,y=(b.lat-a.lat)*ky,px=(p.lng-a.lng)*kx,py=(p.lat-a.lat)*ky;
    const ratio=x*x+y*y?Math.max(0,Math.min(1,(px*x+py*y)/(x*x+y*y))):0;
    const segment=distanceMeters(a.lat,a.lng,b.lat,b.lng)/1000;
    const gap=Math.hypot(px-ratio*x,py-ratio*y);
    if(gap<nearest){nearest=gap;along=total+segment*ratio;}total+=segment;
  }
  return total>0?{fraction:along/total,gap:nearest}:null;
}
export function summarizeRoute(trip,location,packets,{complete=true,now=Date.now()}={}){
  const planned=routePoints(trip),points=gpsPoints(packets),status=Number(trip.trip_status);
  const total=numberOrNull(trip.distance_km);
  let travelled=null,percentage=null,remaining=null,positionGap=null;
  if(status===0){travelled=0;percentage=0;remaining=total;}
  else if(status===2&&total!=null){travelled=total;percentage=100;remaining=0;}
  else{
    const match=projection(planned,{lat:location?.latitude,lng:location?.longitude});
    if(match){positionGap=round(match.gap);if(match.gap<=1&&total!=null){travelled=round(total*match.fraction);percentage=round(match.fraction*100);remaining=round(Math.max(0,total-travelled));}}
  }
  let actual=null;
  if(complete&&points.length>=2){actual=0;for(let i=1;i<points.length;i++)actual+=distanceMeters(points[i-1].latitude,points[i-1].longitude,points[i].latitude,points[i].longitude)/1000;actual=round(actual);}
  const speeds=points.map(p=>p.speed).filter(v=>v!=null&&v>=0);
  const average=complete&&speeds.length?round(speeds.reduce((a,b)=>a+b,0)/speeds.length):null;
  const max=complete&&speeds.length?Math.max(...speeds):null;
  const minutes=remaining===0?0:remaining!=null&&average>1?Math.ceil(remaining/average*60):null;
  const fresh=location?.last_location_update&&location.stale!==true&&now-new Date(location.last_location_update).getTime()<=15*60000&&now>=new Date(location.last_location_update).getTime();
  return {total_distance:total,travelled_distance:travelled,actual_travelled_distance:actual,remaining_distance:remaining,percentage,
    average_speed:average,max_speed:max,estimated_remaining_minutes:minutes,
    calculated_expected_delivery_time:status===1&&fresh&&minutes!=null?new Date(now+minutes*60000).toISOString():null,
    polyline:planned,gps_route_points:points,position_distance_from_route_km:positionGap,history_complete:complete,
    distance_unit:'KM',speed_unit:'KM/H',duration_unit:'MINUTES'};
}
