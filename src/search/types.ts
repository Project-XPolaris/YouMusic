export interface TextRepresentation {
  language: string;
  script: string;
}

export interface Artist {
  id: string;
  name: string;
  'sort-name': string;
}

export interface ArtistCredit {
  name: string;
  artist: Artist;
}

export interface ReleaseGroup {
  id: string;
  'type-id': string;
  'primary-type-id': string;
  title: string;
  'primary-type': string;
}

export interface Area {
  id: string;
  name: string;
  'sort-name': string;
  'iso-3166-1-codes': string[];
}

export interface ReleaseEvent {
  date: string;
  area: Area;
}

export interface Label {
  id: string;
  name: string;
}

export interface LabelInfo {
  label: Label;
  'catalog-number': string;
}

export interface Medium {
  format: string;
  'disc-count': number;
  'track-count': number;
}

export interface Release {
  id: string;
  score: number;
  'status-id': string;
  count: number;
  title: string;
  status: string;
  'text-representation': TextRepresentation;
  'artist-credit': ArtistCredit[];
  'release-group': ReleaseGroup;
  date: string;
  country: string;
  'release-events': ReleaseEvent[];
  'label-info': LabelInfo[];
  'track-count': number;
  media: Medium[];
  'packaging-id': string;
  packaging: string;
  barcode: string;
  asin: string;
}

export interface MBSearchAlbumResult {
  created: Date;
  count: number;
  offset: number;
  releases: Release[];
}
