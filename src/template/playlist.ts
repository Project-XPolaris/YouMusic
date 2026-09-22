import { BaseMusicTemplate } from './music';
import { Playlist } from '../database/entites/playlist';

export class PlaylistTemplate {
  id: number;
  name: string;
  owner: number;
  musicCount?: number;
  music?: BaseMusicTemplate[];
  createdAt?: Date;
  updatedAt?: Date;
  constructor(playlist: Playlist & { musicCount?: number }) {
    this.id = playlist.id;
    this.name = playlist.name;
    this.owner = playlist.owner?.id ?? 0;
    this.createdAt = playlist.createdAt;
    this.updatedAt = playlist.updatedAt;
    if (typeof playlist.musicCount === 'number') {
      this.musicCount = playlist.musicCount;
    } else if (playlist.music) {
      this.musicCount = playlist.music.length;
    }
    if (playlist.music) {
      this.music = playlist.music.map((music) => new BaseMusicTemplate(music));
    }
  }
}
