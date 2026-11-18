import * as controller from "../controllers/reports.controller.js";
import { Router } from 'express';
import { roles } from "../middlewares/auth.js";
import {getProcurementDashboard} from '../services/procurement-dashboard.service.js';
import {requestContext} from '../utils/http.js';
export const reportRoutes = Router();
reportRoutes.get('/dashboards/paddy/:view',roles('ADMIN','PACS','LAMPS','MILLER'),async(req,res)=>{
  res.json({ok:true,data:await getProcurementDashboard(requestContext(req),req.params.view)});
});
reportRoutes.get('/reports/dashboard/vehicles',roles('MILLER'),controller.dashboardVehicles);
reportRoutes.get('/reports/lifting-summary',roles('MILLER'),controller.liftingSummary);
reportRoutes.get('/reports/stocks', roles('ADMIN', 'OPERATOR', 'MILLER', 'PACS', 'LAMPS'), controller.listStocks);
reportRoutes.get('/reports/ledger', roles('ADMIN', 'OPERATOR', 'MILLER', 'PACS', 'LAMPS'), controller.listLedger);
reportRoutes.get('/reports/millers/:id/reconciliation', roles('ADMIN', 'OPERATOR', 'MILLER'), controller.getMillerReconciliation);
reportRoutes.get('/reports/store-assignments', roles('ADMIN', 'OPERATOR'), controller.listStoreAssignments);
reportRoutes.get('/reports/dashboard', controller.getDashboard);
reportRoutes.get('/reports/audit', roles('ADMIN'), controller.listAudit);
reportRoutes.get('/procurements/available-lots', roles('ADMIN', 'OPERATOR', 'MILLER', 'PACS', 'LAMPS'), controller.listAvailableLots);
