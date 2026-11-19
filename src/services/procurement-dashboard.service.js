import {z} from 'zod';
import {distanceMeters,ensure,id} from '../utils/core.js';
import * as repository from '../repositories/procurement-dashboard.repository.js';

const views = ['overview','pacs-lamps','miller','periodic-mis','fleet-command-room'];
const optionalId = z.preprocess(value => value === undefined ? undefined : Number(value),id.optional());
const querySchema = z.object({
  season_id:optionalId, facility_id:optionalId, miller_id:optionalId, district_id:optionalId
});
const periodicQuerySchema = querySchema.omit({district_id:true}).extend({
  month:z.coerce.number().int().min(1).max(12).optional(),
  year:z.coerce.number().int().min(1000).max(9998).optional()
});
const defaults = {
  ro_count:0, farmer_count:0, centre_count:0, procured_kg:0, stock_available_kg:0,
  unreserved_kg:0, paddy_dispatched_kg:0, sfc_dispatched_kg:0, trip_count:0,
  paddy_vehicle_count:0, paddy_trip_count:0, cmr_trip_count:0, closed_cmr_trip_count:0,
  on_time_trips:0, paddy_received_kg:0, sfc_received_kg:0, received_source_count:0,
  godown_count:0, processed_kg:0, cmr_output_kg:0
};

function monthOffset(date, months) {
  const day = new Date(date+'T00:00:00Z');
  day.setUTCMonth(day.getUTCMonth()+months);
  return day.toISOString().slice(0,10);
}

function periods(query) {
  ensure((query.month===undefined)===(query.year===undefined),'Provide both month and year','VALIDATION',400);
  const first=query.month===undefined?new Date().toISOString().slice(0,7)+'-01'
    :`${query.year}-${String(query.month).padStart(2,'0')}-01`;
  return [{start:first,end:monthOffset(first,1)},{start:monthOffset(first,-1),end:first}];
}

function percent(value, base) {
  return base>0?Math.round(value/base*10000)/100:null;
}

function monthlyQuantities({procured_kg,paddy_dispatched_kg,processed_kg,sfc_received_kg}) {
  return {procured_kg,paddy_dispatched_kg,processed_kg,sfc_received_kg};
}

function roQuantitySummary(values) {
  return {
    total_kg:Number(values?.procured_kg??0),
    available_kg:Number(values?.unreserved_kg??0),
    pending_kg:Number(values?.stock_available_kg??0)
  };
}

function districtSummary({district_id,name,trip_count,on_time_trips,...quantities}) {
  return {district_id,name,...monthlyQuantities(quantities),dispatched_trips:trip_count,on_time_trips};
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
    closed_cmr_trip_count:facilityScoped?null:data.closed_cmr_trip_count
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
    breakdown==='miller'||breakdown==='source'?[]:repository.dashboardMilling(scope,breakdown,period)
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
    ensure(view!=='miller','Miller Dashboard requires Admin or Miller access','FORBIDDEN',403);
    scope.facility_id=facilityId;
  }
  if(user.role==='MILLER') {
    const millerId=id.parse(Number(user.miller_id));
    ensure(scope.miller_id===undefined||scope.miller_id===millerId,
      'Cannot view another Miller dashboard','FORBIDDEN',403);
    ensure(view==='miller','Miller access is limited to Miller Dashboard','FORBIDDEN',403);
    scope.miller_id=millerId;
  }
  if(view==='pacs-lamps') scope.paddyOnly=true;
  return scope;
}

export async function getProcurementDashboard({user,query}, view) {
  ensure(views.includes(view),'Dashboard view not found','NOT_FOUND',404);
  const input=(view==='periodic-mis'?periodicQuerySchema:querySchema).parse(query);
  const scope=scopeFor(user,input,view);
  const [facility,miller]=await Promise.all([
    scope.facility_id?repository.dashboardFacilities([scope.facility_id]).then(rows=>rows[0]):null,
    scope.miller_id?repository.dashboardFacilities([scope.miller_id]).then(rows=>rows[0]):null
  ]);
  if(scope.facility_id) ensure(facility&&['PACS','LAMPS'].includes(facility.kind),'PACS/LAMPS facility not found','NOT_FOUND',404);
  if(scope.miller_id) ensure(miller?.kind==='MILLER','Miller facility not found','NOT_FOUND',404);
  const periodic=view==='periodic-mis';
  if(view==='fleet-command-room') {
    const staleMinutes=Number(process.env.GPS_STALE_MINUTES)||15;
    const [vehicles,alerts,demand,shipmentPerformance,procurement]=await Promise.all([repository.dashboardFleet(scope,staleMinutes),
      repository.dashboardAlerts(scope,null,null,true),repository.dashboardFleetDemand(scope),
      repository.shipmentCounts(scope),repository.dashboardProcurement(scope)]);
    const escalated=new Set(alerts.map(row=>Number(row.vehicle_id)));
    const statuses={running:0,idle:0,searching:0,offline:0};
    for(const vehicle of vehicles) statuses[vehicle.fleet_status.toLowerCase()]++;
    const list=vehicles.map(vehicle=>({...vehicle,escalated:escalated.has(Number(vehicle.vehicle_id))}))
      .sort((a,b)=>Number(b.escalated)-Number(a.escalated));
    const optimization=optimizationRows(demand,vehicles,Object.keys(scope).length>0);
    return {ro_quantity_summary:roQuantitySummary(procurement[0]),fleet_status_summary:{...statuses,escalated:escalated.size},
    shipment_performance:shipmentPerformance,
    vehicles:list,escalation_queue:alerts,fleet_optimization_queue:optimization};
  }

  const [current,previous]=periodic?periods(input):[null,null];
  const breakdown = view==='pacs-lamps'?'miller':view==='miller'?'source':'district';
  const [totals,groups,comparison,destinations,fleet,shipmentPerformance]=await Promise.all([
    report(scope,null,current),report(scope,breakdown,current),
    previous?report(scope,null,previous):null,
    view==='miller'?repository.dashboardShipments(scope,'godown',null,true):[],
    periodic?[]:repository.dashboardFleet(scope,Number(process.env.GPS_STALE_MINUTES)||15),
    repository.shipmentCounts(scope,current)
  ]);
  const names = breakdown==='district'?await repository.dashboardDistricts()
    :await repository.dashboardFacilities([...groups.keys()].filter(key=>key!=null));
  const data = detailRows(groups,names,breakdown==='district'?'district_id':breakdown==='miller'?'miller_id':'source_id',
    Boolean(scope.facility_id||scope.paddyOnly)||breakdown==='source');
  const kpis=metrics(totals.get(null),Boolean(scope.facility_id||scope.paddyOnly));
  if(periodic) {
    const liftingSummary=monthlyQuantities(kpis);
    const previousSummary=monthlyQuantities(metrics(comparison.get(null),Boolean(scope.facility_id)));
    const changes=Object.fromEntries(Object.entries(liftingSummary).map(([key,value])=>[
      key,value==null||previousSummary[key]==null?0:(percent(value-previousSummary[key],previousSummary[key])??0)
    ]));
    return {
      ro_quantity_summary:roQuantitySummary(kpis),
      lifting_summary:liftingSummary,
      shipment_performance:shipmentPerformance,
      district_wise_summary:data.map(districtSummary),
      monthly_comparison:{
        current:{...current,lifting_summary:liftingSummary},
        previous:{...previous,lifting_summary:previousSummary},
        change_pct:changes
      }
    };
  }
  const fleetSummary={active_vehicles:fleet.length,
    running_vehicles:fleet.filter(vehicle=>vehicle.fleet_status==='RUNNING').length,
    idle_vehicles:fleet.filter(vehicle=>vehicle.fleet_status==='IDLE').length,
    delayed_trips:fleet.filter(vehicle=>Number(vehicle.eta_issue)===1).length};
  if(view==='pacs-lamps') {
    return {
      ro_quantity_summary:roQuantitySummary(kpis),
      lifting_summary:{
        ro_count:kpis.ro_count,farmer_count:kpis.farmer_count,centre_count:kpis.centre_count,
        paddy_dispatched_kg:kpis.paddy_dispatched_kg,paddy_received_kg:kpis.paddy_received_kg
      },
      shipment_performance:shipmentPerformance,
      fleet_summary:fleetSummary,
      miller_wise_summary:data.map(row=>({
        miller_id:row.miller_id,name:row.name,...roQuantitySummary(row),
        paddy_dispatched_kg:row.paddy_dispatched_kg,paddy_received_kg:row.paddy_received_kg,
        dispatched_trips:row.trip_count,on_time_trips:row.on_time_trips
      }))
    };
  }
  const summary={ro_quantity_summary:roQuantitySummary(kpis),shipment_performance:shipmentPerformance,fleet_summary:fleetSummary};
  if(view==='overview') return {...summary,lifting_summary:monthlyQuantities(kpis),
    district_wise_summary:data.map(districtSummary),stages:{
    farmer_to_centre:{farmer_count:kpis.farmer_count,centre_count:kpis.centre_count,procured_kg:kpis.procured_kg},
    centre_to_miller:{dispatched_kg:kpis.paddy_dispatched_kg,trip_count:kpis.paddy_trip_count,vehicle_count:kpis.paddy_vehicle_count},
    miller_processing:{received_kg:kpis.paddy_received_kg,processed_kg:kpis.processed_kg,pending_kg:kpis.pending_processing_kg},
    miller_to_sfc:{dispatched_kg:kpis.sfc_dispatched_kg,received_kg:kpis.sfc_received_kg,godown_count:kpis.godown_count}
  }};
  const stores=await repository.dashboardFacilities(destinations.map(row=>row.group_id));
  return {...summary,
    lifting_summary:{
      paddy_received_kg:kpis.paddy_received_kg,paddy_source_count:kpis.received_source_count,
      paddy_processed_kg:kpis.processed_kg,paddy_pending_processing_kg:kpis.pending_processing_kg,
      cmr_output_kg:kpis.cmr_output_kg,cmr_dispatched_trips:kpis.cmr_trip_count,
      cmr_delivered_trips:kpis.closed_cmr_trip_count,sfc_received_kg:kpis.sfc_received_kg
    },
    source_wise_summary:data.map(row=>({
      source_id:row.source_id,name:row.name,paddy_dispatched_kg:row.paddy_dispatched_kg,
      paddy_received_kg:row.paddy_received_kg,dispatched_trips:row.trip_count,on_time_trips:row.on_time_trips
    })),
    sfc_godowns:destinations.map(({group_id,sfc_received_kg})=>({
      destination_id:group_id,name:stores.find(row=>Number(row.id)===Number(group_id))?.name??null,
      sfc_received_kg:Number(sfc_received_kg??0)
    }))
  };
}
