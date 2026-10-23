import { Router } from 'express';
import { live, ready } from '../controllers/health.controller.js';
export const healthRoutes = Router();
healthRoutes.get('/health/live', live);
healthRoutes.get('/health/ready', ready);
