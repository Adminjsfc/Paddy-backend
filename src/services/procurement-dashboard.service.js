import {z} from 'zod';
import {dateOnly,distanceMeters,ensure,id,pageParams} from '../utils/core.js';
import * as repository from '../repositories/procurement-dashboard.repository.js';

const views = ['overview','pacs-lamps-360','miller-360','periodic-mis','fleet-command-room'];
const optionalId = z.preprocess(value => value === undefined ? undefined : Number(value),id.optional());
const querySchema = z.object({
  season_id:optionalId, facility_id:optionalId, miller_id:optionalId, district_id:optionalId,
  period_start:dateOnly.optional(), comparison_start:dateOnly.optional(),
  period_type:z.enum(['MONTH','QUARTER']).default('MONTH')
});
const defaults = {
  ro_count:0, farmer_count:0, centre_count:0, procured_kg:0, stock_available_kg:0, ro_dispatched_kg:0,
  reserved_kg:0, unreserved_kg:0, paddy_dispatched_kg:0, sfc_dispatched_kg:0, trip_count:0,
  vehicle_count:0, paddy_vehicle_count:0, paddy_trip_count:0, cmr_trip_count:0, closed_cmr_trip_count:0,
  trip_sla_eligible:0, trip_sla_met:0, route_sla_eligible:0, route_sla_met:0, escalated_trip_count:0,
  paddy_received_kg:0, sfc_received_kg:0, receipt_dispatched_kg:0,
  shortage_kg:0, received_source_count:0, godown_count:0, processing_miller_count:0,
  processed_kg:0, cmr_output_kg:0, alert_count:0, open_escalations:0
};

function monthOffset(date, months) {
  const day = new Date(date+'T00:00:00Z');
  day.setUTCMonth(day.getUTCMonth()+months);
  return day.toISOString().slice(0,10);
}

function periods(query) {
  const month = new Date().toISOString().slice(0,7)+'-01';
  const quarterMonth = Math.floor((Number(month.slice(5,7))-1)/3)*3+1;
  const first = query.period_start ?? (query.period_type==='QUARTER'
    ? `${month.slice(0,4)}-${String(quarterMonth).padStart(2,'0')}-01` : month);
  const months = query.period_type==='QUARTER'?3:1;
  const prior = query.comparison_start ?? monthOffset(first,-months);
  for(const start of [first,prior]) {
    ensure(start.endsWith('-01')&&(months===1||(Number(start.slice(5,7))-1)%3===0),
      'Use the first day of the selected month or quarter','VALIDATION',400);
  }
  return [{start:first,end:monthOffset(first,months)},{start:prior,end:monthOffset(prior,months)}];
}

function percent(value, base) {
  return base>0?Math.round(value/base*10000)/100:null;
}

function roQuantity(values) {
  return {
    ro_qty_kg:Number(values?.procured_kg??0),
    shipment_qty_kg:Number(values?.ro_dispatched_kg??0),
    available_qty_kg:Number(values?.stock_available_kg??0)
  };
}

function metrics(values, facilityScoped) {
  const data = {...defaults,...values};
  return {...data,
    processed_kg:facilityScoped?null:data.processed_kg,
    cmr_output_kg:facilityScoped?null:data.cmr_output_kg,
    pending_processing_kg:facilityScoped?null:Math.max(0,data.paddy_received_kg-data.processed_kg),
    sfc_received_kg:facilityScoped?null:data.sfc_received_kg,
    sfc_dispatched_kg:facilityScoped?null:data.sfc_dispatched_kg,
    cmr_trip_count:facilityScoped?null:data.cmr_trip_count,
    closed_cmr_trip_count:facilityScoped?null:data.closed_cmr_trip_count,
    procurement_target_kg:null,
    procurement_score_pct:null,
    trip_sla_pct:percent(data.trip_sla_met,data.trip_sla_eligible),
    route_sla_pct:percent(data.route_sla_met,data.route_sla_eligible),
    escalation_rate_pct:percent(data.escalated_trip_count,data.trip_count),
    dispatch_pct:percent(data.paddy_dispatched_kg,data.procured_kg),
    variance_pct:percent(data.shortage_kg,data.receipt_dispatched_kg),
    risk:null
  };
}

function optimizationRows(demand, fleet, scoped) {
  const idle = fleet.filter(vehicle=>vehicle.fleet_status==='IDLE'&&!vehicle.shipment_id&&
    vehicle.latitude!=null&&vehicle.longitude!=null);
  const unitKg={KG:1,QTL:100,MT:1000};
  return demand.map(({latitude,longitude,ready_kg,...row})=>{
    const quantity=Number(ready_kg);
    const nearby=scoped||latitude==null||longitude==null?null:idle.filter(vehicle=>
      distanceMeters(Number(latitude),Number(longitude),Number(vehicle.latitude),Number(vehicle.longitude))<=15000);
    const capacities=nearby?.map(vehicle=>Number(vehicle.capacity_value)*unitKg[vehicle.capacity_unit])
      .filter(capacity=>capacity>0).sort((a,b)=>b-a);
    let covered=0;
    let vehiclesNeeded=0;
    for(const capacity of capacities??[]){
      covered+=capacity;
      vehiclesNeeded++;
      if(covered>=quantity) break;
    }
    const paddy=row.leg==='PADDY';
    return {...row,stage:paddy?2:4,quantity_demand_kg:quantity,
      ready_kg:paddy?quantity:null,nearby_radius_km:15,available_nearby:nearby?.length??null,
      vehicles_needed:paddy&&covered>=quantity?vehiclesNeeded:null,
      recommendation:paddy&&nearby?(covered>=quantity?'REVIEW_ALLOCATION':'REVIEW_CAPACITY'):null};
  });
}

async function report(scope, breakdown, period) {
  const groups = await Promise.all([
    breakdown==='source'?[]:repository.dashboardProcurement(scope,breakdown,period),
    repository.dashboardShipments(scope,breakdown,period),
    repository.dashboardShipments(scope,breakdown,period,true),
    breakdown==='miller'||breakdown==='source'?[]:repository.dashboardMilling(scope,breakdown,period),
    repository.dashboardAlerts(scope,breakdown,period)
  ]);
  const byId = new Map();
  for(const rows of groups) {
    for(const {group_id,...row} of rows) {
      const values = byId.get(group_id)??{};
      for(const [key,value] of Object.entries(row)) values[key]=Number(value??0);
      byId.set(group_id,values);
    }
  }
  return byId;
}

function detailRows(groups, names, idKey, facilityScoped) {
  const byId = new Map(names.map(row=>[Number(row.id),row]));
  return [...groups].map(([groupId,values])=>({
    [idKey]:groupId, name:groupId==null?null:byId.get(Number(groupId))?.name??null,
    ...metrics(values,facilityScoped)
  })).sort((a,b)=>(a.name??'').localeCompare(b.name??''));
}

function scopeFor(user, query, view) {
  const scope = {};
  for(const key of ['facility_id','miller_id','district_id','season_id']) {
    if(query[key]!==undefined) scope[key]=query[key];
  }
  if(['PACS','LAMPS'].includes(user.role)) {
    const facilityId=id.parse(Number(user.facility_id));
    ensure(scope.facility_id===undefined||scope.facility_id===facilityId,
      'Cannot view another facility dashboard','FORBIDDEN',403);
    ensure(view!=='miller-360','Miller 360 requires Admin or Miller access','FORBIDDEN',403);
    scope.facility_id=facilityId;
  }
  if(user.role==='MILLER') {
    const millerId=id.parse(Number(user.miller_id));
    ensure(scope.miller_id===undefined||scope.miller_id===millerId,
      'Cannot view another Miller dashboard','FORBIDDEN',403);
    ensure(view==='miller-360','Miller access is limited to Miller 360','FORBIDDEN',403);
    scope.miller_id=millerId;
  }
  if(view==='pacs-lamps-360') ensure(scope.facility_id,'facility_id is required for PACS/LAMPS 360','VALIDATION',400);
  if(view==='miller-360') ensure(scope.miller_id,'miller_id is required for Miller 360','VALIDATION',400);
  return scope;
}

export async function getProcurementDashboard({user,query}, view) {
  ensure(views.includes(view),'Dashboard view not found','NOT_FOUND',404);
  const input=querySchema.parse(query);
  const scope=scopeFor(user,input,view);
  const [facility,miller]=await Promise.all([
    scope.facility_id?repository.dashboardFacilities([scope.facility_id]).then(rows=>rows[0]):null,
    scope.miller_id?repository.dashboardFacilities([scope.miller_id]).then(rows=>rows[0]):null
  ]);
  if(scope.facility_id) ensure(facility&&['PACS','LAMPS'].includes(facility.kind),'PACS/LAMPS facility not found','NOT_FOUND',404);
  if(scope.miller_id) ensure(miller?.kind==='MILLER','Miller facility not found','NOT_FOUND',404);
  const {page,limit,offset}=pageParams(query);
  if(view==='fleet-command-room') {
    const staleMinutes=Number(process.env.GPS_STALE_MINUTES)||15;
    const [vehicles,alerts,demand,tripMetrics,procurement]=await Promise.all([repository.dashboardFleet(scope,staleMinutes),
      repository.dashboardAlerts(scope,null,null,true),repository.dashboardFleetDemand(scope),
      repository.dashboardShipments(scope,null,null),repository.dashboardProcurement(scope)]);
    const escalated=new Set(alerts.map(row=>Number(row.vehicle_id)));
    const statuses={running:0,idle:0,searching:0,offline:0};
    for(const vehicle of vehicles) statuses[vehicle.fleet_status.toLowerCase()]++;
    const list=vehicles.map(vehicle=>({...vehicle,escalated:escalated.has(Number(vehicle.vehicle_id))}))
      .sort((a,b)=>Number(b.escalated)-Number(a.escalated));
    const optimization=optimizationRows(demand,vehicles,Object.keys(scope).length>0);
    return {quantity:roQuantity(procurement[0]),kpis:{...statuses,escalated:escalated.size,
      fleet_online_pct:percent(statuses.running+statuses.idle,vehicles.length),
      route_performance_pct:percent(Number(tripMetrics[0]?.route_sla_met),Number(tripMetrics[0]?.route_sla_eligible))},
    vehicles:list.slice(offset,offset+limit),pagination:{page,limit,total:list.length},
    escalation_queue:alerts.slice(offset,offset+limit),escalation_pagination:{page,limit,total:alerts.length},
    fleet_optimization_queue:optimization.slice(offset,offset+limit),
    optimization_pagination:{page,limit,total:optimization.length}};
  }

  const periodic=view==='periodic-mis';
  const [current,previous]=periodic?periods(input):[null,null];
  const breakdown = view==='pacs-lamps-360'?'miller':view==='miller-360'?'source':'district';
  const [totals,groups,comparison,destinations,fleet]=await Promise.all([
    report(scope,null,current),report(scope,breakdown,current),
    previous?report(scope,null,previous):null,
    view==='miller-360'?repository.dashboardShipments(scope,'godown',null,true):[],
    periodic?[]:repository.dashboardFleet(scope,Number(process.env.GPS_STALE_MINUTES)||15)
  ]);
  const names = breakdown==='district'?await repository.dashboardDistricts()
    :await repository.dashboardFacilities([...groups.keys()].filter(key=>key!=null));
  const data = detailRows(groups,names,breakdown==='district'?'district_id':breakdown==='miller'?'miller_id':'source_id',
    Boolean(scope.facility_id)||breakdown==='source');
  const kpis=metrics(totals.get(null),Boolean(scope.facility_id));
  const online=fleet.filter(vehicle=>['RUNNING','IDLE'].includes(vehicle.fleet_status)).length;
  const performance={...kpis,active_vehicles:periodic?null:fleet.length,
    running_vehicles:periodic?null:fleet.filter(vehicle=>vehicle.fleet_status==='RUNNING').length,
    idle_vehicles:periodic?null:fleet.filter(vehicle=>vehicle.fleet_status==='IDLE').length,
    delayed_trips:periodic?null:fleet.filter(vehicle=>Number(vehicle.eta_issue)===1).length,
    fleet_online_pct:percent(online,fleet.length),decision_notes:[
      ...(kpis.unreserved_kg>0?[{metric:'unreserved_kg',value:kpis.unreserved_kg}]:[]),
      ...(kpis.pending_processing_kg>0?[{metric:'pending_processing_kg',value:kpis.pending_processing_kg}]:[]),
      ...(kpis.open_escalations>0?[{metric:'open_escalations',value:kpis.open_escalations}]:[])
    ]};
  const result={quantity:roQuantity(totals.get(null)),kpis,performance,rows:data.slice(offset,offset+limit),pagination:{page,limit,total:data.length}};
  if(view==='overview') result.stages={
    farmer_to_centre:{farmer_count:kpis.farmer_count,centre_count:kpis.centre_count,procured_kg:kpis.procured_kg},
    centre_to_miller:{dispatched_kg:kpis.paddy_dispatched_kg,trip_count:kpis.paddy_trip_count,vehicle_count:kpis.paddy_vehicle_count},
    miller_processing:{received_kg:kpis.paddy_received_kg,processed_kg:kpis.processed_kg,pending_kg:kpis.pending_processing_kg},
    miller_to_sfc:{dispatched_kg:kpis.sfc_dispatched_kg,received_kg:kpis.sfc_received_kg,godown_count:kpis.godown_count}
  };
  if(periodic) {
    const previousKpis=metrics(comparison.get(null),Boolean(scope.facility_id));
    const changes=Object.fromEntries(['procured_kg','paddy_dispatched_kg','processed_kg','sfc_received_kg'].map(key=>[
      key,kpis[key]==null||previousKpis[key]==null?null:percent(kpis[key]-previousKpis[key],previousKpis[key])
    ]));
    result.period_comparison={current:{...current,kpis},previous:{...previous,kpis:previousKpis},change_pct:changes};
  }
  if(view==='miller-360') {
    const stores=await repository.dashboardFacilities(destinations.map(row=>row.group_id));
    result.sfc_godowns=destinations.map(({group_id,sfc_received_kg})=>({
      destination_id:group_id,name:stores.find(row=>Number(row.id)===Number(group_id))?.name??null,
      sfc_received_kg:Number(sfc_received_kg??0)
    }));
  }
  return result;
}
