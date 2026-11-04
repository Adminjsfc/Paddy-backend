import { Router } from 'express';
import * as procurement from '../../controllers/procurement.controller.js';
import { createMillerStoreAssignments } from '../../controllers/store-assignments.controller.js';
import { masterPush } from '../masters.routes.js';

// Mounted behind integration API-key authentication in routes/index.js.
export const pushApiRoutes = Router();
pushApiRoutes.post('/procurements', procurement.importProcurements);
pushApiRoutes.patch('/procurements/:id', procurement.updateProcurement);
pushApiRoutes.post('/cmr-orders', procurement.importCmrOrders);
pushApiRoutes.post('/miller-store-assignments', createMillerStoreAssignments);
pushApiRoutes.use('/masters', masterPush);
