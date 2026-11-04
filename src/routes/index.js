import { auth, apiKey } from "../middlewares/auth.js";
import { authRoutes } from "./auth.routes.js";
import { masters } from "./masters.routes.js";
import { procurementRoutes } from "./procurement.routes.js";
import { pushApiRoutes } from './push-api/index.js';
import { shipmentRoutes } from "./shipments.routes.js";
import { gpsPush, gpsRead } from "./gps.routes.js";
import { reportRoutes } from "./reports.routes.js";
import { storeAssignments } from "./store-assignments.routes.js";
import { millerRoutes, coreMillerRoutes } from "./millers.routes.js";
import { moduleRoutes } from "./modules.routes.js";
import { moduleGuard } from "../middlewares/module-access.js";
import { cmrSubmissionRoutes } from "./cmr-submissions.routes.js";
import { cmrReceivingRoutes } from "./cmr-receiving.routes.js";
import {paddyOrderRoutes} from './paddy-orders.routes.js';
import {postmanSetupRoutes} from './postman-setup.routes.js';
import {driverRoutes} from './drivers.routes.js';
export function registerApiRoutes(app) {
  authRoutes(app);
  app.use('/api/v1/core/receiving', cmrReceivingRoutes);
  app.use('/api/v1/core', coreMillerRoutes);
  app.use('/api/v1/integrations/euparjan', apiKey('EUPARJAN_API_KEY', 'INTEGRATION'), pushApiRoutes);
  app.use('/api/v1/gps', apiKey('GPS_API_KEY', 'GPS'), gpsPush);
  app.use('/api/v1', auth, moduleGuard, driverRoutes, postmanSetupRoutes, moduleRoutes, paddyOrderRoutes, cmrSubmissionRoutes, millerRoutes, masters, storeAssignments, procurementRoutes, shipmentRoutes, gpsRead, reportRoutes);
}
