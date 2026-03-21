import type { Config } from 'drizzle-kit';
import { envConfig } from './src/config/envConfig';

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: envConfig.DATABASE_URL,
  },
} satisfies Config;
