import polyline from '@mapbox/polyline';
import {Client} from '@googlemaps/google-maps-services-js';
import {AppError,ensure} from '../utils/core.js';
const client=new Client({});

export function decodePolyline(encoded) {
  let geometry;
  try {
    ensure(typeof encoded==='string' && /^[?-~]+$/.test(encoded),'Invalid Google route polyline','INVALID_ROUTE_RESPONSE',502);
    geometry=polyline.toGeoJSON(encoded);
    ensure(polyline.fromGeoJSON(geometry)===encoded,'Invalid Google route polyline','INVALID_ROUTE_RESPONSE',502);
  } catch {throw new AppError(502,'INVALID_ROUTE_RESPONSE','Invalid Google route polyline');}
  ensure(geometry.coordinates.length>=2 && geometry.coordinates.every(([lng,lat])=>Number.isFinite(lat) && Math.abs(lat)<=90 && Number.isFinite(lng) && Math.abs(lng)<=180),
    'Google returned invalid route coordinates','INVALID_ROUTE_RESPONSE',502);
  return geometry;
}
function rejected(status) {
  const safe=['REQUEST_DENIED','OVER_DAILY_LIMIT','OVER_QUERY_LIMIT','INVALID_REQUEST'].includes(status)?status:'REQUEST_REJECTED';
  return new AppError(502,'GOOGLE_ROUTES_REJECTED','Google Directions API rejected the request ('+safe+'). Check Directions API, billing and key permissions.');
}
export async function computeDrivingRoute(source,destination,{mapsClient=client,apiKey=process.env.GOOGLE_API_KEY}={}) {
  ensure(apiKey,'Configure GOOGLE_API_KEY in .env','GOOGLE_API_KEY_MISSING',503);
  function point(facility) {
    const lat=Number(facility.latitude),lng=Number(facility.longitude);
    ensure(facility.latitude!=null && facility.longitude!=null && facility.latitude!=='' && facility.longitude!=='' &&
      Number.isFinite(lat) && Math.abs(lat)<=90 && Number.isFinite(lng) && Math.abs(lng)<=180,
      'Source and destination require valid latitude/longitude','INVALID_ROUTE_COORDINATES',422);
    return {lat,lng};
  }
  const params={origin:point(source),destination:point(destination),mode:'driving',units:'metric',alternatives:false,key:apiKey};
  let response;
  try {response=await mapsClient.directions({params,timeout:10000});}
  catch(error) {
    if(error.response)throw rejected(error.response.data?.status);
    throw new AppError(502,'GOOGLE_ROUTES_UNAVAILABLE','Google Directions request failed or timed out. Retry lifting.');
  }
  const data=response.data;
  ensure(data && typeof data.status==='string','Google returned an invalid response','INVALID_ROUTE_RESPONSE',502);
  ensure(!['ZERO_RESULTS','NOT_FOUND'].includes(data.status),'No driving route found between source and destination','ROUTE_NOT_FOUND',422);
  if(data.status!=='OK')throw rejected(data.status);
  const route=data.routes?.[0];
  ensure(route && Array.isArray(route.legs) && route.legs.length>0 && typeof route.overview_polyline?.points==='string',
    'Google returned incomplete route data','INVALID_ROUTE_RESPONSE',502);
  let distance=0,seconds=0;
  for(const leg of route.legs) {
    ensure(Number.isFinite(leg.distance?.value) && leg.distance.value>=0 && Number.isFinite(leg.duration?.value) && leg.duration.value>=0,
      'Google returned invalid distance or duration','INVALID_ROUTE_RESPONSE',502);
    distance+=leg.distance.value;seconds+=leg.duration.value;
  }
  const encoded=route.overview_polyline.points;
  return {encoded_polyline:encoded,geometry:decodePolyline(encoded),distance_km:Math.round(distance)/1000,duration_minutes:Math.ceil(seconds/60)};
}
