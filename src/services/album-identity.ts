import * as path from 'path';

/**
 * Album identity (YouMusic / Polaris)
 *
 * Inspired by Navidrome PID + Jellyfin folder semantics:
 *
 *   1. musicbrainz_albumid          → mb:<id>
 *   2. albumartist + album          → tag:<artist>\n<album>
 *   3. album only (no albumartist)  → mix:<album>\n<folder>
 *      (name alone is NOT enough — albums may share titles)
 *   4. no album tag                 → dir:<folder>
 *
 * Display `name` is never unique. Uniqueness is (libraryId, identityKey).
 * Folder peels one Disc/CD/Disk N level so multi-disc stays one album.
 */

export type AlbumIdentityInput = {
  musicbrainzAlbumId?: string;
  albumName?: string;
  albumArtist?: string;
  filePath: string;
};

export type AlbumIdentity = {
  identityKey: string;
  displayName: string;
  albumArtist: string;
  rootPath: string;
};

export function normalizeAlbumPart(value: string | undefined | null): string {
  return (value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Parent dir of the track; peel Disc1 / CD 2 style once. */
export function resolveAlbumDir(filePath: string): string {
  let dir = path.dirname(filePath);
  const base = path.basename(dir);
  if (/^(cd|disc|disk)\s*\d+$/i.test(base)) {
    dir = path.dirname(dir);
  }
  return dir;
}

export function buildAlbumIdentity(input: AlbumIdentityInput): AlbumIdentity {
  const rootPath = resolveAlbumDir(input.filePath);
  const rawName = (input.albumName || '').trim();
  const albumArtist = (input.albumArtist || '').trim();
  const displayName =
    rawName || path.basename(rootPath) || 'Unknown Album';

  const mbid = (input.musicbrainzAlbumId || '').trim();
  if (mbid) {
    return {
      identityKey: `mb:${mbid}`,
      displayName,
      albumArtist,
      rootPath,
    };
  }

  const nameNorm = normalizeAlbumPart(rawName);
  const artistNorm = normalizeAlbumPart(albumArtist);

  if (nameNorm && artistNorm) {
    return {
      identityKey: `tag:${artistNorm}\n${nameNorm}`,
      displayName,
      albumArtist,
      rootPath,
    };
  }

  if (nameNorm) {
    // Same title in different folders = different albums when albumartist is missing.
    return {
      identityKey: `mix:${nameNorm}\n${rootPath}`,
      displayName,
      albumArtist,
      rootPath,
    };
  }

  return {
    identityKey: `dir:${rootPath}`,
    displayName,
    albumArtist,
    rootPath,
  };
}
