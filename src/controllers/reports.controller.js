import { requestContext, respond } from '../utils/http.js';
import * as service from "../services/reports.service.js";
export const dashboardVehicles=async(req,res)=>respond(res,await service.dashboardVehicles(requestContext(req)));
export const liftingSummary=async(req,res)=>respond(res,await service.liftingSummary(requestContext(req)));
export const listStocks = async (req, res) => {
  return respond(res, await service.listStocks(requestContext(req)));
};
export const listLedger = async (req, res) => {
  return respond(res, await service.listLedger(requestContext(req)));
};
export const getMillerReconciliation = async (req, res) => {
  return respond(res, await service.getMillerReconciliation(requestContext(req)));
};
export const listStoreAssignments = async (req, res) => {
  return respond(res, await service.listStoreAssignments(requestContext(req)));
};
export const getDashboard = async (req, res) => {
  return respond(res, await service.getDashboard(requestContext(req)));
};
export const listAudit = async (req, res) => {
  return respond(res, await service.listAudit(requestContext(req)));
};
export const listAvailableLots = async (req, res) => {
  return respond(res, await service.listAvailableLots(requestContext(req)));
};
