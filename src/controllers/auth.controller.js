import { mutation } from "../middlewares/mutation.js";
import * as S from "../validators/schemas.js";
import { requestContext, respond } from '../utils/http.js';
import * as service from "../services/auth.service.js";
export const login = async (req, res) => {
  return respond(res, await service.login(requestContext(req)));
};
export const getCurrentUser = async (req, res) => {
  return respond(res, await service.getCurrentUser(requestContext(req)));
};
export const refreshSession = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  return respond(res, await service.refreshSession(requestContext(req)));
};
export const logout = async (req, res) => {
  return respond(res, await service.logout(requestContext(req)));
};
export const changePassword = async (req, res) => {
  return respond(res, await service.changePassword(requestContext(req)));
};
export const createUser = mutation(S.user, (connection, data, req) => service.createUser(connection, data, requestContext(req)));
export const listUsers = async (req, res) => {
  return respond(res, await service.listUsers(requestContext(req)));
};
export const setUserStatus = mutation(S.activePatch, (connection, data, req) => service.setUserStatus(connection, data, requestContext(req)));
