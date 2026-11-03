import * as service from '../services/paddy-orders.service.js';
import {listMappedSources as mappedSources} from '../services/paddy-orders.service.js';
import {requestContext,respond,respondReport} from '../utils/http.js';

export const listMappedSources=async(req,res)=>respond(res,await mappedSources(requestContext(req)));

export const liftingVehicles=async(req,res)=>respond(res,await service.liftingVehicles(requestContext(req)));

export const liftingMillers=async(req,res)=>respond(res,await service.liftingMillers(requestContext(req)));
export const sourceLiftingSummary=async(req,res)=>respondReport(res,await service.sourceLiftingSummary(requestContext(req)));
