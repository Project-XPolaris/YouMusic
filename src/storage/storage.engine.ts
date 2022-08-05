import { Readable } from 'stream';

export interface StorageEngine {
  get(key: string): Promise<Readable | ReadableStream | Blob>;
  set(key: string, value: any): Promise<void>;
  uploadBuffer(key: string, buff: Buffer): Promise<void>;
  exist(key: string): Promise<boolean>;
}
