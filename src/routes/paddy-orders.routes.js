import {Router} from 'express';
import {roles} from '../middlewares/auth.js';
import {liftingMillers,listMappedSources,liftingFacility,liftingVehicles,sourceLiftingSummary} from '../controllers/paddy-orders.controller.js';
import {listMappings} from '../controllers/miller-mappings.controller.js';

export const paddyOrderRoutes=Router();
paddyOrderRoutes.get('/paddy/lifting-summary',roles('PACS','LAMPS'),sourceLiftingSummary);
paddyOrderRoutes.get('/miller-mappings',roles('MILLER'),listMappings);
paddyOrderRoutes.get('/paddy/mapped-sources',roles('MILLER'),listMappedSources);
paddyOrderRoutes.get('/paddy/lifting-facility',roles('PACS','LAMPS'),liftingFacility);
paddyOrderRoutes.get('/paddy/lifting-vehicles',roles('PACS','LAMPS'),liftingVehicles);
paddyOrderRoutes.get('/paddy/lifting-millers',roles('PACS','LAMPS'),liftingMillers);
