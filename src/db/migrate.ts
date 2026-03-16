import { loadBaseEnv } from '../app/env.js';
import { createLogger } from '../app/logger.js';
import { createDatabase } from './client.js';

const env = loadBaseEnv();
const logger = createLogger(env);

const handle = createDatabase(env.DATABASE_PATH);
logger.info({ path: env.DATABASE_PATH }, 'database bootstrap completed');
handle.close();
