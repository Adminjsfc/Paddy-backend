import * as repository from '../repositories/drivers.repository.js';
import {randomUUID} from 'node:crypto';
import {ensure, passwordHash} from '../utils/core.js';
import {driverPassword} from '../utils/driver-password.js';
import { z } from 'zod';
import {id} from '../utils/core.js';

const summaryInput=z.object({driver_id:id.optional()}).strict();
export async function tripSummary(context) {
  const input=summaryInput.parse(context.body??{});
  ensure(context.user.role==='DRIVER','Driver login required','FORBIDDEN',403);
  ensure(input.driver_id===undefined||input.driver_id===Number(context.user.id),
    'Cannot view another driver summary','FORBIDDEN',403);
  const summary=await repository.tripSummary(context.user.id);
  const data=Object.fromEntries(['total_trips','active_trips','completed_trips'].map(key=>[key,Number(summary[key])]));
  return {status:200,body:{ok:true,data}};
}

export function ownerFacility(user) {
  ensure(['PACS','LAMPS','MILLER'].includes(user.role), 'Only PACS/LAMPS and millers can manage drivers', 'FORBIDDEN', 403);
  const facilityId = user.role === 'MILLER' ? user.miller_id : user.facility_id;
  ensure(facilityId, 'Owner facility is required', 'FORBIDDEN', 403);
  return facilityId;
}
export async function ensureDriver(connection, data, context, facilityId = ownerFacility(context.user)) {
  let driver = await repository.findByPhone(connection, data.phone);
  let password;
  if (!driver) {
    password = data.password ?? driverPassword();
    try {
      const id = await repository.create(connection, {
        name:data.name, phone:data.phone, email:`${data.phone}-${randomUUID()}@drivers.invalid`, role:'DRIVER',
        password_hash:await passwordHash(password), password, created_by:context.user.id ?? null, facility_id:facilityId
      });
      driver = {id,name:data.name,phone:data.phone,role:'DRIVER',active:1,facility_id:facilityId};
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
      driver = await repository.findByPhone(connection, data.phone);
      if (!driver) throw error;
      password = undefined;
    }
  }
  ensure(driver.role === 'DRIVER', 'This contact belongs to a non-driver user', 'DRIVER_CONTACT_CONFLICT', 409);
  ensure(driver.active, 'Driver account is inactive', 'DRIVER_INACTIVE', 409);
  await repository.associate(connection, driver.id, facilityId, context.user.id ?? null);
  return {id:driver.id,name:driver.name,phone:driver.phone,facility_id:driver.facility_id,created:password !== undefined,...(password === undefined ? {} : {initial_password:password})};
}
export async function listDrivers(context) {
  return {status:200,body:{ok:true,data:await repository.list(ownerFacility(context.user))}};
}
