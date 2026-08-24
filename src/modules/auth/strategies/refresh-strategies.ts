import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

@Injectable()
export class RefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
    constructor() {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.JWT_REFRESH_SECRET as string,
            passReqToCallback: true,
        });
    };

    validate(req: Request, payload: { sub: number; username: string; role: string }) {
        const refreshToken = req.get('authorization')!.replace('Bearer ', '').trim();

        return { id: payload.sub, username: payload.username, role: payload.role, refreshToken: refreshToken };
    };
}
