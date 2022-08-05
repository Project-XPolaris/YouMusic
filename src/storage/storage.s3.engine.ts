import { StorageEngine } from './storage.engine';
import {
  GetObjectCommand, HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import * as path from 'path';

export type S3StorageEngineOptions = {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  bucket: string;
};
export class S3StorageEngine implements StorageEngine {
  client: S3Client;
  bucket: string;
  async get(key: string): Promise<Readable | ReadableStream | Blob> {
    if (!this.client) {
      return;
    }
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    return response.Body;
  }

  async init(config: S3StorageEngineOptions): Promise<void> {
    this.client = new S3Client({
      region: 'us',
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      endpoint: config.endpoint,
      forcePathStyle: true,
    });
    this.bucket = config.bucket;
  }

  async set(key: string, value: any): Promise<void> {
    if (!this.client) {
      return;
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket, // The name of the bucket. For example, 'sample_bucket_101'.
        Key: key, // The name of the object. For example, 'sample_upload.txt'.
      }),
    );
  }

  async uploadBuffer(key: string, buff: Buffer): Promise<void> {
    if (!this.client) {
      return;
    }
    const result = await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buff.valueOf(),
      }),
    );
  }

  async exist(key: string): Promise<boolean> {
    if (!this.client) {
      return false;
    }
    return this.client
      .send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      )
      .then(() => true)
      .catch(() => false);
  }
}
