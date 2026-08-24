import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type AuthUser = { id: number; username: string; role: string };

export const CurrentUser = createParamDecorator(
    (data: unknown, context: ExecutionContext): AuthUser => {
        return context.switchToHttp().getRequest().user;
    },
);