import { BadRequestException } from '@nestjs/common';
import { Queue } from 'bullmq';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import {
  ImageService,
  OPTIMIZE_IMAGE_JOB,
  OptimizeImageJobData,
} from './image.service';

function upload(buffer: Buffer, originalname = 'photo.png') {
  return { buffer, originalname } as Express.Multer.File;
}

function solidPng(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 3, background: '#c08040' },
  })
    .png()
    .toBuffer();
}

describe('ImageService', () => {
  const storage = { save: jest.fn(), read: jest.fn(), delete: jest.fn() };
  const db = {
    image: { findFirst: jest.fn(), updateMany: jest.fn() },
    imageFileDeletion: {
      findMany: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const queue = { addBulk: jest.fn() };
  let service: ImageService;

  beforeEach(() => {
    jest.resetAllMocks();
    storage.save.mockImplementation((_content: Buffer, extension: string) =>
      Promise.resolve({
        storageKey: `images/test.${extension}`,
        url: `/uploads/images/test.${extension}`,
      }),
    );
    db.image.findFirst.mockResolvedValue({ id: 7 });
    db.image.updateMany.mockResolvedValue({ count: 1 });
    db.imageFileDeletion.upsert.mockResolvedValue({});
    service = new ImageService(
      db as unknown as PrismaService,
      storage,
      queue as unknown as Queue<OptimizeImageJobData>,
    );
  });

  it('stores validated uploads with their detected extension without re-encoding', async () => {
    const png = await solidPng(3200, 1000);
    const stored = await service.storeUploads([upload(png)]);
    expect(storage.save).toHaveBeenCalledWith(png, 'png');
    expect(stored).toEqual([
      { storageKey: 'images/test.png', url: '/uploads/images/test.png' },
    ]);
  });

  it('stores nothing when any upload is not a supported image', async () => {
    const files = [
      upload(await solidPng(100, 100)),
      upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'a.svg'),
    ];
    await expect(service.storeUploads(files)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('enqueues BullMQ optimization jobs for created images', async () => {
    await service.enqueueOptimization([
      { imageId: 7, storageKey: 'images/raw.png' },
    ]);
    expect(queue.addBulk).toHaveBeenCalledWith([
      {
        name: OPTIMIZE_IMAGE_JOB,
        data: { imageId: 7, storageKey: 'images/raw.png' },
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
          removeOnFail: { count: 100 },
          jobId: 'optimize-image-7',
        },
      },
    ]);
  });

  it('does not fail uploads when enqueueing optimization jobs fails', async () => {
    queue.addBulk.mockRejectedValue(new Error('redis unavailable'));
    await expect(
      service.enqueueOptimization([
        { imageId: 7, storageKey: 'images/raw.png' },
      ]),
    ).resolves.toBeUndefined();
  });

  it('shrinks large stored images to fit 1600px, saves AVIF, updates DB and deletes the raw file', async () => {
    storage.read.mockResolvedValue(await solidPng(3200, 1000));
    await service.optimizeStoredImage({
      imageId: 7,
      storageKey: 'images/raw.png',
    });

    const [content, extension] = storage.save.mock.calls[0] as [Buffer, string];
    const metadata = await sharp(content).metadata();
    expect(extension).toBe('avif');
    expect(metadata.format).toBe('heif');
    expect(metadata.compression).toBe('av1');
    expect([metadata.width, metadata.height]).toEqual([1600, 500]);
    expect(db.image.updateMany).toHaveBeenCalledWith({
      where: { id: 7, storageKey: 'images/raw.png' },
      data: {
        url: '/uploads/images/test.avif',
        storageKey: 'images/test.avif',
      },
    });
    expect(storage.delete).toHaveBeenCalledWith('images/raw.png');
  });

  it('never enlarges small stored images', async () => {
    storage.read.mockResolvedValue(await solidPng(300, 200));
    await service.optimizeStoredImage({
      imageId: 7,
      storageKey: 'images/raw.png',
    });
    const [content] = storage.save.mock.calls[0] as [Buffer];
    const metadata = await sharp(content).metadata();
    expect([metadata.width, metadata.height]).toEqual([300, 200]);
  });

  it('skips optimization when the image row was already removed or replaced', async () => {
    db.image.findFirst.mockResolvedValue(null);
    await service.optimizeStoredImage({
      imageId: 7,
      storageKey: 'images/raw.png',
    });
    expect(storage.read).not.toHaveBeenCalled();
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('discards the optimized AVIF when the image is deleted concurrently', async () => {
    storage.read.mockResolvedValue(await solidPng(300, 200));
    db.image.updateMany.mockResolvedValue({ count: 0 });
    await service.optimizeStoredImage({
      imageId: 7,
      storageKey: 'images/raw.png',
    });
    expect(storage.delete).toHaveBeenCalledWith('images/test.avif');
    expect(storage.delete).not.toHaveBeenCalledWith('images/raw.png');
  });

  it('discards the optimized AVIF and rethrows when updating the database fails', async () => {
    storage.read.mockResolvedValue(await solidPng(300, 200));
    db.image.updateMany.mockRejectedValue(new Error('database timeout'));
    await expect(
      service.optimizeStoredImage({
        imageId: 7,
        storageKey: 'images/raw.png',
      }),
    ).rejects.toThrow('database timeout');
    expect(storage.delete).toHaveBeenCalledWith('images/test.avif');
  });

  it('queues the replaced raw file for cleanup if deleting it immediately fails', async () => {
    storage.read.mockResolvedValue(await solidPng(300, 200));
    storage.delete.mockRejectedValue(new Error('disk busy'));
    await expect(
      service.optimizeStoredImage({
        imageId: 7,
        storageKey: 'images/raw.png',
      }),
    ).resolves.toBeUndefined();
    expect(db.imageFileDeletion.upsert).toHaveBeenCalledWith({
      where: { storageKey: 'images/raw.png' },
      create: { storageKey: 'images/raw.png' },
      update: {},
    });
  });

  it('removes queued files and clears them from the queue', async () => {
    db.imageFileDeletion.findMany.mockResolvedValue([
      { storageKey: 'images/a.avif' },
    ]);
    await service.deleteQueuedFiles();
    expect(storage.delete).toHaveBeenCalledWith('images/a.avif');
    expect(db.imageFileDeletion.delete).toHaveBeenCalledWith({
      where: { storageKey: 'images/a.avif' },
    });
  });

  it('keeps a file queued when removing it fails', async () => {
    db.imageFileDeletion.findMany.mockResolvedValue([
      { storageKey: 'images/a.avif' },
    ]);
    storage.delete.mockRejectedValue(new Error('disk is read-only'));
    await expect(service.deleteQueuedFiles()).resolves.toBeUndefined();
    expect(db.imageFileDeletion.delete).not.toHaveBeenCalled();
  });
});
