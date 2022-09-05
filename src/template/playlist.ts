import { BaseMusicTemplate } from './music';
import { Playlist } from '../database/entites/playlist';

export class PlaylistTemplate {
  id: number;
  name: string;
  owner: number;
  music: BaseMusicTemplate[];
  constructor(playlist: Playlist) {
    this.id = playlist.id;
    this.name = playlist.name;
    this.owner = playlist.owner.id;
    if (playlist.music) {
      this.music = playlist.music.map((music) => new BaseMusicTemplate(music));
    }
  }
}
