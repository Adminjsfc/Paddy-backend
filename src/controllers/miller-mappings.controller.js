import {requestContext,respond} from '../utils/http.js';
import * as service from '../services/miller-mappings.service.js';

export const listMappings=async(req,res)=>respond(res,await service.listMappings(requestContext(req)));
