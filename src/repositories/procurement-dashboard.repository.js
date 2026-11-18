import {pool} from '../config/database.js';
import {rows} from './database.js';

const moved = "s.status IN ('DISPATCHED','IN_TRANSIT','ARRIVED','DELIVERED')";
const tripSla = 's.trip_completed_at IS NOT NULL AND s.expected_completion_at IS NOT NULL';
const routeTracked = "s.trip_completed_at IS NOT NULL AND r.encoded_polyline IS NOT NULL AND s.last_gps_at>=s.trip_started_at";
const escalationCodes = "'OR','LH','DISC','DO'";

function conditions(scope, dimensions, date, period) {
  const clauses = [];
  const args = [];
  for (const [key, column] of Object.entries(dimensions)) {
    if (scope[key] == null) continue;
    clauses.push(`${column}=?`);
    args.push(scope[key]);
  }
  if (period) {
    clauses.push(`${date}>=? AND ${date}<?`);
    args.push(period.start, period.end);
  }
  return {sql: clauses.length ? ' AND '+clauses.join(' AND ') : '', args};
}

function grouped(expression) {
  return expression ? ` GROUP BY ${expression}` : '';
}

const district = 'COALESCE(p.district_id,f.district_id)';
const shipmentDistrict = "CASE WHEN s.leg='PADDY' THEN COALESCE(s.district_id,f.district_id) ELSE f.district_id END";

export function dashboardProcurement(scope, breakdown, period) {
  const key = {district, miller:'p.miller_id'}[breakdown];
  const filter = conditions(scope, {
    facility_id:'p.facility_id', miller_id:'p.miller_id', district_id:district, season_id:'p.season_id'
  }, 'p.procured_at', period);
  return rows(pool, `SELECT ${key??'NULL'} group_id, COUNT(*) ro_count,
    COUNT(DISTINCT COALESCE(CAST(p.farmer_id AS CHAR),p.farmer_code)) farmer_count,
    COUNT(DISTINCT p.facility_id) centre_count,
    COALESCE(SUM(p.quantity_kg),0) procured_kg, COALESCE(SUM(p.available_kg),0) stock_available_kg,
    COALESCE(SUM(p.quantity_kg-p.available_kg),0) ro_dispatched_kg,
    COALESCE(SUM(p.reserved_kg),0) reserved_kg, COALESCE(SUM(p.available_kg-p.reserved_kg),0) unreserved_kg
    FROM procurement p LEFT JOIN facilities f ON f.id=p.facility_id
    WHERE p.commodity_code='PADDY'${filter.sql}${grouped(key)}`,filter.args);
}

export function dashboardShipments(scope, breakdown, period, receipt = false) {
  const key = {district:shipmentDistrict, miller:'s.miller_id', source:'r.source_id', godown:'r.destination_id'}[breakdown];
  const filter = conditions(scope, {
    facility_id:"CASE WHEN s.leg='PADDY' THEN r.source_id END",
    miller_id:'s.miller_id', district_id:shipmentDistrict, season_id:'s.season_id'
  },receipt?'s.delivered_at':'s.dispatched_at',period);
  const leg = breakdown==='source' || breakdown==='miller' ? " AND s.leg='PADDY'"
    : breakdown==='godown' ? " AND s.leg='CMR' AND dest.kind='SFC_GODOWN'" : '';
  const source = `FROM shipments s JOIN shipment_routes r ON r.id=s.route_id
    JOIN facilities f ON f.id=r.source_id JOIN facilities dest ON dest.id=r.destination_id`;
  const metrics = receipt ? `
    SUM(CASE WHEN s.leg='PADDY' THEN COALESCE(s.accepted_kg,0) ELSE 0 END) paddy_received_kg,
    SUM(CASE WHEN s.leg='CMR' AND dest.kind='SFC_GODOWN' THEN COALESCE(s.accepted_kg,0) ELSE 0 END) sfc_received_kg,
    SUM(CASE WHEN s.accepted_kg IS NOT NULL THEN s.quantity_kg ELSE 0 END) receipt_dispatched_kg,
    SUM(COALESCE(s.shortage_kg,0)) shortage_kg,
    COUNT(DISTINCT CASE WHEN s.leg='PADDY' THEN r.source_id END) received_source_count,
    COUNT(DISTINCT CASE WHEN s.leg='CMR' AND dest.kind='SFC_GODOWN' THEN r.destination_id END) godown_count` : `
    SUM(CASE WHEN s.leg='PADDY' THEN s.quantity_kg ELSE 0 END) paddy_dispatched_kg,
    SUM(CASE WHEN s.leg='CMR' AND dest.kind='SFC_GODOWN' THEN s.quantity_kg ELSE 0 END) sfc_dispatched_kg,
    COUNT(*) trip_count, COUNT(DISTINCT s.vehicle_id) vehicle_count,
    COUNT(DISTINCT CASE WHEN s.leg='PADDY' THEN s.vehicle_id END) paddy_vehicle_count,
    SUM(s.leg='PADDY') paddy_trip_count, SUM(s.leg='CMR') cmr_trip_count,
    SUM(s.leg='CMR' AND s.status='DELIVERED') closed_cmr_trip_count,
    SUM(CASE WHEN EXISTS (
      SELECT 1 FROM tbl_vehicle_alert_event e JOIN gps_alert_master g ON g.id=e.alert_id
      WHERE e.shipment_id=s.id AND g.alert_short_name IN (${escalationCodes})
    ) THEN 1 ELSE 0 END) escalated_trip_count,
    SUM(${tripSla}) trip_sla_eligible,
    SUM(CASE WHEN ${tripSla} AND s.trip_completed_at<=s.expected_completion_at THEN 1 ELSE 0 END) trip_sla_met,
    SUM(CASE WHEN ${routeTracked} THEN 1 ELSE 0 END) route_sla_eligible,
    SUM(CASE WHEN ${routeTracked} AND NOT EXISTS (
      SELECT 1 FROM tbl_vehicle_alert_event e JOIN gps_alert_master g ON g.id=e.alert_id
      WHERE e.shipment_id=s.id AND g.alert_short_name='OR'
    ) THEN 1 ELSE 0 END) route_sla_met`;
  return rows(pool,`SELECT ${key??'NULL'} group_id,${metrics} ${source}
    WHERE ${receipt?"s.status='DELIVERED'":moved}${leg}${filter.sql}${grouped(key)}`,filter.args);
}

export function dashboardMilling(scope, breakdown, period) {
  if (scope.facility_id) return Promise.resolve([]);
  const key = breakdown==='district'?'f.district_id':null;
  const filter = conditions(scope, {miller_id:'b.miller_id',district_id:'f.district_id',season_id:'b.season_id'},'b.milled_at',period);
  return rows(pool,`SELECT ${key??'NULL'} group_id, COUNT(DISTINCT b.miller_id) processing_miller_count,
    SUM(b.paddy_consumed_kg) processed_kg,SUM(b.rice_produced_kg) cmr_output_kg
    FROM milling_batches b JOIN facilities f ON f.id=b.miller_id WHERE 1=1${filter.sql}${grouped(key)}`,filter.args);
}

export function dashboardFacilities(ids) {
  if (!ids.length) return Promise.resolve([]);
  return rows(pool,`SELECT id,name,code,kind,district_id FROM facilities WHERE id IN (${ids.map(()=>'?').join(',')})`,ids);
}

export function dashboardDistricts() {
  return rows(pool,'SELECT id,district_name AS name FROM tbl_district_master',[]);
}

export function dashboardFleet(scope, staleMinutes) {
  const filter = conditions(scope,{
    facility_id:"CASE WHEN s.leg='PADDY' THEN r.source_id END",
    miller_id:'s.miller_id',district_id:shipmentDistrict,season_id:'s.season_id'
  });
  const scoped = Object.keys(scope).length>0;
  return rows(pool,`SELECT v.id vehicle_id,v.registration_no,s.id shipment_id,s.shipment_no,s.leg,
    s.status shipment_status,s.expected_completion_at,r.source_id,r.destination_id,
    r.encoded_polyline, f.name source_name,dst.name destination_name,
    v.capacity_value,v.capacity_unit,
    d.latitude,d.longitude,d.speed_kph,d.last_gps_at,
    CASE WHEN d.id IS NULL OR d.last_gps_at IS NULL THEN 'SEARCHING'
      WHEN d.last_gps_at < DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? MINUTE) THEN 'OFFLINE'
      WHEN COALESCE(d.speed_kph,0)>0 OR s.status='IN_TRANSIT' THEN 'RUNNING' ELSE 'IDLE' END fleet_status,
    CASE WHEN s.status IN ('DISPATCHED','IN_TRANSIT','ARRIVED') AND
      (d.id IS NULL OR d.last_gps_at IS NULL OR d.last_gps_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? MINUTE))
      THEN 1 ELSE 0 END gps_issue,
    CASE WHEN s.status='IN_TRANSIT' AND s.expected_completion_at<UTC_TIMESTAMP() THEN 1 ELSE 0 END eta_issue
    FROM vehicles v LEFT JOIN shipments s ON s.id=(
      SELECT a.id FROM shipments a WHERE a.vehicle_id=v.id
        AND a.status IN ('PLANNED','DISPATCHED','IN_TRANSIT','ARRIVED') ORDER BY a.id DESC LIMIT 1
    )
    LEFT JOIN shipment_routes r ON r.id=s.route_id
    LEFT JOIN facilities f ON f.id=r.source_id
    LEFT JOIN facilities dst ON dst.id=r.destination_id LEFT JOIN gps_devices d ON d.vehicle_id=v.id AND d.active=1
    WHERE v.active=1${scoped?' AND s.id IS NOT NULL':''}${filter.sql}
    ORDER BY gps_issue+eta_issue DESC,v.id`,[staleMinutes,staleMinutes,...filter.args]);
}

export function dashboardFleetDemand(scope) {
  const paddy = conditions(scope,{
    facility_id:'p.facility_id',miller_id:'p.miller_id',district_id:district,season_id:'p.season_id'
  });
  const cmr = conditions(scope,{miller_id:'o.miller_id',district_id:'f.district_id',season_id:'o.season_id'});
  const rice = scope.facility_id?'':` UNION ALL
    SELECT 'CMR',o.miller_id,o.destination_id,f.name,d.name,f.latitude,f.longitude,
      SUM(GREATEST(0,o.rice_quantity_kg-o.committed_kg-o.delivered_kg))
    FROM cmr_orders o JOIN facilities f ON f.id=o.miller_id JOIN facilities d ON d.id=o.destination_id
    WHERE o.status<>'CANCELLED' AND f.active=1 AND d.active=1${cmr.sql}
    GROUP BY o.miller_id,o.destination_id,f.name,d.name,f.latitude,f.longitude HAVING SUM(GREATEST(0,o.rice_quantity_kg-o.committed_kg-o.delivered_kg))>0`;
  return rows(pool,`SELECT 'PADDY' leg,p.facility_id source_id,p.miller_id destination_id,
      f.name source_name,d.name destination_name,f.latitude,f.longitude,
      SUM(p.available_kg-p.reserved_kg) ready_kg
    FROM procurement p JOIN facilities f ON f.id=p.facility_id JOIN facilities d ON d.id=p.miller_id
    WHERE p.commodity_code='PADDY' AND f.active=1 AND d.active=1 AND EXISTS (
      SELECT 1 FROM route_tags r WHERE r.source_id=p.facility_id AND r.destination_id=p.miller_id
        AND r.season_id=p.season_id AND r.active=1
    )${paddy.sql}
    GROUP BY p.facility_id,p.miller_id,f.name,d.name,f.latitude,f.longitude
    HAVING SUM(p.available_kg-p.reserved_kg)>0${rice} ORDER BY ready_kg DESC,source_id,destination_id`,
    [...paddy.args,...(scope.facility_id?[]:cmr.args)]);
}

export function dashboardAlerts(scope, breakdown, period, openOnly = false) {
  const key = {district:shipmentDistrict, miller:'s.miller_id', source:'r.source_id'}[breakdown];
  const filter = conditions(scope,{
    facility_id:"CASE WHEN s.leg='PADDY' THEN r.source_id END",
    miller_id:'s.miller_id',district_id:shipmentDistrict,season_id:'s.season_id'
  },'e.start_date_time',period);
  const selection = openOnly
    ? 'e.id,e.shipment_id,s.vehicle_id,s.shipment_no,s.leg,e.vehicle_no,e.start_date_time,g.alert_name,g.alert_short_name,src.name source_name,dest.name destination_name'
    : `${key??'NULL'} group_id,COUNT(*) alert_count,SUM(e.status=1 AND e.end_date_time IS NULL) open_escalations`;
  return rows(pool,`SELECT ${selection} FROM tbl_vehicle_alert_event e
    JOIN gps_alert_master g ON g.id=e.alert_id JOIN shipments s ON s.id=e.shipment_id
    JOIN shipment_routes r ON r.id=s.route_id JOIN facilities f ON f.id=r.source_id
    JOIN facilities src ON src.id=r.source_id JOIN facilities dest ON dest.id=r.destination_id
    WHERE s.status<>'CANCELLED' AND g.alert_short_name IN (${escalationCodes})
    ${openOnly?'AND e.status=1 AND e.end_date_time IS NULL':''}
    ${breakdown==='source'||breakdown==='miller'?"AND s.leg='PADDY'":''}${filter.sql}
    ${openOnly?'ORDER BY e.start_date_time,e.id':grouped(key)}`,filter.args);
}
