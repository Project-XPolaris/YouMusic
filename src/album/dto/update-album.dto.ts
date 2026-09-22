export class UpdateAlbumDto {
  name?: string;
  albumArtist?: string;
  year?: number;
  description?: string;
}

export class ApplyAlbumMetaDto {
  name?: string;
  albumArtist?: string;
  year?: number;
  description?: string;
  neteaseId?: string;
  mbid?: string;
  coverUrl?: string;
}
