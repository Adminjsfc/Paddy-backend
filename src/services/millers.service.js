import * as repository from "../repositories/millers.repository.js";
import crypto from 'node:crypto';
import { ensure, id, passwordHash } from "../utils/core.js";
import { createMaster } from "./masters.service.js";
export async function registerMiller(connection, data, actor) {
  const code = `MILL-${crypto.randomUUID().toUpperCase()}`;
  const facility = await createMaster(connection, 'facilities', {
    ...data.facility,
    code
  }, actor);
  const id = await repository.registerMillerInsertUsers(connection, data, facility, actor, await passwordHash('123456789'));
  return {
    id,
    facility_id: facility.id,
    miller_id: facility.id,
    miller_code: facility.code,
    email: data.user.email,
    role: 'MILLER'
  };
}
export function requireDMDistrict(user, districtId) {
  ensure(user.district_ids.includes(districtId), 'District is outside your DM assignment', 'DISTRICT_FORBIDDEN', 403);
}
export function registerLocalMiller(connection, data, context) {
  return registerMiller(connection, data, context.user);
}
export async function listLocationOptions(context) {
  const effects = {
    headers: []
  };
  const ids = context.user.district_ids;
  const districts = await repository.listLocationOptionsListTblDistrictMaster(ids);
  let blocks = [];
  if (context.query.district_id) {
    const districtId = id.parse(Number(context.query.district_id));
    requireDMDistrict(context.user, districtId);
    blocks = await repository.listLocationOptionsListTblBlockMaster(districtId);
  }
  return {
    body: {
      ok: true,
      data: {
        districts,
        blocks
      }
    },
    status: 200,
    ...effects
  };
}
export function registerCoreDMMiller(connection, data, context) {
  requireDMDistrict(context.user, data.facility.district_id);
  return registerMiller(connection, data, context.user);
}
