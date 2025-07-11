import { Injectable } from '@nestjs/common';
import { MediaLibrary } from '../database/entites/library';
import { scanFile } from '../services/scan';
import * as mm from 'music-metadata';
import { Album } from '../database/entites/album';
import {
  getOrCreateAlbum,
  getOrCreateArtist,
  getOrCreateMusic,
} from '../services/music';
import { uniq } from 'lodash';
import { Artist } from '../database/entites/artist';
import { ServiceError } from '../error';
import * as path from 'path';
import * as fs from 'fs';
import { Genre } from '../database/entites/genre';
import { Music } from '../database/entites/music';
import { replaceExt } from '../utils/string';
import { ThumbnailService } from '../thumbnail/thumbnail.service';
import { LogService } from '../log/log.service';
import { v4 as uuidv4 } from 'uuid';
import * as db from 'mime-db';
import { encodeImageToBlurhash } from '../utils/blurhash';
import { getAverageColor } from 'fast-average-color-node';
import { StorageService } from '../storage/storage.service';
import { DataSource } from 'typeorm';

export enum TaskStatus {
  Running = 'Running',
  Done = 'Done',
  Err = 'Error',
}

export type TaskOutput = ScanLibraryOutput;

export interface Task {
  id: number;
  status: TaskStatus;
  type: string;
  output: TaskOutput;
}

export interface ScanLibraryOutput {
  total: number;
  current: number;
}

export const TaskErrors = {
  OnlyOneTask: 'OnlyOneTask',
  LibraryNotFound: 'LibraryNotFound',
};

@Injectable()
export class TaskService {
  tasks: Array<Task> = [];
  constructor(
    private thumbnailService: ThumbnailService,
    private logService: LogService,
    private storageService: StorageService,
    private dataSource: DataSource
  ) {}
  private async scanProcess(
    library: MediaLibrary,
    uid: string,
    forceThumbnail: boolean,
    {
      onAnalyzeComplete,
      onCurrentUpdate,
    }: {
      onAnalyzeComplete: (total: number) => void;
      onCurrentUpdate: (current: number) => void;
    },
  ) {
    const startScanTime = Date.now();
    const result = await scanFile(library.path);
    const endScanTime = Date.now();
    this.logService.info({
      content: `Scan ${library.path} complete in ${
        endScanTime - startScanTime
      }ms`,
    });
    onAnalyzeComplete(result.length);
    // find out updated file
    let musics = await this.dataSource.getRepository(Music)
      .createQueryBuilder('music')
      .where('music.libraryId = :libraryId', {
        libraryId: library.id,
      })
      .getMany();
    const scanResult: string[] = [];
    const getSyncListStart = Date.now();
    for (const musicFilePath of result) {
      const targetMusic = musics.find((music) => music.path === musicFilePath);
      if (!targetMusic) {
        // is new file
        scanResult.push(musicFilePath);
        continue;
      }
      const fileStat = await fs.promises.stat(targetMusic.path);
      if (!fileStat) {
        continue;
      }
      if (fileStat.size === 0) {
        continue;
      }
      if (fileStat.mtime.getTime() === targetMusic.lastModify.getTime()) {
        musics = musics.filter((music) => music.id !== targetMusic.id);
      } else {
        scanResult.push(musicFilePath);
      }
    }
    const getSyncListEnd = Date.now();
    this.logService.info({
      content: `Get sync list complete in ${
        getSyncListEnd - getSyncListStart
      }ms`,
    });
    // remove music that file is not exist
    const removeNotExistStart = Date.now();
    for (const music of musics) {
      await Music.deleteMusic(music.id,this.dataSource);
    }
    const removeNotExistEnd = Date.now();
    this.logService.info({
      content: `Remove not exist music complete in ${
        removeNotExistEnd - removeNotExistStart
      }ms`,
    });
    // refresh music file meta
    let updatedAlbums: Album[] = [];
    for (let idx = 0; idx < scanResult.length; idx++) {
      try {
        onCurrentUpdate(idx);
        const musicFilePath = scanResult[idx];
        let fileStat = undefined;
        const readFileStart = Date.now();
        fileStat = await fs.promises.stat(musicFilePath);
        const musicID3 = await mm.parseFile(musicFilePath);
        const readFileEnd = Date.now();
        this.logService.info({
          content: `Read file ${musicFilePath} complete in ${
            readFileEnd - readFileStart
          }ms`,
        });
        let album: Album = undefined;
        if (musicID3.common.album) {
          album = await getOrCreateAlbum(musicID3.common.album, library, this.dataSource);
          updatedAlbums = [
            ...updatedAlbums.filter((it) => it.id !== album.id),
            album,
          ];
        }
        const saveMusicStart = Date.now();
        //get artist
        let rawArtists = [];
        if (musicID3.common.artist) {
          rawArtists.push(musicID3.common.artist);
        }
        if (musicID3.common.artists) {
          rawArtists.push(...musicID3.common.artists);
        }
        rawArtists = uniq(rawArtists);
        const artists: Array<Artist> = [];
        for (const rawArtist of rawArtists) {
          const artist = await getOrCreateArtist(rawArtist, library, this.dataSource);
          artists.push(artist);
        }
        // get title
        let title = path
          .basename(musicFilePath)
          .replace(path.extname(musicFilePath), '');
        if (musicID3.common.title) {
          title = musicID3.common.title;
        }
        // get duration
        let duration = 0;
        if (musicID3.format.duration) {
          duration = musicID3.format.duration;
        }

        // get genre
        const genres: Genre[] = [];
        const v1 = musicID3.native.ID3v1;
        if (v1) {
          const genreTag = v1.find((it) => it.id === 'genre');
          if (genreTag) {
            const genre = await Genre.createOrGet(genreTag.value, library,this.dataSource);
            genres.push(genre);
          }
        }

        // create music
        const music = await getOrCreateMusic({
          title,
          musicFilePath,
          library,
          duration,
          year: musicID3.common.year,
          track: musicID3.common.track.no,
          disc: musicID3.common.disk.no,
          lastModify: fileStat?.mtime,
          lossless: musicID3.format.lossless,
          bitrate: musicID3.format.bitrate,
          sampleRate: musicID3.format.sampleRate,
          size: fileStat?.size,
          dataSource: this.dataSource,
        });
        music.artist = artists;
        music.genre = genres;
        music.album = album;
        // find out lyrics
        const targetLyricsPath = replaceExt(musicFilePath, '.lrc');
        try {
          if (fs.existsSync(targetLyricsPath)) {
            //file exists
            music.lyric = targetLyricsPath;
          }
        } catch (err) {
          // without lrc
        }
        await this.dataSource.getRepository(Music).save(music);
        // refresh album artist
        const saveMusicEnd = Date.now();
        this.logService.info({
          content: `Save music ${musicFilePath} complete in ${
            saveMusicEnd - saveMusicStart
          }ms`,
        });
        // save cover
        const pics = musicID3.common.picture;
        if ((pics && pics.length > 0 && album) || forceThumbnail) {
          let isExist = false;
          if (!forceThumbnail && album?.cover) {
            isExist = await this.storageService.existCover(album.cover);
          }
          if (!isExist) {
            const cover = pics[0];
            const mime = db[cover.format];
            if (mime) {
              const ext = mime.extensions[0];
              const coverFilename = `${uuidv4()}.${ext}`;
              await this.thumbnailService.generate(cover.data, coverFilename);
              const hash = await encodeImageToBlurhash(cover.data);
              album.cover = coverFilename;
              album.blurHash = hash;
              // get domain color
              const color = await getAverageColor(cover.data);
              album.domainColor = color.hex;
              await this.dataSource.getRepository(Album).save(album);
            }
          }
        }
      } catch (e) {
        this.logService.info({
          content: `Save music ${scanResult[idx]} failed with err  ${e}`,
        });
      }
    }
    // update album artist
    for (const updatedAlbum of updatedAlbums) {
      await updatedAlbum.refreshArtist(this.dataSource);
    }
    return result;
  }

  async newScanTask(
    libraryId: number,
    uid: string,
    forceThumbnail: boolean,
    { onComplete }: { onComplete?: (library: MediaLibrary) => void },
  ): Promise<Task> {
    const library = await this.dataSource.getRepository(MediaLibrary).findOne({
      where: { id: libraryId },
    });
    if (library === undefined) {
      // no library found
      throw new ServiceError(
        `library id = ${libraryId} not found`,
        TaskErrors.LibraryNotFound,
      );
    }
    let task = this.tasks.find((it) => it.id === library.id);
    if (task) {
      // only one scanner can run on library
      if (task.status === TaskStatus.Running) {
        // only one scanner can run on library
        throw new ServiceError(
          'library scanner running',
          TaskErrors.OnlyOneTask,
        );
      }
      task.status = TaskStatus.Running;
    } else {
      task = {
        id: library.id,
        status: TaskStatus.Running,
        type: 'ScanLibrary',
        output: {
          total: 0,
          current: 0,
        },
      };
      this.tasks.push(task);
    }
    this.scanProcess(library, uid, forceThumbnail, {
      onAnalyzeComplete: (total) => {
        task.output.total = total;
      },
      onCurrentUpdate: (current) => {
        task.output.current = current + 1;
      },
    })
      .then(() => {
        this.tasks = this.tasks.map((it) => {
          if (it.id === library.id) {
            return {
              ...it,
              status: TaskStatus.Done,
            };
          }
          return it;
        });
        if (onComplete) {
          onComplete(library);
        }
      })
      .catch((e) => {
        console.log(e);
        this.tasks = this.tasks.map((it) => {
          if (it.id === library.id) {
            return {
              ...it,
              status: TaskStatus.Err,
            };
          }
          return it;
        });
      });
    return task;
  }
}
