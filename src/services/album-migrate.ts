import { DataSource } from 'typeorm';
import { Album } from '../database/entites/album';
import { Music } from '../database/entites/music';
import { buildAlbumIdentity } from './album-identity';

/**
 * Backfill identityKey / libraryId / rootPath / albumArtist for legacy albums,
 * then merge rows that share the same (libraryId, identityKey).
 */
export async function migrateAlbumIdentities(dataSource: DataSource): Promise<{
  updated: number;
  merged: number;
}> {
  const albumRepo = dataSource.getRepository(Album);
  const musicRepo = dataSource.getRepository(Music);

  const albums = await albumRepo.find();
  let updated = 0;
  let merged = 0;

  for (const album of albums) {
    if (album.identityKey) {
      continue;
    }

    const tracks = await musicRepo.find({
      where: { albumId: album.id },
      relations: ['artist', 'library'],
      order: { id: 'ASC' },
    });
    if (tracks.length === 0) {
      continue;
    }

    const sample = tracks[0];
    const albumArtist =
      album.albumArtist ||
      sample.artist?.[0]?.name ||
      '';
    const identity = buildAlbumIdentity({
      albumName: album.name,
      albumArtist,
      filePath: sample.path,
    });

    album.identityKey = identity.identityKey;
    album.albumArtist = identity.albumArtist || album.albumArtist;
    album.rootPath = identity.rootPath;
    album.libraryId = sample.library?.id;
    album.library = sample.library;
    if (!album.libraryId) {
      continue;
    }
    await albumRepo.save(album);
    updated += 1;
  }

  // Merge duplicates created under the old name-only key or partial backfill.
  const dups: Array<{ libraryId: number; identityKey: string; cnt: string }> =
    await albumRepo
      .createQueryBuilder('album')
      .select('album.libraryId', 'libraryId')
      .addSelect('album.identityKey', 'identityKey')
      .addSelect('COUNT(*)', 'cnt')
      .where('album.identityKey IS NOT NULL')
      .andWhere('album.libraryId IS NOT NULL')
      .groupBy('album.libraryId')
      .addGroupBy('album.identityKey')
      .having('COUNT(*) > 1')
      .getRawMany();

  for (const dup of dups) {
    const rows = await albumRepo.find({
      where: {
        libraryId: Number(dup.libraryId),
        identityKey: dup.identityKey,
      },
      order: { id: 'ASC' },
    });
    if (rows.length < 2) {
      continue;
    }
    const keep = rows[0];
    for (const extra of rows.slice(1)) {
      await musicRepo
        .createQueryBuilder()
        .update(Music)
        .set({ albumId: keep.id })
        .where('albumId = :id', { id: extra.id })
        .execute();

      if (!keep.cover && extra.cover) {
        keep.cover = extra.cover;
        keep.blurHash = extra.blurHash;
        keep.domainColor = extra.domainColor;
        await albumRepo.save(keep);
      }

      await albumRepo
        .createQueryBuilder()
        .delete()
        .from(Album)
        .where('id = :id', { id: extra.id })
        .execute();
      merged += 1;
    }
  }

  return { updated, merged };
}
