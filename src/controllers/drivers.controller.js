import {mutation} from '../middlewares/mutation.js';
import {driver} from '../validators/schemas.js';
import {requestContext, respond} from '../utils/http.js';
import * as service from '../services/drivers.service.js';
export const create = mutation(driver, (connection,data,req) => service.ensureDriver(connection,data,requestContext(req)));
export const list = async (req,res) => respond(res,await service.listDrivers(requestContext(req)));
