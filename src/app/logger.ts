import pino from 'pino';
import type { BaseEnv } from './env.js';

export function createLogger(env: BaseEnv) {
  return pino({
    level: env.LOG_LEVEL,
  });
}
