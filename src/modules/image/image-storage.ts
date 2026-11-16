import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { dirname, join } from 'path';

export const UPLOADS_DIRECTORY = join(process.cwd(), 'uploads');
export const UPLOADS_URL_PREFIX = '/uploads';

export type StoredFile = { storageKey: string; url: string };

@Injectable()
export class ImageStorage {
  // Writes the file under a random name and returns its storage key and public URL.
  async save(content: Buffer, extension: string): Promise<StoredFile> {
    const storageKey = `images/${randomUUID()}.${extension}`;
    const filePath = join(UPLOADS_DIRECTORY, storageKey);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
    return { storageKey, url: `${UPLOADS_URL_PREFIX}/${storageKey}` };
  }

  // Removes a stored file; a file that is already gone counts as removed.
  async delete(storageKey: string) {
    try {
      await unlink(join(UPLOADS_DIRECTORY, storageKey));
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
    }
  }
}

function isMissingFileError(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
