import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import cron from 'node-cron';
import { registerRoutes } from './modules/express/router';
import { RoutesConfig } from './routesConfig';
import { envConfig } from './config/envConfig';
import { errorHandler } from './middleware/errorHandler';
import { updatePrices, checkAlerts } from './jobs/priceUpdater';
import logger from './utils/logger';

const app = express();

// Middleware
app.use(helmet());
app.use(cors({ origin: envConfig.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(pinoHttp({ logger }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Register all routes
const router = express.Router();
registerRoutes(router, RoutesConfig());
app.use(router);

// Error handler
app.use(errorHandler);

// Start server
app.listen(envConfig.PORT, () => {
  logger.info(`Server running on port ${envConfig.PORT} [${envConfig.NODE_ENV}]`);

  // Start cron jobs
  cron.schedule(envConfig.PRICE_UPDATE_INTERVAL, () => {
    logger.debug('Running price update job');
    updatePrices();
  });

  cron.schedule(envConfig.ALERT_CHECK_INTERVAL, () => {
    logger.debug('Running alert check job');
    checkAlerts();
  });

  logger.info('Cron jobs started');
});
