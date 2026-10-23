import { mutation } from "../middlewares/mutation.js";
import { requestContext, respond } from '../utils/http.js';
import * as service from "../services/cmr-receiving.service.js";
import { receivingSchema } from "../validators/cmr-receiving.schema.js";
export const listShipments = async (req, res) => {
  return respond(res, await service.listShipments(requestContext(req)));
};
export const listStock = async (req, res) => {
  return respond(res, await service.listStock(requestContext(req)));
};
export const getShipment = async (req, res) => {
  return respond(res, await service.getShipment(requestContext(req)));
};
export const receive = mutation(receivingSchema, (connection, data, req) => service.receiveCMR(connection, data, requestContext(req)));
