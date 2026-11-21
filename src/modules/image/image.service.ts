import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { ImageStorage, StoredFile } from './image-storage';

export const IMAGE_OPTIMIZATION_QUEUE = 'image-optimization';
export const OPTIMIZE_IMAGE_JOB = 'optimize';
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

export type OptimizeImageJobData = {
  imageId: number;
  storageKey: string;
};

const MAX_IMAGE_SIDE_PX = 1600;
const AVIF_QUALITY = 65;
// sharp reports AVIF input as "heif".
const ACCEPTED_INPUT_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif']);
const OPTIMIZATION_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: true,
  removeOnFail: { count: 100 },
} as const;

@Injectable()
export class ImageService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ImageService.name);

  constructor(
    private prisma: PrismaService,
    private storage: ImageStorage,
    @InjectQueue(IMAGE_OPTIMIZATION_QUEUE)
    private optimizationQueue: Queue<OptimizeImageJobData>,
  ) {}

  // Catches up on files whose images were deleted while the app was down.
  onApplicationBootstrap() {
    return this.deleteQueuedFiles();
  }

  // Validates every upload before writing anything, so one bad file stores nothing.
  async storeUploads(files: Express.Multer.File[]) {
    const validatedUploads: { buffer: Buffer; extension: string }[] = [];
    for (const file of files) {
      const extension = await this.detectSupportedExtension(file);
      validatedUploads.push({ buffer: file.buffer, extension });
    }

    const storedFiles: StoredFile[] = [];
    try {
      for (const upload of validatedUploads) {
        storedFiles.push(
          await this.storage.save(upload.buffer, upload.extension),
        );
      }
    } catch (error) {
      await this.discard(storedFiles);
      throw error;
    }
    return storedFiles;
  }

  async enqueueOptimization(images: OptimizeImageJobData[]) {
    if (images.length === 0) return;
    try {
      await this.optimizationQueue.addBulk(
        images.map((image) => ({
          name: OPTIMIZE_IMAGE_JOB,
          data: image,
          opts: {
            ...OPTIMIZATION_JOB_OPTIONS,
            jobId: `optimize-image-${image.imageId}`,
          },
        })),
      );
    } catch (error) {
      this.logger.warn(
        `Could not enqueue image optimization jobs: ${String(error)}`,
      );
    }
  }

  // Resizes a stored upload to fit 1600px, converts it to AVIF and atomically swaps the DB reference.
  async optimizeStoredImage({ imageId, storageKey }: OptimizeImageJobData) {
    const image = await this.prisma.image.findFirst({
      where: { id: imageId, storageKey },
      select: { id: true },
    });
    if (!image) return;

    const rawContent = await this.storage.read(storageKey);
    if (!rawContent) return;

    const optimizedContent = await this.optimizeBuffer(rawContent);
    const optimizedFile = await this.storage.save(optimizedContent, 'avif');

    const wasUpdated = await this.replaceImageReference(
      imageId,
      storageKey,
      optimizedFile,
    );
    if (!wasUpdated) {
      await this.storage.delete(optimizedFile.storageKey);
      return;
    }

    await this.removeReplacedFile(storageKey);
  }

  // Removes stored files that never made it into the database.
  async discard(storedFiles: StoredFile[]) {
    await Promise.all(
      storedFiles.map((file) => this.storage.delete(file.storageKey)),
    );
  }

  // Removes the files of deleted images. A database trigger queues them, so cascaded deletes are covered too.
  // Failures are only logged: the image rows are already gone and the queue is retried on the next call.
  async deleteQueuedFiles() {
    try {
      const queuedFiles = await this.prisma.imageFileDeletion.findMany();
      for (const { storageKey } of queuedFiles) {
        await this.storage.delete(storageKey);
        await this.prisma.imageFileDeletion.delete({ where: { storageKey } });
      }
    } catch (error) {
      this.logger.warn(`Could not delete queued image files: ${String(error)}`);
    }
  }

  private async replaceImageReference(
    imageId: number,
    previousStorageKey: string,
    optimizedFile: StoredFile,
  ) {
    try {
      const { count } = await this.prisma.image.updateMany({
        where: { id: imageId, storageKey: previousStorageKey },
        data: {
          url: optimizedFile.url,
          storageKey: optimizedFile.storageKey,
        },
      });
      return count > 0;
    } catch (error) {
      await this.storage.delete(optimizedFile.storageKey);
      throw error;
    }
  }

  private async removeReplacedFile(storageKey: string) {
    try {
      await this.storage.delete(storageKey);
    } catch (error) {
      this.logger.warn(
        `Could not delete original image ${storageKey}: ${String(error)}`,
      );
      await this.prisma.imageFileDeletion
        .upsert({
          where: { storageKey },
          create: { storageKey },
          update: {},
        })
        .catch((queueError: unknown) => {
          this.logger.warn(
            `Could not queue replaced image ${storageKey} for deletion: ${String(queueError)}`,
          );
        });
    }
  }

  private optimizeBuffer(content: Buffer) {
    return sharp(content)
      .rotate()
      .resize({
        width: MAX_IMAGE_SIDE_PX,
        height: MAX_IMAGE_SIDE_PX,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .avif({ quality: AVIF_QUALITY })
      .toBuffer();
  }

  private async detectSupportedExtension(file: Express.Multer.File) {
    const metadata = await sharp(file.buffer)
      .metadata()
      .catch(() => undefined);
    if (!metadata?.format || !ACCEPTED_INPUT_FORMATS.has(metadata.format)) {
      throw new BadRequestException(
        `${file.originalname} must be a JPEG, PNG, WebP or AVIF image`,
      );
    }
    if (metadata.format === 'jpeg') return 'jpg';
    if (metadata.format === 'heif') {
      return metadata.compression === 'hevc' ? 'heic' : 'avif';
    }
    return metadata.format;
  }
}
