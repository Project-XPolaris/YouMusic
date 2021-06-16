export interface SearchAlbumEntity {
  name: string;
  cover: string;
  artists: string;
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
}
