import * as repository from "../repositories/store-assignments.repository.js";
import { ensure, id, pageParams } from "../utils/core.js";
export async function createMillerStoreAssignments(connection, data, context) {
  await repository.createMillerStoreAssignmentsFindSeasons(connection, data);
  await repository.createMillerStoreAssignmentsFindFacilities(connection, data);
  await repository.createMillerStoreAssignmentsFindFacilities2(connection, data);
  await repository.createMillerStoreAssignmentsExecuteMillerStoreAssignments(connection, data, context);
  const assignment = await repository.createMillerStoreAssignmentsFindMillerStoreAssignments(connection, data);
  return assignment;
}
export async function listMillerStoreAssignments(context) {
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
  if (context.query.season_id) {
    where.push('a.season_id=?');
    args.push(String(id.parse(Number(context.query.season_id))));
  }
  if (context.query.miller_id) {
    where.push('a.miller_id=?');
    args.push(String(id.parse(Number(context.query.miller_id))));
  }
  if (context.query.store_id) {
    where.push('a.store_id=?');
    args.push(String(id.parse(Number(context.query.store_id))));
  }
  if (context.query.district_id) {
    where.push('s.district_id=?');
    args.push(String(id.parse(Number(context.query.district_id))));
  }
  if (context.query.active !== undefined) {
    ensure(['true', 'false'].includes(String(context.query.active)), 'active must be true or false', 'VALIDATION', 400);
    where.push('a.active=?');
    args.push(context.query.active === 'true');
  } else {
    where.push('a.active=?');
    args.push(true);
  }
  const filter = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const base = `FROM miller_store_assignments a JOIN facilities m ON m.id=a.miller_id JOIN facilities s ON s.id=a.store_id JOIN seasons se ON se.id=a.season_id LEFT JOIN tbl_district_master sd ON sd.id=s.district_id LEFT JOIN users creator ON creator.id=a.created_by LEFT JOIN users unassigner ON unassigner.id=a.unassigned_by${filter}`;
  const count = await repository.listMillerStoreAssignmentsCountRecords(base, args);
  const data = await repository.listMillerStoreAssignmentsListRecords(base, limit, offset, args);
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
export async function listMillerStoreAssignmentOptions(context) {
  const effects = {
    headers: []
  };
  const [seasons, millers, stores] = await Promise.all([repository.listMillerStoreAssignmentOptionsListSeasons(), repository.listMillerStoreAssignmentOptionsListFacilities(), repository.listMillerStoreAssignmentOptionsListFacilities2()]);
  return {
    body: {
      ok: true,
      data: {
        seasons,
        millers,
        stores
      }
    },
    status: 200,
    ...effects
  };
}
export async function setAssignmentStatus(connection, data, context) {
  const assignment = await repository.setAssignmentStatusFindMillerStoreAssignments(connection, context);
  if (data.active) {
    await repository.setAssignmentStatusFindSeasons(connection, assignment);
    await repository.setAssignmentStatusFindFacilities(connection, assignment);
    await repository.setAssignmentStatusFindFacilities2(connection, assignment);
  }
  const now = new Date();
  if (data.active) await repository.setAssignmentStatusUpdateMillerStoreAssignments(connection, context, now, assignment);else await repository.setAssignmentStatusUpdateMillerStoreAssignments2(connection, context, now, assignment);
  return {
    id: assignment.id,
    season_id: assignment.season_id,
    miller_id: assignment.miller_id,
    store_id: assignment.store_id,
    active: data.active,
    created_by: data.active ? context.user.id ?? null : assignment.created_by,
    created_at: data.active ? now.toISOString() : assignment.created_at,
    unassigned_by: data.active ? null : context.user.id ?? null,
    unassigned_at: data.active ? null : now.toISOString()
  };
}
