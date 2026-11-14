import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }
  async validate(payload: { sub?: unknown; type?: unknown }) {
    if (
      payload.type !== 'access' ||
      typeof payload.sub !== 'number' ||
      !Number.isInteger(payload.sub)
    )
      throw new UnauthorizedException('Invalid token');
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, role: true, isActive: true },
    });
    if (!user || !user.isActive)
      throw new UnauthorizedException('Account unavailable');
    return { id: user.id, username: user.username, role: user.role };
  }
}
