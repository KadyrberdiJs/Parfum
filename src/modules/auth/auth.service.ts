import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt'
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';

@Injectable()
export class AuthService {
    constructor(
        private userService: UsersService,
        private jwtService: JwtService,
        private prisma: PrismaService,
    ) {};

    private hashToken(token: string) {
        return createHash('sha256').update(token).digest('hex')
    };

    private async generateTokens(user: { id: number; username: string; role: string }) {
        const payload = { sub: user.id, username: user.username, role: user.role };

        const accessToken = await this.jwtService.signAsync(payload);

        const refreshToken = await this.jwtService.signAsync(payload, {
            secret: process.env.JWT_REFRESH_SECRET,
            expiresIn: '30d',
        });

        await this.prisma.refreshToken.create({
            data: {
                tokenHash: this.hashToken(refreshToken),
                userId: user.id,
                expiresAt: new Date(Date.now() + 30 *24 * 60 * 60)
            }
        })

        return { accessToken, refreshToken };
    }

    async login(dto: LoginDto) {
        const user = await this.userService.findByUserName(dto.username);

        if(! user || !(await bcrypt.compare(dto.password, user.password))) {
            throw new UnauthorizedException('Invalid credentials!');
        };

        return await this.generateTokens(user);
    }

    async refresh(userId: number, refreshToken: string) {
        const stored = await this.prisma.refreshToken.findUnique({
            where: { tokenHash: this.hashToken(refreshToken) }
        });

        if (!stored || stored.userId !== userId) {
            await this.prisma.refreshToken.deleteMany({ where: { userId: userId } });
            throw new UnauthorizedException('Access denied!');
        };

        await this.prisma.refreshToken.delete({ where: { id: stored.id } });

        const user = await this.userService.findOne(userId);
        return await this.generateTokens(user);
    };

    async logout(refreshToken: string) {
        await this.prisma.refreshToken.deleteMany({ where: { tokenHash: this.hashToken(refreshToken) } });
        return { message: 'Logged out successfully!' };
    };

    async logoutAll(userId: number) {
        await this.prisma.refreshToken.deleteMany({ where: { userId } });
}
}
