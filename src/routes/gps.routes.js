import * as controller from "../controllers/gps.controller.js";
import { Router } from 'express';
export const gpsPush = Router();
gpsPush.post('/packets', controller.receivePackets);
export const gpsRead = Router();
gpsRead.get('/vehicles/:id/location', controller.getVehicleLocation);
gpsRead.get('/vehicles/:id/history', controller.getVehicleHistory);
