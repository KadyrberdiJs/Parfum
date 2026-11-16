import { Prisma } from '../../../generated/prisma/client';

export const MAX_IMAGES_PER_OWNER = 20;

export const publicImageFields = {
  id: true,
  url: true,
} satisfies Prisma.ImageSelect;

export type ImageLink = {
  image: Prisma.ImageGetPayload<{ select: typeof publicImageFields }>;
};

// Replaces an owner's join-table rows with a plain list of images for API responses.
export function withImageList<T extends { images: ImageLink[] }>(owner: T) {
  return { ...owner, images: owner.images.map((link) => link.image) };
}
