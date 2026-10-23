import * as controller from "../controllers/millers.controller.js";
import { Router } from 'express';
import { roles } from "../middlewares/auth.js";
import { verifyCoreDM } from "../middlewares/verifyCoreDM.js";
import { dmSetupRoutes } from "./dm-setup.routes.js";
export const millerRoutes = Router();
// A local administrator can provision both facility and login. A core DM must
// first have an explicitly verified server-side authorization integration.
millerRoutes.post('/millers/register', roles('ADMIN'), controller.registerLocalMiller);
export const coreMillerRoutes = Router();
coreMillerRoutes.use(verifyCoreDM);
coreMillerRoutes.use('/dm', dmSetupRoutes);
coreMillerRoutes.get('/location-options', controller.listLocationOptions);
coreMillerRoutes.post('/millers/register', controller.registerCoreDMMiller);
