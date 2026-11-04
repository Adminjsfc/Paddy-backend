import { Router } from 'express';
import { roles } from '../middlewares/auth.js';
import * as controller from '../controllers/drivers.controller.js';

export const driverRoutes=Router();
driverRoutes.post('/tripsummary_for_driver',roles('DRIVER'),controller.tripSummary);
driverRoutes.post('/driver_detailsList',roles('DRIVER'),controller.details);
driverRoutes.post('/active_tripList',roles('DRIVER'),controller.active);
driverRoutes.post('/getTripDetailsForDriver',roles('DRIVER'),controller.tripDetails);
driverRoutes.post('/alert_report_for_driver',roles('DRIVER'),controller.alerts);
