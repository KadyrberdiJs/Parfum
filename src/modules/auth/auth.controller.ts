import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshAuthGuard } from './guards/refresh-auth.guard';
import type { Request } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

interface AuthRequest extends Request {
    user: { id: number; username: string; role: string, refreshToken: string };
}

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {};

    @Post('login')
    @HttpCode(HttpStatus.OK)
    login(@Body() dto: LoginDto) {
        return this.authService.login(dto);
    };

    @UseGuards(RefreshAuthGuard)
    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    refresh(@Req() req: AuthRequest) {
        return this.authService.refresh(req.user.id, req.user.refreshToken);
    };

    @UseGuards(JwtAuthGuard)
    @Post('logout')
    @HttpCode(HttpStatus.OK)
    logout(@Req() req: AuthRequest) {
        return this.authService.logout(req.user.refreshToken);
    };
}
