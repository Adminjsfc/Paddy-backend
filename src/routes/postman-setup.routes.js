import {Router} from 'express';
import {roles} from '../middlewares/auth.js';
import {load} from '../controllers/postman-setup.controller.js';
export const postmanSetupRoutes=Router();
postmanSetupRoutes.get('/setup/postman',roles('ADMIN','OPERATOR'),load);
