import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as db from 'mime-db';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { ApplicationConfig } from '../config';
import { saveAlbumCover } from '../services/music';
import * as mm from 'music-metadata';
import { Album } from '../database/entites/album';
import { DataSource} from 'typeorm';
import { LogService } from '../log/log.service';
import { StorageService } from '../storage/storage.service';

export interface ThumbnailGenerator {
  generate(buffer: Buffer): Promise<Buffer>;
}

@Injectable({})
export class ThumbnailService {
  constructor(
    private configService: ConfigService,
    @Inject('ENGINE')
    private engine: ThumbnailGenerator,
    private loggerService: LogService,
    private storageService: StorageService,
    private dataSource: DataSource
  ) {}
  async generate(buffer: Buffer, output: string): Promise<void> {
    // Always store by basename under storage.paths.covers.
    // Callers historically passed either a bare filename or an absolute
    // ApplicationConfig.coverDir path — absolute paths used to escape into
    // /data/covers while GET /cover reads from /data/youmusic/storage/covers.
    const key = path.basename(output);
    if (buffer.length > 1024 * 500) {
      // 500kb — skip resize
      await this.storageService.uploadCover(key, buffer);
      return;
    }
    const outputBuffer: Buffer = await this.engine.generate(buffer);
    await this.storageService.uploadCover(key, outputBuffer);
  }
  async generateMusicCover(
    list: Array<{
      id3: mm.IAudioMetadata;
      albumId: number;
    }>,
  ) {
    for (const item of list) {
      try {
        const { id3, albumId } = item;
        const pics = id3.common.picture;
        const album = await this.dataSource.getRepository(Album).findOne({
          where: { id: albumId },
        });
        if (pics && pics.length > 0 && album && !album.cover) {
          const cover = pics[0];
          const mime = db[cover.format];
          if (!mime) {
            continue;
          }
          const ext = mime.extensions[0];
          const coverFilename = `${uuidv4()}.${ext}`;
          const imageFileNamePath = path.join(
            ApplicationConfig.coverDir,
            coverFilename,
          );
          // calculate running time
          const start = new Date();
          await this.generate(cover.data, imageFileNamePath);
          await saveAlbumCover(album.id, coverFilename, this.dataSource);
          const end = new Date();
          const time = end.getTime() - start.getTime();
          this.loggerService.info({
            content: `Generate cover for album ${album.name} done in ${time}ms`,
            scope: 'thumbnail',
          });

          album.cover = coverFilename;
        }
      } catch (e) {
        console.log(e);
      }
    }
  }
}
