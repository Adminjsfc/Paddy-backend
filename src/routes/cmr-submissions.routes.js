import * as controller from "../controllers/cmr-submissions.controller.js";
import { Router } from 'express';
import { roles } from "../middlewares/auth.js";
export const cmrSubmissionRoutes = Router();
cmrSubmissionRoutes.use('/cmr', roles('MILLER'));
cmrSubmissionRoutes.get('/cmr/submission-options', controller.getSubmissionOptions);
cmrSubmissionRoutes.get('/cmr/vehicles', controller.listEligibleVehicles);
cmrSubmissionRoutes.get('/cmr/vehicle', controller.getVehicle);
cmrSubmissionRoutes.post('/cmr/submissions', controller.submit);
