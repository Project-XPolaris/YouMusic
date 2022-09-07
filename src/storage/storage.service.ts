import { Global, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageEngine } from './storage.engine';
import { S3StorageEngine, S3StorageEngineOptions } from './storage.s3.engine';
import { StorageLocalEngine } from './storage.local.engine';
import { Readable } from 'stream';
import * as path from 'path';
import { LogService } from '../log/log.service';

export interface StoragePaths {
  covers: string;
}

@Injectable()
@Global()
export class StorageService {
  engine: StorageEngine;
  storagePaths: StoragePaths;
  constructor(
    private configService: ConfigService,
    private logService: LogService,
  ) {
    if (this.engine) {
      return;
    }
    const useEngineName = configService.get('storage.backend.use');
    const useEngineType = configService.get(
      `storage.backend.${useEngineName}.type`,
    );
    logService.info({
      content: `Using storage engine: ${useEngineType}`,
      scope: 'storage',
    });
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
      logService.info({
        content: `Using storage engine: ${useEngineType} in bucket: ${config.bucket} with endpoint: ${config.endpoint}`,
      });
      if (!this.engine) {
        logService.error({
          content: `Failed to initialize storage engine: ${useEngineType} in bucket: ${config.bucket} with endpoint: ${config.endpoint}`,
        });
      }
    }
    if (useEngineType == 'local') {
      const eng = new StorageLocalEngine();
      eng.init({
        storePath: configService.get(
          `storage.backend.${useEngineName}.storagePath`,
        ),
      });
      this.engine = eng;
      logService.info({
        content: `Using storage engine: ${useEngineType}`,
      });
    }
    this.storagePaths = configService.get('storage.paths');
  }
  async getCover(key: string): Promise<Readable | ReadableStream | Blob> {
    return this.engine.get(path.join(this.storagePaths.covers, key));
  }
  async uploadCover(key: string, buff: Buffer): Promise<void> {
    if (!this.engine) {
      this.logService.error({
        content: 'Storage engine not initialized',
        scope: 'storage',
      });
      return;
    }
    return this.engine.uploadBuffer(
      path.join(this.storagePaths.covers, key),
      buff,
    );
  }
  async existCover(key: string): Promise<boolean> {
    return this.engine.exist(path.join(this.storagePaths.covers, key));
  }
}
