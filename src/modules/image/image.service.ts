import {
  BadRequestException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { ImageStorage, StoredFile } from './image-storage';

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_SIDE_PX = 1600;
const AVIF_QUALITY = 65;
// sharp reports AVIF input as "heif".
const ACCEPTED_INPUT_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif']);

@Injectable()
export class ImageService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ImageService.name);

  constructor(
    private prisma: PrismaService,
    private storage: ImageStorage,
  ) {}

  // Catches up on files whose images were deleted while the app was down.
  onApplicationBootstrap() {
    return this.deleteQueuedFiles();
  }

  // Resizes each upload to fit 1600x1600, converts it to AVIF and stores it.
  // Every file is converted before anything is stored, so one bad file stores nothing.
  async storeOptimized(files: Express.Multer.File[]) {
    const optimizedImages: Buffer[] = [];
    for (const file of files) {
      optimizedImages.push(await this.optimize(file));
    }

    const storedFiles: StoredFile[] = [];
    try {
      for (const image of optimizedImages) {
        storedFiles.push(await this.storage.save(image, 'avif'));
      }
    } catch (error) {
      await this.discard(storedFiles);
      throw error;
    }
    return storedFiles;
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

  private async optimize(file: Express.Multer.File) {
    await this.ensureSupportedFormat(file);
    try {
      return await sharp(file.buffer)
        .rotate()
        .resize({
          width: MAX_IMAGE_SIDE_PX,
          height: MAX_IMAGE_SIDE_PX,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .avif({ quality: AVIF_QUALITY })
        .toBuffer();
    } catch {
      throw new BadRequestException(
        `${file.originalname} could not be processed`,
      );
    }
  }

  private async ensureSupportedFormat(file: Express.Multer.File) {
    const format = await sharp(file.buffer)
      .metadata()
      .then((metadata) => metadata.format)
      .catch(() => undefined);
    if (format && ACCEPTED_INPUT_FORMATS.has(format)) return;
    throw new BadRequestException(
      `${file.originalname} must be a JPEG, PNG, WebP or AVIF image`,
    );
  }
}
