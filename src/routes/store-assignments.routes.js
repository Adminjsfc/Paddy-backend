import * as controller from "../controllers/store-assignments.controller.js";
import { Router } from 'express';
import { roles } from "../middlewares/auth.js";
export const storeAssignments = Router();
storeAssignments.post('/miller-store-assignments', roles('ADMIN', 'OPERATOR'), controller.createMillerStoreAssignments);
storeAssignments.get('/miller-store-assignments', roles('ADMIN', 'OPERATOR'), controller.listMillerStoreAssignments);
storeAssignments.get('/miller-store-assignment-options', roles('ADMIN', 'OPERATOR'), controller.listMillerStoreAssignmentOptions);
storeAssignments.patch('/miller-store-assignments/:id/status', roles('ADMIN', 'OPERATOR'), controller.setAssignmentStatus);
