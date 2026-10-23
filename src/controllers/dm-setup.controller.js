import { z } from 'zod';
import { mutation } from "../middlewares/mutation.js";
import { id, code, name, quantity, dateOnly } from "../utils/core.js";
import * as S from "../validators/schemas.js";
import { requestContext, respond } from '../utils/http.js';
import * as service from "../services/dm-setup.service.js";
import { millerSeason, paddyFacilitySchema } from "../validators/dm-setup.schema.js";
export const listPaddyOptions = async (req, res) => {
  return respond(res, await service.listPaddyOptions(requestContext(req)));
};
export const createPaddyFacility = mutation(paddyFacilitySchema, (connection, data, req) => service.createPaddyFacility(connection, data, requestContext(req)));
export const assignPaddySource = mutation(S.tag, (connection, data, req) => service.assignPaddySource(connection, data, requestContext(req)));
export const getSetupOptions = async (req, res) => {
  return respond(res, await service.getSetupOptions(requestContext(req)));
};
export const assignReceivingStore = mutation(z.object({
  ...millerSeason,
  store_id: id
}).strict(), (connection, data, req) => service.assignReceivingStore(connection, data, requestContext(req)));
export const createCmrOrder = mutation(z.object({
  scheme_code: code,
  ...millerSeason,
  destination_id: id,
  order_no: z.string().trim().min(1).max(100),
  rice_quantity: quantity,
  due_date: dateOnly
}).strict(), (connection, data, req) => service.createCmrOrder(connection, data, requestContext(req)));
export const addTestRice = mutation(z.object({
  scheme_code: code,
  ...millerSeason,
  reference: z.string().trim().min(1).max(110),
  quantity
}).strict(), (connection, data, req) => service.addTestRice(connection, data, requestContext(req)));
export const registerMillerVehicle = mutation(z.object({
  miller_id: id,
  vehicle_type_id: id,
  registration_no: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{5,20}$/),
  capacity: quantity,
  imei_id: id
}).strict(), (connection, data, req) => service.registerMillerVehicle(connection, data, requestContext(req)));
