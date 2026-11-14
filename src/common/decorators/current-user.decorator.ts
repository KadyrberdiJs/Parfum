import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/enums';
export type AuthUser = { id: number; username: string; role: UserRole };
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
