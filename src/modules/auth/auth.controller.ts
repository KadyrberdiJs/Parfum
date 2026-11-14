import {
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshAuthGuard } from './guards/refresh-auth.guard';
import { LoginThrottleGuard } from './guards/login-throttle.guard';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
type RefreshRequest = Request & { user: { id: number; refreshToken: string } };
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Post('login')
  @Public()
  @UseGuards(LoginThrottleGuard)
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
  @Post('refresh')
  @Public()
  @UseGuards(RefreshAuthGuard)
  @HttpCode(200)
  refresh(@Req() req: RefreshRequest) {
    return this.authService.refresh(req.user.id, req.user.refreshToken);
  }
  @Post('logout')
  @Public()
  @UseGuards(RefreshAuthGuard)
  @HttpCode(200)
  logout(@Req() req: RefreshRequest) {
    return this.authService.logout(req.user.refreshToken);
  }
  @Post('logout-all')
  @HttpCode(200)
  logoutAll(@CurrentUser() user: AuthUser) {
    return this.authService.logoutAll(user.id);
  }
}
