import {Router} from 'express';
import {roles} from '../middlewares/auth.js';
import * as controller from '../controllers/vehicle-map.controller.js';
export const vehicleMapRoutes=Router();
vehicleMapRoutes.post('/map/vehicle-map',roles('ADMIN','OPERATOR','MILLER','PACS','LAMPS','TRANSPORTER'),controller.get);
