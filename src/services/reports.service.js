import * as repository from "../repositories/reports.repository.js";
import { id, code, ensure, millerAccess, pageParams, scopedWhere, kg } from "../utils/core.js";
import {listMappedSources} from '../repositories/paddy-orders.repository.js';
export async function dashboardVehicles(context) {
  ensure(context.user.role==='MILLER'&&context.user.miller_id,'Miller facility is required','FORBIDDEN',403);
  const pagination=pageParams(context.query),seasonId=context.query.season_id?id.parse(Number(context.query.season_id)):null;
  const result=await repository.dashboardVehicles(context.user.miller_id,seasonId,pagination);
  const data=result.data.map(vehicle=>({...vehicle,gps_status:!vehicle.imei?'NOT_REGISTERED':!Number(vehicle.gps_active)?'INACTIVE':!vehicle.last_gps_at?'NO_FIX':Date.now()-new Date(vehicle.last_gps_at).getTime()>Number(process.env.GPS_STALE_MINUTES||15)*60000?'STALE':'LIVE'}));
  const totals=Object.fromEntries(Object.entries(result.totals).map(([key,value])=>[key,Number(value||0)]));
  return {body:{ok:true,data,totals,pagination:{page:pagination.page,limit:pagination.limit,total:totals.total}}};
}
export async function liftingSummary(context) {
  ensure(context.user.role==='MILLER'&&context.user.miller_id,'Miller facility is required','FORBIDDEN',403);
  const flow=context.query.flow||'PADDY';
  ensure(['PADDY','CMR'].includes(flow),'flow must be PADDY or CMR','VALIDATION',400);
  const pagination=pageParams(context.query),season=context.query.season_id?id.parse(Number(context.query.season_id)):null;
  const scheme=context.query.scheme_code?code.parse(context.query.scheme_code):null;
  const result=flow==='PADDY'?await listMappedSources(context.user.miller_id,season,pagination,scheme):await repository.listCmrLiftingSummary(context.user.miller_id,season,pagination,scheme);
  const data=flow==='PADDY'?result.data.map(row=>({...row,remaining_g:row.available_g})):result.data;
  const totals=flow==='PADDY'?{...result.totals,remaining_g:result.totals.available_g}:result.totals;
  return {body:{ok:true,data,totals,pagination:{page:pagination.page,limit:pagination.limit,total:totals.total}}};
}
export async function listStocks(context) {
  const effects = {
    headers: []
  };
  let filter = '';
  const args = [];
  const {
    page,
    limit,
    offset
  } = pageParams(context.query);
  if (context.user.role === 'MILLER') {
    filter += ' AND s.facility_id=?';
    args.push(context.user.miller_id);
  }
  if (['PACS','LAMPS'].includes(context.user.role)) {
    ensure(context.user.facility_id,'Facility is required','FORBIDDEN',403);
    filter += ' AND s.facility_id=?';
    args.push(context.user.facility_id);
  }
  for (const f of ['season_id', 'facility_id', 'scheme_id', 'commodity_id', 'status']) if (context.query[f]) {
    filter += ` AND s.${f}=?`;
    args.push(String(context.query[f]));
  }
  for(const [key,column] of [['scheme_code','sc.code'],['commodity','co.code']])if(context.query[key]){filter+=` AND ${column}=?`;args.push(String(context.query[key]));}
  const base = `FROM stocks s JOIN schemes sc ON sc.id=s.scheme_id JOIN commodities co ON co.id=s.commodity_id JOIN facilities f ON f.id=s.facility_id WHERE 1=1${filter}`;
  const count = await repository.listStocksCountRecords(base, args);
  const data = await repository.listStocksListRecords(base, limit, offset, args);
  return {
    body: {
      ok: true,
      data: data.map(s => ({
        ...s,
        on_hand_kg: kg(s.on_hand_g),
        reserved_kg: kg(s.reserved_g),
        available_kg: kg(s.available_g)
      })),
      pagination: {
        page,
        limit,
        total: count.total
      }
    },
    status: 200,
    ...effects
  };
}
export async function listLedger(context) {
  const effects = {
    headers: []
  };
  let filter = '';
  const args = [];
  const {
    page,
    limit,
    offset
  } = pageParams(context.query);
  if (context.user.role === 'MILLER') {
    filter += ' AND l.facility_id=?';
    args.push(context.user.miller_id);
  }
  if (['PACS','LAMPS'].includes(context.user.role)) {
    ensure(context.user.facility_id,'Facility is required','FORBIDDEN',403);
    filter += ' AND l.facility_id=?';
    args.push(context.user.facility_id);
  }
  for (const f of ['season_id', 'facility_id', 'scheme_id', 'commodity_id', 'status']) if (context.query[f]) {
    filter += ` AND l.${f}=?`;
    args.push(String(context.query[f]));
  }
  for(const [key,column] of [['scheme_code','sc.code'],['commodity','co.code']])if(context.query[key]){filter+=` AND ${column}=?`;args.push(String(context.query[key]));}
  const count = await repository.listLedgerCountStockLedger(filter, args);
  return {
    body: {
      ok: true,
      data: await repository.listLedgerListStockLedger(filter, limit, offset, args),
      pagination: {
        page,
        limit,
        total: count.total
      }
    },
    status: 200,
    ...effects
  };
}
export async function getMillerReconciliation(context) {
  const effects = {
    headers: []
  };
  const millerId = id.parse(Number(context.params.id)),
    seasonId = id.parse(Number(context.query.season_id));
  millerAccess(context.user, millerId);
  const miller = await repository.getMillerReconciliationFindFacilities(millerId);
  const shipments = await repository.getMillerReconciliationFindShipments(millerId, seasonId);
  const production = await repository.getMillerReconciliationFindMillingBatches(millerId, seasonId);
  const orders = await repository.getMillerReconciliationFindCmrOrders(millerId, seasonId);
  const stock = await repository.getMillerReconciliationListStocks(millerId, seasonId);
  const totals = {
    ...shipments,
    ...production,
    ...orders
  };
  for (const k of Object.keys(totals)) totals[k] = Number(totals[k]);
  totals.rice_obligation_balance_g = totals.rice_obligation_g - totals.rice_delivered_g;
  totals.unallocated_order_balance_g = totals.ordered_rice_g - totals.order_delivered_g - totals.order_committed_g;
  totals.production_variance_g = totals.rice_produced_g - totals.production_expected_rice_g;
  return {
    body: {
      ok: true,
      data: {
        miller,
        season_id: seasonId,
        totals,
        totals_kg: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k.replace(/_g$/, '_kg'), kg(v)])),
        stocks: stock
      }
    },
    status: 200,
    ...effects
  };
}
export async function listStoreAssignments(context) {
  const effects = {
    headers: []
  };
  const {
      page,
      limit,
      offset
    } = pageParams(context.query),
    where = [],
    args = [];
  for (const field of ['season_id', 'miller_id', 'store_id']) if (context.query[field]) {
    where.push(`a.${field}=?`);
    args.push(String(id.parse(Number(context.query[field]))));
  }
  if (context.query.district_id) {
    where.push('s.district_id=?');
    args.push(String(id.parse(Number(context.query.district_id))));
  }
  if (context.query.active !== undefined) {
    ensure(['true', 'false'].includes(String(context.query.active)), 'active must be true or false', 'VALIDATION', 400);
    where.push('a.active=?');
    args.push(context.query.active === 'true');
  }
  const filter = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const base = `FROM miller_store_assignments a JOIN seasons se ON se.id=a.season_id JOIN facilities m ON m.id=a.miller_id JOIN facilities s ON s.id=a.store_id LEFT JOIN tbl_district_master md ON md.id=m.district_id LEFT JOIN tbl_district_master sd ON sd.id=s.district_id LEFT JOIN users creator ON creator.id=a.created_by LEFT JOIN users unassigner ON unassigner.id=a.unassigned_by${filter}`;
  const count = await repository.listStoreAssignmentsCountRecords(base, args);
  const data = await repository.listStoreAssignmentsListRecords(base, limit, offset, args);
  return {
    body: {
      ok: true,
      data,
      pagination: {
        page,
        limit,
        total: count.total
      }
    },
    status: 200,
    ...effects
  };
}
export async function getDashboard(context) {
  const effects = {
    headers: []
  };
  const scope = scopedWhere(context.user);
  let filter = scope.sql;
  const args = [...scope.params];
  if (context.query.season_id) {
    filter += ' AND s.season_id=?';
    args.push(String(context.query.season_id));
  }
  const trips = await repository.getDashboardListShipments(filter, args);
  const staleMinutes = Number(process.env.GPS_STALE_MINUTES || 15);
  const alerts = await repository.getDashboardListShipments2(filter, staleMinutes, args);
  return {
    body: {
      ok: true,
      data: {
        shipments: trips,
        gps_stale_alerts: alerts,
        gps_stale_minutes: staleMinutes,
        alert_limit: 200
      }
    },
    status: 200,
    ...effects
  };
}
export async function listAudit(context) {
  const effects = {
    headers: []
  };
  const {
    page,
    limit,
    offset
  } = pageParams(context.query);
  const count = await repository.listAuditCountAuditLog();
  return {
    body: {
      ok: true,
      data: await repository.listAuditListAuditLog(limit, offset),
      pagination: {
        page,
        limit,
        total: count.total
      }
    },
    status: 200,
    ...effects
  };
}
export async function listAvailableLots(context) {
  const effects = {
    headers: []
  };
  const facilityId = id.parse(Number(context.query.facility_id)),
    seasonId = id.parse(Number(context.query.season_id));
  if (context.user.role === 'MILLER') await repository.listAvailableLotsFindRouteTags(facilityId, context, seasonId);
  const {
      page,
      limit,
      offset
    } = pageParams(context.query),
    args = [facilityId, seasonId];
  let filter = 'FROM procurement p JOIN schemes sc ON sc.id=p.scheme_id JOIN commodities co ON co.id=p.commodity_id WHERE p.facility_id=? AND p.season_id=? AND p.available_g>p.reserved_g';
  if(context.query.scheme_code){filter+=' AND sc.code=?';args.push(code.parse(context.query.scheme_code));}
  for(const field of ['scheme_id','commodity_id'])if(context.query[field]){filter+=` AND p.${field}=?`;args.push(id.parse(Number(context.query[field])));}
  const count = await repository.listAvailableLotsCountRecords(filter, args);
  return {
    body: {
      ok: true,
      data: await repository.listAvailableLotsListRecords(filter, limit, offset, args),
      pagination: {
        page,
        limit,
        total: count.total
      }
    },
    status: 200,
    ...effects
  };
}
