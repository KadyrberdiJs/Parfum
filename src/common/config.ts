const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379';

export function validateEnvironment(env: Record<string, unknown>) {
  for (const key of ['DATABASE_URL', 'JWT_SECRET']) {
    if (typeof env[key] !== 'string' || !env[key].trim())
      throw new Error(`${key} is required`);
  }
  if ((env.JWT_SECRET as string).length < 32)
    throw new Error('JWT_SECRET must contain at least 32 characters');
  const url = new URL(env.DATABASE_URL as string);
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('DATABASE_URL must be a PostgreSQL URL');
  if (typeof env.REDIS_URL === 'string' && env.REDIS_URL.trim()) {
    parseRedisUrl(env.REDIS_URL);
  }
  return env;
}

export function buildRedisConnection(rawUrl?: string) {
  const url = parseRedisUrl(rawUrl?.trim() || DEFAULT_REDIS_URL);
  const dbPath = url.pathname.replace(/^\//, '');
  const db = dbPath ? Number(dbPath) : undefined;
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: db !== undefined && Number.isInteger(db) && db >= 0 ? db : undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
  };
}

function parseRedisUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!['redis:', 'rediss:'].includes(url.protocol))
    throw new Error('REDIS_URL must be a Redis URL');
  return url;
}
