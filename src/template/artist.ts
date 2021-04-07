import { Artist } from '../database/entites/artist';
import { formatDate } from '../utils/time';
export class BaseArtistTemplate {
  id: number;
  name: string;
  avatar: string;
  createdAt: string;
  updatedAt: string;
  constructor(artist: Artist) {
    this.id = artist.id;
    this.name = artist.name;
    if (artist.avatar) {
      this.avatar = `/covers/${artist.avatar}`;
    }
    this.createdAt = formatDate(artist.createdAt);
    this.updatedAt = formatDate(artist.updatedAt);
  }
}
