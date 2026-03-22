import dotenv from 'dotenv';
dotenv.config();

const { env } = process;

export const envConfig = {
  PORT: Number(env.PORT) || 5000,
  NODE_ENV: env.NODE_ENV || 'development',
  isDev: (env.NODE_ENV || 'development') === 'development',
  isProd: env.NODE_ENV === 'production',
  DEBUG: env.DEBUG || false,

  DATABASE_URL: env.DATABASE_URL!,

  JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET!,
  JWT_REFRESH_SECRET: env.JWT_REFRESH_SECRET!,
  JWT_ACCESS_EXPIRES: env.JWT_ACCESS_EXPIRES || '15m',
  JWT_REFRESH_EXPIRES: env.JWT_REFRESH_EXPIRES || '7d',

  CORS_ORIGIN: env.CORS_ORIGIN || 'http://localhost:5173',

  FINNHUB_API_KEY: env.FINNHUB_API_KEY || '',
  COINGECKO_BASE_URL: env.COINGECKO_BASE_URL || 'https://api.coingecko.com/api/v3',

  TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_CHAT_ID: env.TELEGRAM_CHAT_ID || '',

  PRICE_UPDATE_INTERVAL: env.PRICE_UPDATE_INTERVAL || '*/60 * * * *',
  ALERT_CHECK_INTERVAL: env.ALERT_CHECK_INTERVAL || '*/60 * * * *',
} as const;
