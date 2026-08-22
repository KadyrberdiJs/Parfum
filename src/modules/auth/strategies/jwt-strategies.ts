import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { UsersService } from "src/modules/users/users.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private userService: UsersService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.JWT_SECRET as string,
        });
    };

    async validate(payload: { sub: number; username: string; role: string }) {
        const user = await this.userService.findOne(payload.sub)

        if (!user || !user.isActive) {
            throw new UnauthorizedException('You are not an active member anymore!');
        }

        return { id: payload.sub, username: payload.username, role: payload.role };
    };
}