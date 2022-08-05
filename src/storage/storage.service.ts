import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageEngine } from './storage.engine';
import { S3StorageEngine, S3StorageEngineOptions } from './storage.s3.engine';
import { StorageLocalEngine } from './storage.local.engine';
import { Readable } from 'stream';
import * as path from 'path';

export interface StoragePaths {
  covers: string;
}

@Injectable()
export class StorageService {
  engine: StorageEngine;
  storagePaths: StoragePaths;
  constructor(private configService: ConfigService) {
    const useEngineName = configService.get('storage.backend.use');
    const useEngineType = configService.get(
      `storage.backend.${useEngineName}.type`,
    );
    if (useEngineType === 's3') {
      const config: S3StorageEngineOptions = {
        accessKeyId: configService.get(
          `storage.backend.${useEngineName}.accessKeyId`,
        ),
        secretAccessKey: configService.get(
          `storage.backend.${useEngineName}.secretAccessKey`,
        ),
        endpoint: configService.get(
          `storage.backend.${useEngineName}.endpoint`,
        ),
        bucket: configService.get(`storage.backend.${useEngineName}.bucket`),
      };
      const eng = new S3StorageEngine();
      eng.init(config);
      this.engine = eng;
    }
    if (useEngineType == 'local') {
      const eng = new StorageLocalEngine();
      eng.init({
        storePath: configService.get(
          `storage.backend.${useEngineName}.storagePath`,
        ),
      });
      this.engine = eng;
    }
    this.storagePaths = configService.get('storage.paths');
  }
  async getCover(key: string): Promise<Readable | ReadableStream | Blob> {
    return this.engine.get(path.join(this.storagePaths.covers, key));
  }
  async uploadCover(key: string, buff: Buffer): Promise<void> {
    return this.engine.uploadBuffer(
      path.join(this.storagePaths.covers, key),
      buff,
    );
  }
  async existCover(key: string): Promise<boolean> {
    return this.engine.exist(path.join(this.storagePaths.covers, key));
  }
}
