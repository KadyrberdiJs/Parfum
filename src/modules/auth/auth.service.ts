import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, User } from '../../../generated/prisma/client';
import { createHash, randomUUID } from 'crypto';
@Injectable()
export class AuthService {
  constructor(
    private userService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}
  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  private async generateTokens(
    user: Pick<User, 'id' | 'username' | 'role'>,
    db: Prisma.TransactionClient,
  ) {
    const payload = { sub: user.id, username: user.username, role: user.role };
    const expiresAt = new Date(
      (Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60) * 1000,
    );
    const accessToken = await this.jwtService.signAsync({
      ...payload,
      type: 'access',
    });
    const refreshToken = await this.jwtService.signAsync(
      { ...payload, type: 'refresh' },
      { expiresIn: '30d', jwtid: randomUUID() },
    );
    await db.refreshToken.create({
      data: {
        tokenHash: this.hashToken(refreshToken),
        userId: user.id,
        expiresAt,
      },
    });
    return { accessToken, refreshToken };
  }
  async login(dto: LoginDto) {
    const user = await this.userService.findByUserName(dto.username);
    if (
      !user ||
      !user.isActive ||
      !(await bcrypt.compare(dto.password, user.password))
    )
      throw new UnauthorizedException('Invalid credentials');
    return this.prisma.$transaction(
      async (tx) => {
        const current = await tx.user.findUnique({ where: { id: user.id } });
        if (!current || !current.isActive || current.password !== user.password)
          throw new UnauthorizedException('Invalid credentials');
        return this.generateTokens(current, tx);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async refresh(userId: number, refreshToken: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user || !user.isActive)
          throw new UnauthorizedException('Access denied');
        const consumed = await tx.refreshToken.deleteMany({
          where: {
            tokenHash: this.hashToken(refreshToken),
            userId,
            expiresAt: { gt: new Date() },
          },
        });
        if (consumed.count !== 1)
          throw new UnauthorizedException(
            'Refresh token expired or already used',
          );
        return this.generateTokens(user, tx);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async logout(refreshToken: string) {
    await this.prisma.refreshToken.deleteMany({
      where: { tokenHash: this.hashToken(refreshToken) },
    });
    return { message: 'Logged out successfully' };
  }
  async logoutAll(userId: number) {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    return { message: 'All refresh sessions revoked' };
  }
}
