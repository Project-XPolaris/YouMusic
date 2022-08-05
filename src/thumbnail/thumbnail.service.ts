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
import { getRepository } from 'typeorm';
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
  ) {}
  async generate(buffer: Buffer, output: string): Promise<void> {
    if (buffer.length > 1024 * 500) {
      // 500kb
      await this.storageService.uploadCover(output, buffer);
      // fs.writeFileSync(output, buffer);
      return;
    }
    const outputBuffer: Buffer = await this.engine.generate(buffer);
    await this.storageService.uploadCover(output, outputBuffer);
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
        const album = await getRepository(Album).findOne({
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
          await saveAlbumCover(album.id, coverFilename);
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
