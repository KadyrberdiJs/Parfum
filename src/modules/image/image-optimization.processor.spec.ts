import { Job } from 'bullmq';
import { ImageOptimizationProcessor } from './image-optimization.processor';
import { ImageService, OptimizeImageJobData } from './image.service';

describe('ImageOptimizationProcessor', () => {
  const imageService = { optimizeStoredImage: jest.fn() };
  let processor: ImageOptimizationProcessor;

  beforeEach(() => {
    jest.resetAllMocks();
    processor = new ImageOptimizationProcessor(
      imageService as unknown as ImageService,
    );
  });

  it('delegates job processing to ImageService.optimizeStoredImage', async () => {
    const job = {
      id: 'optimize-image-42',
      data: { imageId: 42, storageKey: 'images/raw.png' },
    } as Job<OptimizeImageJobData>;

    await processor.process(job);

    expect(imageService.optimizeStoredImage).toHaveBeenCalledWith({
      imageId: 42,
      storageKey: 'images/raw.png',
    });
  });
});
