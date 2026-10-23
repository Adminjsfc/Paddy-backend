import { mutation } from "../middlewares/mutation.js";
import * as S from "../validators/schemas.js";
import { requestContext, respond } from '../utils/http.js';
import * as service from "../services/masters.service.js";
import { configs } from "../config/masters.js";
export const listRouteTagAssignmentOptions = async (req, res) => {
  return respond(res, await service.listRouteTagAssignmentOptions(requestContext(req)));
};
export const listLocationOptions = async (req, res) => {
  return respond(res, await service.listLocationOptions(requestContext(req)));
};
export const createMasterRecord = (config, type) => mutation(config.schema, (connection, data, req) => service.createMasterRecord(connection, data, requestContext(req), config, type));
export const listMasterRecords = (type, table) => async (req, res) => {
  return respond(res, await service.listMasterRecords(requestContext(req), type, table));
};
export const getMasterRecord = (type, table) => async (req, res) => {
  return respond(res, await service.getMasterRecord(requestContext(req), type, table));
};
export const updateFacility = mutation(S.facilityPatch, (connection, data, req) => service.updateFacility(connection, data, requestContext(req)));
export const updateSeason = mutation(S.seasonPatch, (connection, data, req) => service.updateSeason(connection, data, requestContext(req)));
export const setFacilityOrSeasonStatus = type => mutation(S.activePatch, (connection, data, req) => service.setFacilityOrSeasonStatus(connection, data, requestContext(req), type));
export const setMasterStatus = type => mutation(S.activePatch, (connection, data, req) => service.setMasterStatus(connection, data, requestContext(req), type));
export const importMasterRecord = type => mutation(configs[type].schema, (connection, data, req) => service.importMasterRecord(connection, data, requestContext(req), type));
export const updateMasterProfile = (schema, type) => mutation(schema.refine(v => Object.keys(v).length > 0, 'At least one field required'), (connection, data, req) => service.updateMasterProfile(connection, data, requestContext(req), schema, type));
