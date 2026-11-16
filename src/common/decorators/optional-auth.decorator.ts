import { SetMetadata } from '@nestjs/common';
export const OPTIONAL_AUTH_KEY = 'optional-auth';
export const OptionalAuth = (enabled = true) =>
  SetMetadata(OPTIONAL_AUTH_KEY, enabled);
