import { mutation } from "../middlewares/mutation.js";
import { requestContext, respond } from '../utils/http.js';
import * as service from "../services/cmr-submissions.service.js";
import { cmrSubmissionSchema } from "../validators/cmr-submissions.schema.js";
export const getSubmissionOptions = async (req, res) => {
  return respond(res, await service.getSubmissionOptions(requestContext(req)));
};
export const listEligibleVehicles = async (req, res) => {
  return respond(res, await service.listEligibleVehicles(requestContext(req)));
};
export const getVehicle = async (req, res) => {
  return respond(res, await service.getVehicle(requestContext(req)));
};
export const submit = mutation(cmrSubmissionSchema, (connection, data, req) => service.submitCMR(connection, data, requestContext(req)));
