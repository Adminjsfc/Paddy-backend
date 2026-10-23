import { z } from 'zod';
import { mutation } from "../middlewares/mutation.js";
import * as S from "../validators/schemas.js";
import { requestContext, respond } from '../utils/http.js';
import * as service from "../services/modules.service.js";
import { moduleCatalog } from "../config/modules.js";
export const listAssignedModules = async (req, res) => {
  return respond(res, await service.listAssignedModules(requestContext(req)));
};
export const listModulePermissions = async (req, res) => {
  return respond(res, await service.listModulePermissions(requestContext(req)));
};
export const updateModulePermissions = mutation(z.object({
  role: z.literal('MILLER'),
  modules: z.array(z.object({
    key: z.enum(moduleCatalog.map(module => module.key)),
    can_view: z.boolean(),
    can_add: z.boolean(),
    can_edit: z.boolean()
  }).strict()).min(1).max(moduleCatalog.length)
}).strict().refine(data => new Set(data.modules.map(module => module.key)).size === data.modules.length, 'Duplicate modules'), (connection, data, req) => service.updateModulePermissions(connection, data, requestContext(req)));
export const getProfile = async (req, res) => {
  return respond(res, await service.getProfile(requestContext(req)));
};
export const updateProfile = mutation(S.user.pick({
  name: true,
  email: true
}).partial().strict().refine(data => Object.keys(data).length > 0, 'At least one field required'), (connection, data, req) => service.updateProfile(connection, data, requestContext(req)));
export const listMillerMasterOptions = async (req, res) => {
  return respond(res, await service.listMillerMasterOptions(requestContext(req)));
};
