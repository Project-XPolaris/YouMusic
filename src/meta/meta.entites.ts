export interface SearchAlbumEntity {
  id: string;
  name: string;
  cover?: string;
  artists: string;
  releaseDate?: string;
  source: string;
}
export interface SearchArtistEntity {
  name: string;
  cover: string;
  artists: string;
}

export interface SearchMusicEntity {
  source: string;
  id: string;
  name: string;
  artists: { name: string }[];
  albumName?: string;
  duration?: number;
  /** True when provider exposes synced/timed lyrics. */
  hasSynced?: boolean;
}

export interface AlbumMeta {
  mbId?: string;
  nemId?: string;
  name?: string;
  cover?: string;
  artist?: string;
  year?: number;
  description?: string;
}
