import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
@Injectable()
export class RefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }
  validate(req: Request, payload: { sub?: unknown; type?: unknown }) {
    const refreshToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    if (
      payload.type !== 'refresh' ||
      !refreshToken ||
      typeof payload.sub !== 'number' ||
      !Number.isInteger(payload.sub)
    )
      throw new UnauthorizedException('Invalid token');
    return { id: payload.sub, refreshToken };
  }
}
