import { formatDate } from '../utils/time';
import { Music } from '../database/entites/music';
import { BaseAlbumTemplate } from './album';
import { BaseArtistTemplate } from './artist';
import * as path from 'path';

export class BaseMusicTemplate {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  duration: number;
  track: number;
  year?: number;
  album: BaseAlbumTemplate;
  artist: BaseArtistTemplate[];
  filename: string;
  lrc: string;
  constructor(music: Music) {
    this.id = music.id;
    this.title = music.title;
    this.createdAt = formatDate(music.createdAt);
    this.updatedAt = formatDate(music.updatedAt);
    this.duration = music.duration;
    this.track = music.track;
    this.filename = path.basename(music.path);
    if (music.lyric) {
      this.lrc = `/file/lrc/${music.id}`;
    }
    if (music.album) {
      this.album = new BaseAlbumTemplate(music.album);
    }
    if (music.artist) {
      this.artist = music.artist.map(
        (artist) => new BaseArtistTemplate(artist),
      );
    }
    if (music.year) {
      this.year = music.year;
    }
  }
}
