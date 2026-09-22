import { Album } from '../database/entites/album';
import { formatDate } from '../utils/time';
import { BaseArtistTemplate } from './artist';
import { BaseMusicTemplate } from './music';

export class BaseAlbumTemplate {
  id: number;
  name: string;
  albumArtist?: string;
  cover: string;
  blurHash: string;
  color: string;
  year?: number;
  description?: string;
  neteaseId?: string;
  mbid?: string;
  scrapedAt?: string;
  createdAt: string;
  updatedAt: string;
  artist: BaseArtistTemplate[] = [];
  music: BaseMusicTemplate[] = [];
  /** Track count — set on list queries without loading all music rows. */
  musicCount?: number;
  constructor(album: Album & { musicCount?: number }) {
    this.id = album.id;
    this.name = album.name;
    this.albumArtist = album.albumArtist;
    this.blurHash = album.blurHash;
    this.color = album.domainColor;
    if (album.cover) {
      this.cover = `/album/${album.id}/cover`;
    }
    if (album.year) this.year = album.year;
    if (album.description) this.description = album.description;
    if (album.neteaseId) this.neteaseId = album.neteaseId;
    if (album.mbid) this.mbid = album.mbid;
    if (album.scrapedAt) this.scrapedAt = formatDate(album.scrapedAt);
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
    if (album.musicCount !== undefined) {
      this.musicCount = Number(album.musicCount) || 0;
    } else if (album.music) {
      this.musicCount = album.music.length;
    }
  }
}
