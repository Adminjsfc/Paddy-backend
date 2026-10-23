import { mutation } from "../middlewares/mutation.js";
import * as S from "../validators/schemas.js";
import { requestContext, respond } from '../utils/http.js';
import * as service from "../services/shipments.service.js";
export const create = mutation(S.shipment, (connection, data, req) => service.createShipment(connection, data, requestContext(req)));
export const dispatchShipment = mutation(S.dispatch, (connection, data, req) => service.dispatchShipment(connection, data, requestContext(req)));
export const completeDelivery = mutation(S.delivery, (connection, data, req) => service.completeDelivery(connection, data, requestContext(req)));
export const cancelShipment = mutation(S.reason, (connection, data, req) => service.cancelShipment(connection, data, requestContext(req)));
export const listShipments = async (req, res) => {
  return respond(res, await service.listShipments(requestContext(req)));
};
export const getShipment = async (req, res) => {
  return respond(res, await service.getShipment(requestContext(req)));
};
