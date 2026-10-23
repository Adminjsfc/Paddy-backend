import { mutation } from "../middlewares/mutation.js";
import { requestContext, respond } from '../utils/http.js';
import * as service from "../services/store-assignments.service.js";
import { createSchema, statusSchema } from "../validators/store-assignments.schema.js";
export const createMillerStoreAssignments = mutation(createSchema, (connection, data, req) => service.createMillerStoreAssignments(connection, data, requestContext(req)));
export const listMillerStoreAssignments = async (req, res) => {
  return respond(res, await service.listMillerStoreAssignments(requestContext(req)));
};
export const listMillerStoreAssignmentOptions = async (req, res) => {
  return respond(res, await service.listMillerStoreAssignmentOptions(requestContext(req)));
};
export const setAssignmentStatus = mutation(statusSchema, (connection, data, req) => service.setAssignmentStatus(connection, data, requestContext(req)));
