import {Router} from 'express';
import {roles} from '../middlewares/auth.js';
import * as controller from '../controllers/manual-stock.controller.js';
export const manualStockRoutes=Router();
manualStockRoutes.post('/stocks',roles('ADMIN','OPERATOR'),controller.add);
manualStockRoutes.patch('/stocks/:id',roles('ADMIN','OPERATOR'),controller.update);
