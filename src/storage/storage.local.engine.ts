import { StorageEngine } from './storage.engine';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';

export interface LocalStorageEngineOptions {
  storePath: string;
}

export class StorageLocalEngine implements StorageEngine {
  storePath: string;

  async get(key: string): Promise<Readable | ReadableStream | Blob> {
    const targetPath = path.join(this.storePath, key);
    return fs.createReadStream(targetPath);
  }

  async set(key: string, value: any): Promise<void> {
    const targetPath = path.join(this.storePath, key);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    await fs.writeFileSync(targetPath, value);
  }

  async uploadBuffer(key: string, buff: Buffer): Promise<void> {
    const targetPath = path.join(this.storePath, key);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    await fs.writeFileSync(targetPath, buff);
  }

  async init(config: LocalStorageEngineOptions): Promise<void> {
    this.storePath = config.storePath;
  }

  async exist(key: string): Promise<boolean> {
    const targetPath = path.join(this.storePath, key);
    try {
      await fs.promises.stat(targetPath);
      return true;
    } catch (e) {
      return false;
    }
  }
}
