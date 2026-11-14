import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../../../generated/prisma/enums';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { AuthUser } from '../../../common/decorators/current-user.decorator';
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles) return true;
    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    return !!user && roles.includes(user.role);
  }
}
