import { Album } from '../database/entites/album';
import { formatDate } from '../utils/time';
import { BaseArtistTemplate } from './artist';
import { BaseMusicTemplate } from './music';

export class BaseAlbumTemplate {
  id: number;
  name: string;
  cover: string;
  blurHash: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  artist: BaseArtistTemplate[] = [];
  music: BaseMusicTemplate[] = [];
  constructor(album: Album) {
    this.id = album.id;
    this.name = album.name;
    this.blurHash = album.blurHash;
    this.color = album.domainColor;
    if (album.cover) {
      this.cover = `/covers/${album.cover}`;
    }
    this.createdAt = formatDate(album.createdAt);
    this.updatedAt = formatDate(album.updatedAt);
    if (album.music) {
      this.music = album.music.map((music) => new BaseMusicTemplate(music));
    }
    if (album.artist) {
      this.artist = album.artist.map(
        (artist) => new BaseArtistTemplate(artist),
      );
    }
  }
}
