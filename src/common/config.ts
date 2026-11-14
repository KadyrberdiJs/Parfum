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
  return env;
}
