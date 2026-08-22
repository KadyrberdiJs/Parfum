import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt'
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
    constructor(
        private userService: UsersService,
        private jwtService: JwtService,
    ) {};

    async login(dto: LoginDto) {
        const user = await this.userService.findByUserName(dto.username);

        if(! user || !(await bcrypt.compare(dto.password, user.password))) {
            throw new UnauthorizedException('Invalid credentials!');
        };

        const payload = { sub: user.id, username: user.username, role: user.role };

        return { accessToken: await this.jwtService.signAsync(payload) };
    }
}
