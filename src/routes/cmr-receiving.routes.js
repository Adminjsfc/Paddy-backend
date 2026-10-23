import * as controller from "../controllers/cmr-receiving.controller.js";
import { Router } from 'express';
import { verifyCoreReceiver } from "../middlewares/verifyCoreReceiver.js";
export const cmrReceivingRoutes = Router();
cmrReceivingRoutes.use(verifyCoreReceiver);
cmrReceivingRoutes.get('/shipments', controller.listShipments);
cmrReceivingRoutes.get('/stock', controller.listStock);
cmrReceivingRoutes.get('/shipments/:id', controller.getShipment);
cmrReceivingRoutes.post('/shipments/:id/receive', controller.receive);
