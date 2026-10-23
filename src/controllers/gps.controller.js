import { requestContext, respond } from '../utils/http.js';
import * as service from "../services/gps.service.js";
export const receivePackets = async (req, res) => {
  return respond(res, await service.receivePackets(requestContext(req)));
};
export const getVehicleLocation = async (req, res) => {
  return respond(res, await service.getVehicleLocation(requestContext(req)));
};
export const getVehicleHistory = async (req, res) => {
  return respond(res, await service.getVehicleHistory(requestContext(req)));
};
