import * as controller from "../controllers/millers.controller.js";
import { Router } from 'express';
import { roles } from "../middlewares/auth.js";
import { verifyCoreDM } from "../middlewares/verifyCoreDM.js";
import { dmSetupRoutes } from "./dm-setup.routes.js";
export const millerRoutes = Router();
// A local administrator can provision both facility and login. A core DM must
// first have an explicitly verified server-side authorization integration.
millerRoutes.post('/millers/register', roles('ADMIN'), controller.registerLocalMiller);
import * as masterController from '../controllers/masters.controller.js';
import { configs, profilePatches } from '../config/masters.js';
export const coreMillerRoutes = Router();
coreMillerRoutes.use(verifyCoreDM);
coreMillerRoutes.get('/vehicles', masterController.listMasterRecords('vehicles', 'vehicles'));
coreMillerRoutes.post('/vehicles', masterController.createMasterRecord(configs.vehicles, 'vehicles'));
coreMillerRoutes.patch('/vehicles/:id', masterController.updateMasterProfile(profilePatches.vehicles, 'vehicles'));
coreMillerRoutes.patch('/vehicles/:id/status', masterController.setMasterStatus('vehicles'));
coreMillerRoutes.get('/imeis', masterController.listMasterRecords('imeis', 'imeis'));
coreMillerRoutes.post('/imeis', masterController.createMasterRecord(configs.imeis, 'imeis'));
coreMillerRoutes.patch('/imeis/:id', masterController.updateMasterProfile(profilePatches.imeis, 'imeis'));
coreMillerRoutes.patch('/imeis/:id/status', masterController.setMasterStatus('imeis'));
coreMillerRoutes.use('/dm', dmSetupRoutes);
coreMillerRoutes.get('/location-options', controller.listLocationOptions);
coreMillerRoutes.post('/millers/register', controller.registerCoreDMMiller);
