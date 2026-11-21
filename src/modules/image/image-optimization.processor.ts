import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  IMAGE_OPTIMIZATION_QUEUE,
  ImageService,
  OptimizeImageJobData,
} from './image.service';

@Processor(IMAGE_OPTIMIZATION_QUEUE, { concurrency: 2 })
export class ImageOptimizationProcessor extends WorkerHost {
  private readonly logger = new Logger(ImageOptimizationProcessor.name);

  constructor(private readonly imageService: ImageService) {
    super();
  }

  process(job: Job<OptimizeImageJobData>) {
    return this.imageService.optimizeStoredImage(job.data);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<OptimizeImageJobData> | undefined, error: Error) {
    const imageId = job?.data.imageId ?? 'unknown';
    this.logger.warn(
      `Image optimization failed for image ${imageId} (job ${job?.id ?? 'unknown'}): ${error.message}`,
    );
  }
}
