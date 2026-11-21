import * as controller from "../controllers/cmr-submissions.controller.js";
import { Router } from 'express';
import { roles } from "../middlewares/auth.js";
export const cmrSubmissionRoutes = Router();
cmrSubmissionRoutes.get(['/cmr/seasons','/cmr/dropdowns/seasons'],controller.dropdown('seasons'));
cmrSubmissionRoutes.use('/cmr', roles('MILLER'));
for(const name of ['districts','stores','orders'])
  cmrSubmissionRoutes.get(`/cmr/${name}`,controller.dropdown(name));
for(const name of ['schemes','commodities','districts','stores','orders'])
  cmrSubmissionRoutes.get(`/cmr/dropdowns/${name}`,controller.dropdown(name));
cmrSubmissionRoutes.get('/cmr/dropdowns/vehicles',controller.listEligibleVehicles);
cmrSubmissionRoutes.get('/cmr/submission-options', controller.getSubmissionOptions);
cmrSubmissionRoutes.get('/cmr/vehicles', controller.listEligibleVehicles);
cmrSubmissionRoutes.get('/cmr/vehicle', controller.getVehicle);
cmrSubmissionRoutes.post('/cmr/submissions', controller.submit);
