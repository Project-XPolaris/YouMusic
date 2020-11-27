import { formatDate } from '../utils/time';
import { Music } from '../database/entites/music';
import { BaseAlbumTemplate } from './album';
import { BaseArtistTemplate } from './artist';

export class BaseMusicTemplate {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  album: BaseAlbumTemplate;
  artist: BaseArtistTemplate[];
  constructor(music: Music) {
    this.id = music.id;
    this.title = music.title;
    this.createdAt = formatDate(music.createdAt);
    this.updatedAt = formatDate(music.updatedAt);
    if (music.album) {
      this.album = new BaseAlbumTemplate(music.album);
    }
    if (music.artist) {
      this.artist = music.artist.map(
        (artist) => new BaseArtistTemplate(artist),
      );
    }
  }
}
