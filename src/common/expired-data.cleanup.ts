import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../modules/prisma/prisma.service';

const ONE_HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class ExpiredDataCleanup
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ExpiredDataCleanup.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    this.timer = setInterval(
      () => void this.deleteExpiredRows(),
      ONE_HOUR_MS,
    ).unref();
    return this.deleteExpiredRows();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async deleteExpiredRows() {
    try {
      const now = new Date();
      await this.prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: now } },
      });
      await this.prisma.cart.deleteMany({
        where: { userId: null, expiresAt: { lt: now } },
      });
    } catch (error) {
      this.logger.warn(`Could not delete expired rows: ${String(error)}`);
    }
  }
}
