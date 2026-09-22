import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageEngine } from './storage.engine';
import { S3StorageEngine, S3StorageEngineOptions } from './storage.s3.engine';
import { StorageLocalEngine } from './storage.local.engine';
import { Readable } from 'stream';
import * as path from 'path';
import * as fs from 'fs';
import { LogService } from '../log/log.service';
import { ApplicationConfig } from '../config';

export interface StoragePaths {
  covers: string;
}

@Injectable()
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

  private coverKey(key: string): string {
    return path.join(this.storagePaths.covers, path.basename(key));
  }

  async getCover(key: string): Promise<Readable | ReadableStream | Blob> {
    const name = path.basename(key || '');
    if (!name) {
      throw Object.assign(new Error('cover key empty'), { code: 'ENOENT' });
    }
    const rel = this.coverKey(name);
    if (await this.engine.exist(rel)) {
      return this.engine.get(rel);
    }
    // Recover covers written to the legacy ApplicationConfig.coverDir path.
    const legacy = path.join(ApplicationConfig.coverDir, name);
    try {
      await fs.promises.access(legacy, fs.constants.R_OK);
      const buf = await fs.promises.readFile(legacy);
      await this.uploadCover(name, buf);
      return this.engine.get(rel);
    } catch {
      throw Object.assign(new Error(`cover not found: ${name}`), {
        code: 'ENOENT',
      });
    }
  }

  async uploadCover(key: string, buff: Buffer): Promise<void> {
    if (!this.engine) {
      this.logService.error({
        content: 'Storage engine not initialized',
        scope: 'storage',
      });
      return;
    }
    return this.engine.uploadBuffer(this.coverKey(key), buff);
  }

  async existCover(key: string): Promise<boolean> {
    const name = path.basename(key || '');
    if (!name) return false;
    if (await this.engine.exist(this.coverKey(name))) {
      return true;
    }
    try {
      await fs.promises.access(
        path.join(ApplicationConfig.coverDir, name),
        fs.constants.R_OK,
      );
      return true;
    } catch {
      return false;
    }
  }
}
