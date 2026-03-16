import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_APPLICATION_ID: z.string().min(1),
  DATABASE_PATH: z.string().min(1).default('./data/iris.db'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
});

export type AppEnv = z.infer<typeof envSchema>;
export type BaseEnv = Pick<AppEnv, 'DATABASE_PATH' | 'LOG_LEVEL'>;

const baseEnvSchema = envSchema.pick({
  DATABASE_PATH: true,
  LOG_LEVEL: true,
});

export function loadEnv(): AppEnv {
  const parsed = envSchema.parse({
    DISCORD_TOKEN: process.env.DISCORD_TOKEN,
    DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID,
    DATABASE_PATH: process.env.DATABASE_PATH ?? './data/iris.db',
    LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
  });

  return {
    ...parsed,
    DATABASE_PATH: path.resolve(parsed.DATABASE_PATH),
  };
}

export function loadBaseEnv(): BaseEnv {
  const parsed = baseEnvSchema.parse({
    DATABASE_PATH: process.env.DATABASE_PATH ?? './data/iris.db',
    LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
  });

  return {
    ...parsed,
    DATABASE_PATH: path.resolve(parsed.DATABASE_PATH),
  };
}
