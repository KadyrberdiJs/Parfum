import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { ImageService } from './image.service';

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
  const storage = { save: jest.fn(), delete: jest.fn() };
  const db = {
    imageFileDeletion: { findMany: jest.fn(), delete: jest.fn() },
  };
  let service: ImageService;
  beforeEach(() => {
    jest.resetAllMocks();
    storage.save.mockImplementation((_content: Buffer, extension: string) =>
      Promise.resolve({
        storageKey: `images/test.${extension}`,
        url: `/uploads/images/test.${extension}`,
      }),
    );
    service = new ImageService(db as unknown as PrismaService, storage);
  });

  it('shrinks large uploads to fit 1600px and stores them as AVIF', async () => {
    await service.storeOptimized([upload(await solidPng(3200, 1000))]);
    const [content, extension] = storage.save.mock.calls[0] as [Buffer, string];
    const metadata = await sharp(content).metadata();
    expect(extension).toBe('avif');
    expect(metadata.format).toBe('heif');
    expect(metadata.compression).toBe('av1');
    expect([metadata.width, metadata.height]).toEqual([1600, 500]);
  });

  it('never enlarges small uploads', async () => {
    await service.storeOptimized([upload(await solidPng(300, 200))]);
    const [content] = storage.save.mock.calls[0] as [Buffer];
    const metadata = await sharp(content).metadata();
    expect([metadata.width, metadata.height]).toEqual([300, 200]);
  });

  it('stores nothing when any upload is not a supported image', async () => {
    const files = [
      upload(await solidPng(100, 100)),
      upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'a.svg'),
    ];
    await expect(service.storeOptimized(files)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storage.save).not.toHaveBeenCalled();
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
