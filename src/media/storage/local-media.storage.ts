import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { MediaStorage } from './media-storage';

/**
 * Files on the server's own disk. Fine for local development; NOT durable on
 * Render, whose filesystem is wiped on every deploy, restart and wake from
 * sleep.
 */
export class LocalMediaStorage implements MediaStorage {
  readonly driver = 'local';

  constructor(private readonly root: string) {}

  async put(relativeKey: string, body: Buffer): Promise<string> {
    const target = path.join(this.root, relativeKey);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
    return relativeKey;
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(path.join(this.root, key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
}
