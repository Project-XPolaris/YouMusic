import { Artist } from '../database/entites/artist';
import { formatDate } from '../utils/time';
export class BaseArtistTemplate {
  id: number;
  name: string;
  avatar: string;
  bio?: string;
  neteaseId?: string;
  deezerId?: string;
  mbid?: string;
  country?: string;
  scrapedAt?: string;
  createdAt: string;
  updatedAt: string;
  constructor(artist: Artist) {
    this.id = artist.id;
    this.name = artist.name;
    if (artist.avatar) {
      // Same pattern as album cover: id-based media endpoint for <img> + token query.
      this.avatar = `/artist/${artist.id}/avatar`;
    }
    if (artist.bio) this.bio = artist.bio;
    if (artist.neteaseId) this.neteaseId = artist.neteaseId;
    if (artist.deezerId) this.deezerId = artist.deezerId;
    if (artist.mbid) this.mbid = artist.mbid;
    if (artist.country) this.country = artist.country;
    if (artist.scrapedAt) this.scrapedAt = formatDate(artist.scrapedAt);
    this.createdAt = formatDate(artist.createdAt);
    this.updatedAt = formatDate(artist.updatedAt);
  }
}
