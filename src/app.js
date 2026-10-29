import { healthRoutes } from './routes/health.routes.js';
import { registerApiRoutes } from './routes/index.js';
import { requestId, notFound, errorHandler } from './middlewares/errors.js';
import express from 'express';
import { secondsJsonReplacer } from './utils/datetime.js';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { browserAccess } from "./middlewares/browser-session.js";
export function createApp() {
  const app = express();
  app.set('json replacer', secondsJsonReplacer);
  app.disable('x-powered-by');
  if (Number(process.env.TRUST_PROXY_HOPS || 0) > 0) app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS));
  app.use(helmet());
  app.use(express.json({
    limit: '2mb'
  }));
  app.use(requestId);
  app.use((req, res, next) => {
    const prefix = '/paddyapi';
    if (req.url === prefix || req.url.startsWith(`${prefix}/`) || req.url.startsWith(`${prefix}?`)) {
      req.url = `/api/v1${req.url.slice(prefix.length)}`;
    }
    next();
  });
  app.use('/api/v1', browserAccess);
  app.use(healthRoutes);
  app.use('/api', rateLimit({
    windowMs: 60000,
    limit: 1200,
    standardHeaders: 'draft-8',
    legacyHeaders: false
  }));
  registerApiRoutes(app);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
