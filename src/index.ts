import { createBot } from './app/runtime.js';
import { loadEnv } from './app/env.js';
import { createLogger } from './app/logger.js';

const env = loadEnv();
const logger = createLogger(env);
const client = createBot(env, logger);

client.login(env.DISCORD_TOKEN).catch((error) => {
  logger.error({ err: error }, 'failed to login');
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    logger.info({ signal }, 'shutting down');
    await client.destroy();
    process.exit(0);
  });
}
