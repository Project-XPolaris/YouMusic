import { Injectable } from '@nestjs/common';
import { MediaLibrary } from '../database/entites/library';
import { scanFile, syncLibrary } from '../services/scan';
import { ApplicationConfig } from '../config';
import { getRepository } from 'typeorm';
import { User } from '../database/entites/user';
import * as mm from 'music-metadata';
import { Album } from '../database/entites/album';
import {
  getOrCreateAlbum,
  getOrCreateArtist,
  getOrCreateMusic,
  saveAlbumCover,
} from '../services/music';
import { uniq } from 'lodash';
import { Artist } from '../database/entites/artist';
import { v4 as uuidv4 } from 'uuid';
import { ServiceError } from '../error';
import * as path from 'path';
import * as fs from 'fs';
import { Genre } from '../database/entites/genre';
import { Music } from '../database/entites/music';
import * as db from 'mime-db';
import { replaceExt } from '../utils/string';
import sharp = require('sharp');

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

  private async scanProcess(
    library: MediaLibrary,
    uid: string,
    {
      onAnalyzeComplete,
      onCurrentUpdate,
    }: {
      onAnalyzeComplete: (total: number) => void;
      onCurrentUpdate: (current: number) => void;
    },
  ) {
    await syncLibrary(library);
    const result = await scanFile(library.path);
    onAnalyzeComplete(result.length);
    // prepare cover directory
    await fs.promises.mkdir(ApplicationConfig.coverDir, { recursive: true });
    // get owner
    const user = await getRepository(User).findOne({ uid });
    // read music tag
    const savedAlbum: Album[] = [];
    const savedArtist: Artist[] = [];
    const savedGenre: Genre[] = [];
    const mms = [];
    for (let idx = 0; idx < result.length; idx++) {
      onCurrentUpdate(idx);
      const musicFilePath = result[idx];
      const musicID3 = await mm.parseFile(musicFilePath);
      mms.push(musicID3);
      let album: Album = undefined;
      if (musicID3.common.album) {
        album = savedAlbum.find((it) => it.name === musicID3.common.album);
        if (!album) {
          album = await getOrCreateAlbum(musicID3.common.album, user);
          savedAlbum.push(album);
        }
      }

      // get artist
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
        let artist = savedArtist.find((it: Artist) => it.name === rawArtist);
        if (!artist) {
          artist = await getOrCreateArtist(rawArtist, user);
          savedArtist.push(artist);
        }
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
          let genre = savedGenre.find(
            (gen: Genre) => gen.name === genreTag.value,
          );
          if (!genre) {
            genre = await Genre.createOrGet(genreTag.value, user);
            savedGenre.push(genre);
          }
          genres.push(genre);
        }
      }

      // create music
      const music = await getOrCreateMusic({
        title,
        musicFilePath,
        library,
        duration,
        user,
        year: musicID3.common.year,
        track: musicID3.common.track.no,
        disc: musicID3.common.disk.no,
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
      await getRepository(Music).save(music);
      // refresh album artist
      if (album) {
        await album.refreshArtist();
      }
      // save cover
      const pics = musicID3.common.picture;
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
        await sharp(cover.data)
          .resize({ width: 512 })
          .toFile(imageFileNamePath);
        await saveAlbumCover(album.id, coverFilename);
        album.cover = coverFilename;
      }
    }
    return result;
  }

  async newScanTask(
    libraryId: number,
    uid: string,
    { onComplete }: { onComplete?: (library: MediaLibrary) => void },
  ): Promise<Task> {
    const library = await getRepository(MediaLibrary).findOne(libraryId);
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
    this.scanProcess(library, uid, {
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
