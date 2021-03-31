import { v4 as uuidv4 } from 'uuid';
import { scanFile, syncLibrary } from './scan';
import * as mm from 'music-metadata';
import { uniq } from 'lodash';

import {
  addArtistsToAlbum,
  addArtistsToMusic,
  addMusicToAlbum,
  getOrCreateAlbum,
  getOrCreateArtist,
  getOrCreateMusic,
  saveAlbumCover,
  saveArtist,
} from './music';
import { Artist } from '../database/entites/artist';
import * as path from 'path';
import * as fs from 'fs';
import { ApplicationConfig } from '../config';
import { Album } from '../database/entites/album';
import { getRepository } from 'typeorm';
import { MediaLibrary } from '../database/entites/library';
import { ServiceError } from '../error';
import { User } from '../database/entites/user';

export enum TaskStatus {
  Running = 'Running',
  Done = 'Done',
}
export interface Task {
  id: number;
  status: TaskStatus;
}
export const TaskErrors = {
  OnlyOneTask: 'OnlyOneTask',
  LibraryNotFound: 'LibraryNotFound',
};

class TaskPool {
  tasks: Array<Task> = [];
  private async process(library: MediaLibrary, uid: string) {
    await syncLibrary(library);
    const result = await scanFile(library.path);
    // prepare cover directory
    await fs.promises.mkdir(ApplicationConfig.coverDir, { recursive: true });
    // get owner
    const user = await getRepository(User).findOne({ uid });
    // read music tag
    for (const musicFilePath of result) {
      const musicID3 = await mm.parseFile(musicFilePath);
      let album: Album = undefined;
      if (musicID3.common.album) {
        album = await getOrCreateAlbum(musicID3.common.album, user);
      }
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
        const artist = await getOrCreateArtist(rawArtist,user);
        artists.push(artist);
      }
      let title = path.basename(musicFilePath).split('.').shift();
      if (musicID3.common.title) {
        title = musicID3.common.title;
      }
      let duration = 0;
      if (musicID3.format.duration) {
        duration = musicID3.format.duration;
      }
      const music = await getOrCreateMusic(
        title,
        musicFilePath,
        library,
        duration,
        user,
      );
      await addArtistsToMusic(music, ...artists);
      if (album) {
        await addArtistsToAlbum(album, ...artists);
        await addMusicToAlbum(album, music);
        // save cover

        const pics = musicID3.common.picture;
        if (pics && pics.length > 0 && album.cover === null) {
          const cover = pics[0];
          const coverFilename = `${uuidv4()}.jpg`;
          await fs.promises.writeFile(
            path.join(ApplicationConfig.coverDir, coverFilename),
            cover.data,
          );
          await saveAlbumCover(album.id, coverFilename);

          // add cover as avatar whether artist avatar is null
          for (const artist of artists) {
            if (artist.avatar === undefined || artist.avatar === null) {
              artist.avatar = coverFilename;
              await saveArtist(artist);
            }
          }
        }
      }
    }
    return result;
  }
  async newTask(libraryId: number, uid: string): Promise<Task> {
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
      };
      this.tasks.push();
    }
    this.process(library, uid).then(() => {
      this.tasks.map((it) => {
        if (it.id === library.id) {
          return {
            ...it,
            status: TaskStatus.Done,
          };
        }
        return it;
      });
    });
    return task;
  }
}

export const TaskPoolInstance = new TaskPool();
