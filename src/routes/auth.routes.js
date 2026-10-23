import { roles, auth } from "../middlewares/auth.js";
import * as controller from "../controllers/auth.controller.js";
import { rateLimit } from 'express-rate-limit';
export function authRoutes(app) {
  app.post(['/api/v1/auth/login', '/api/v1/multilogin'], rateLimit({
    windowMs: 15 * 60000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false
  }), controller.login);
  app.get('/api/v1/auth/me', auth, controller.getCurrentUser);
  app.post(['/api/v1/auth/refresh', '/api/v1/refresh-token'], rateLimit({
    windowMs: 60000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false
  }), controller.refreshSession);
  app.post(['/api/v1/auth/logout', '/api/v1/all_userlogout'], controller.logout);
  app.post(['/api/v1/auth/password', '/api/v1/changePassword'], auth, controller.changePassword);
  app.post('/api/v1/users', auth, roles('ADMIN'), controller.createUser);
  app.get('/api/v1/users', auth, roles('ADMIN'), controller.listUsers);
  app.patch('/api/v1/users/:id/status', auth, roles('ADMIN'), controller.setUserStatus);
}
