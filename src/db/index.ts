import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { envConfig } from '../config/envConfig';
import * as schema from './schema';
import logger from '../utils/logger';

const pool = new Pool({
  connectionString: envConfig.DATABASE_URL,
});

pool.on('error', (err) => {
  logger.error(err, 'Unexpected error on idle client');
  process.exit(-1);
});

export const db = drizzle(pool, { schema });

export { pool };
