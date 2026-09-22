import { formatDate } from '../utils/time';
import { Music } from '../database/entites/music';
import { BaseAlbumTemplate } from './album';
import { BaseArtistTemplate } from './artist';
import * as path from 'path';
import { TagTemplate } from './tag';
import { GenreTemplate } from './genre';

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
  genre?: GenreTemplate[];
  tag?: TagTemplate[];
  filename: string;
  path?: string;
  lrc: string;
  lossless: boolean;
  bitrate: number;
  size: number;
  sampleRate: number;
  ext: string;
  /** Whether this track has a CLAP audio embedding */
  clap: boolean;
  vocalType?: string;

  constructor(music: Music, clap = false) {
    this.id = music.id;
    this.title = music.title;
    this.createdAt = formatDate(music.createdAt);
    this.updatedAt = formatDate(music.updatedAt);
    this.duration = music.duration;
    this.track = music.track;
    this.filename = path.basename(music.path);
    this.path = music.path;
    this.ext = path.extname(music.path).replace('.', '');
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
    if (music.genre?.length) {
      this.genre = music.genre.map((g) => new GenreTemplate(g));
    }
    if (music.tags) {
      this.tag = music.tags.map((tag) => new TagTemplate(tag));
    }
    if (music.year) {
      this.year = music.year;
    }
    if (music.bitrate) {
      this.bitrate = music.bitrate;
    }
    if (music.sampleRate) {
      this.sampleRate = music.sampleRate;
    }
    this.lossless = music.lossless;
    if (music.size) {
      this.size = music.size;
    }
    if (music.vocalType) {
      this.vocalType = music.vocalType;
    }
    this.clap = clap;
  }
}

export function applyClapFlags(
  items: BaseMusicTemplate[],
  clapIds: Set<number>,
) {
  for (const it of items) {
    it.clap = clapIds.has(it.id);
  }
  return items;
}
