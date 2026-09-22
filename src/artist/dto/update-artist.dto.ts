export class UpdateArtistAvatarFromUrl {
  url: string;
}

export class UpdateArtistDTO {
  name?: string;
  bio?: string;
}

export type AvatarCandidateSource = 'local' | 'deezer' | 'netease';

export class AvatarCandidate {
  id: string;
  source: AvatarCandidateSource;
  name: string;
  imageUrl: string;
  thumbnailUrl: string;
  width?: number;
  height?: number;
  score: number;
  externalId?: string;
  /** Server-side only path for local files; required when applying local source. */
  localPath?: string;
}

export class ApplyArtistAvatarDto {
  source: AvatarCandidateSource;
  imageUrl?: string;
  localPath?: string;
  externalId?: string;
  name?: string;
}
