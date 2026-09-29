import 'dotenv/config';
import { z } from 'zod';

const boolFromString = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_URL: z.string().default('http://localhost:3000'),
  DATABASE_URL: z
    .string()
    .default('postgresql://sigmasnap:sigmasnap@localhost:5432/sigmasnap?schema=public'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().default('dev-access-secret-change-me-32chars!!'),
  JWT_REFRESH_SECRET: z.string().default('dev-refresh-secret-change-me-32chars!'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().default('sigmasnap'),
  S3_SECRET_KEY: z.string().default('sigmasnap123'),
  S3_BUCKET: z.string().default('sigmasnap'),
  S3_PUBLIC_URL: z.string().default('http://localhost:9000/sigmasnap'),
  S3_FORCE_PATH_STYLE: boolFromString.default('true'),

  AI_PROVIDER: z.string().default('local'),
  AI_API_KEY: z.string().default(''),
  AI_MODEL: z.string().default(''),

  PUSH_PROVIDER: z.string().default('noop'),
  FCM_SERVER_KEY: z.string().default(''),
  APNS_KEY_ID: z.string().default(''),
  APNS_TEAM_ID: z.string().default(''),

  STUN_URLS: z.string().default('stun:stun.l.google.com:19302'),
  TURN_URL: z.string().default(''),
  TURN_USERNAME: z.string().default(''),
  TURN_CREDENTIAL: z.string().default(''),

  MALWARE_SCANNER: z.string().default('none'),
  CLAMAV_HOST: z.string().default(''),

  SEARCH_PROVIDER: z.string().default('postgres'),
  OPENSEARCH_URL: z.string().default(''),

  OAUTH_GOOGLE_CLIENT_ID: z.string().default(''),
  OAUTH_GOOGLE_CLIENT_SECRET: z.string().default(''),

  SUBSCRIPTION_PROVIDER: z.string().default(''),
  SUBSCRIPTION_API_KEY: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;
export const env: Env = envSchema.parse(process.env);

export const isProd = env.NODE_ENV === 'production';

/** Parse a TTL like "15m", "30d", "3600" into seconds. */
export function ttlToSeconds(ttl: string): number {
  const m = /^(\d+)([smhd])?$/.exec(ttl.trim());
  if (!m) return 900;
  const n = Number(m[1]);
  switch (m[2]) {
    case 's':
      return n;
    case 'm':
      return n * 60;
    case 'h':
      return n * 3600;
    case 'd':
      return n * 86400;
    default:
      return n;
  }
}
