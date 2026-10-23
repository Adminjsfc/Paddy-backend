import { mutation } from "../middlewares/mutation.js";
import * as S from "../validators/schemas.js";
import { requestContext, respond } from '../utils/http.js';
import * as service from "../services/procurement.service.js";
export const importProcurements = mutation(S.procurementBatch, (connection, data, req) => service.importProcurements(connection, data, requestContext(req)));
export const updateProcurement = mutation(S.procurementPatch, (connection, data, req) => service.updateProcurement(connection,data,requestContext(req)));
export const importCmrOrders = mutation(S.orderBatch, (connection, data, req) => service.importCmrOrders(connection, data, requestContext(req)));
export const listProcurements = async (req, res) => {
  return respond(res, await service.listProcurements(requestContext(req)));
};
export const listCmrOrders = async (req, res) => {
  return respond(res, await service.listCmrOrders(requestContext(req)));
};
export const updateCmrOrder = mutation(S.orderPatch, (connection, data, req) => service.updateCmrOrder(connection, data, requestContext(req)));
export const cancelCmrOrder = mutation(S.reason, (connection, data, req) => service.cancelCmrOrder(connection, data, requestContext(req)));
export const recordMillingBatch = mutation(S.milling, (connection, data, req) => service.recordMillingBatch(connection, data, requestContext(req)));
export const listMillingBatches = async (req, res) => {
  return respond(res, await service.listMillingBatches(requestContext(req)));
};
