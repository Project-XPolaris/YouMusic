import { v4 as uuidv4 } from 'uuid';
import { scanFile } from './scan';
import * as mm from 'music-metadata';
import {uniq} from 'lodash'
import {
  addArtistsToAlbum,
  addArtistsToMusic,
  addMusicToAlbum,
  getOrCreateAlbum,
  getOrCreateArtist,
  getOrCreateMusic,
} from './music';
import { Artist } from '../database/entites/artist';

export enum TaskStatus {
  Running = 'Running',
  Done = 'Done',
}
export interface Task {
  id: string;
  status;
}
function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class TaskPool {
  tasks: Array<Task> = [];
  private async process(targetPath: string) {
    const result = await scanFile(targetPath);
    // read music tag

    for (const musicFilePath of result) {
      const musicID3 = await mm.parseFile(musicFilePath);
      const album = await getOrCreateAlbum(musicID3.common.album);
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
        const artist = await getOrCreateArtist(rawArtist);
        artists.push(artist);
      }
      const music = await getOrCreateMusic(
        musicID3.common.title,
        musicFilePath,
      );
      await addArtistsToMusic(music, ...artists);
      await addArtistsToAlbum(album, ...artists);
      await addMusicToAlbum(album, music);
    }
    return result;
  }
  newTask(targetPath): Task {
    const taskId = uuidv4();
    const task = {
      id: taskId,
      status: TaskStatus.Running,
    };
    this.tasks.push();
    this.process(targetPath).then(() => {
      this.tasks.map((it) => {
        if (it.id === taskId) {
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
