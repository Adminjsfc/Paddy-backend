import {requestContext,respond} from '../utils/http.js';
import {getVehicleMap} from '../services/vehicle-map.service.js';
export const get=async(req,res)=>respond(res,await getVehicleMap(requestContext(req)));
