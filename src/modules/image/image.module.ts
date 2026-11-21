import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ImageOptimizationProcessor } from './image-optimization.processor';
import { IMAGE_OPTIMIZATION_QUEUE, ImageService } from './image.service';
import { ImageStorage } from './image-storage';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: IMAGE_OPTIMIZATION_QUEUE }),
  ],
  providers: [ImageService, ImageStorage, ImageOptimizationProcessor],
  exports: [ImageService],
})
export class ImageModule {}
