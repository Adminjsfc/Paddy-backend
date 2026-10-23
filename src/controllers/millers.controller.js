import { mutation } from "../middlewares/mutation.js";
import { requestContext, respond } from '../utils/http.js';
import * as service from "../services/millers.service.js";
import { millerRegistrationSchema } from "../validators/millers.schema.js";
export const registerLocalMiller = mutation(millerRegistrationSchema, (connection, data, req) => service.registerLocalMiller(connection, data, requestContext(req)));
export const listLocationOptions = async (req, res) => {
  return respond(res, await service.listLocationOptions(requestContext(req)));
};
export const registerCoreDMMiller = mutation(millerRegistrationSchema, (connection, data, req) => service.registerCoreDMMiller(connection, data, requestContext(req)));
