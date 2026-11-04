import {requestContext,respond} from '../utils/http.js';
import {postmanSetup} from '../services/postman-setup.service.js';
export const load=async(req,res)=>respond(res,await postmanSetup(requestContext(req)));
