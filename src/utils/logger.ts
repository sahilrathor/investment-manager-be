import pino from 'pino';
import { envConfig } from '../config/envConfig';

const logger = pino({
  level: envConfig.isProd ? 'info' : 'debug',
  transport: envConfig.isDev
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

export default logger;
