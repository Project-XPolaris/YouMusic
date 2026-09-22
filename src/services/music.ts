import { Album } from '../database/entites/album';
import { Artist } from '../database/entites/artist';
import { Music } from '../database/entites/music';
import { MediaLibrary } from '../database/entites/library';
import { IAudioMetadata } from 'music-metadata';
import { v4 as uuidv4 } from 'uuid';
import { ApplicationConfig } from '../config';
import * as path from 'path';
import Jimp = require('jimp');
import { DataSource } from 'typeorm';
import { buildAlbumIdentity } from './album-identity';
import { isDuplicateKeyError } from '../utils/db-error';

export type GetOrCreateAlbumInput = {
  name?: string;
  albumArtist?: string;
  musicbrainzAlbumId?: string;
  filePath: string;
  library: MediaLibrary;
  dataSource: DataSource;
};

/**
 * Find-or-create by (libraryId, identityKey). See album-identity.ts.
 * Concurrent-safe via unique index + duplicate-key retry.
 */
export const getOrCreateAlbum = async ({
  name,
  albumArtist,
  musicbrainzAlbumId,
  filePath,
  library,
  dataSource,
}: GetOrCreateAlbumInput) => {
  const identity = buildAlbumIdentity({
    albumName: name,
    albumArtist,
    musicbrainzAlbumId,
    filePath,
  });
  const repo = dataSource.getRepository(Album);

  let album = await repo.findOne({
    where: {
      libraryId: library.id,
      identityKey: identity.identityKey,
    },
  });
  if (album) {
    let dirty = false;
    if (!album.name && identity.displayName) {
      album.name = identity.displayName;
      dirty = true;
    }
    if (!album.albumArtist && identity.albumArtist) {
      album.albumArtist = identity.albumArtist;
      dirty = true;
    }
    if (!album.rootPath && identity.rootPath) {
      album.rootPath = identity.rootPath;
      dirty = true;
    }
    if (dirty) {
      await repo.save(album);
    }
    return album;
  }

  album = new Album();
  album.name = identity.displayName;
  album.albumArtist = identity.albumArtist || undefined;
  album.identityKey = identity.identityKey;
  album.rootPath = identity.rootPath;
  album.library = library;
  album.libraryId = library.id;
  try {
    await repo.save(album);
    return album;
  } catch (err) {
    if (!isDuplicateKeyError(err)) {
      throw err;
    }
    album = await repo.findOne({
      where: {
        libraryId: library.id,
        identityKey: identity.identityKey,
      },
    });
    if (!album) {
      throw err;
    }
    return album;
  }
};

export const getOrCreateArtist = async (
  name: string,
  _library: MediaLibrary,
  dataSource: DataSource,
) => {
  const repo = dataSource.getRepository(Artist);
  let artist = await repo
    .createQueryBuilder('artist')
    .where('artist.name = :name', { name })
    .getOne();
  if (artist) {
    return artist;
  }
  artist = new Artist();
  artist.name = name;
  try {
    await repo.save(artist);
    return artist;
  } catch (err) {
    if (!isDuplicateKeyError(err)) {
      throw err;
    }
    artist = await repo
      .createQueryBuilder('artist')
      .where('artist.name = :name', { name })
      .getOne();
    if (!artist) {
      throw err;
    }
    return artist;
  }
};

export const getOrCreateMusic = async ({
  title,
  musicFilePath,
  library,
  duration,
  year,
  track,
  disc,
  lastModify,
  sampleRate,
  bitrate,
  size,
  lossless,
  dataSource,
}: {
  title: string;
  musicFilePath: string;
  library: MediaLibrary;
  duration: number;
  year?: number;
  track?: number;
  disc?: number;
  lastModify: Date;
  sampleRate?: number;
  bitrate?: number;
  size?: number;
  lossless?: boolean;
  dataSource: DataSource;
}) => {
  let music = await dataSource.getRepository(Music)
    .createQueryBuilder('music')
    .where('music.path = :path', {
      path: musicFilePath,
    })
    .andWhere('music.libraryId = :libraryId', {
      libraryId: library.id,
    })
    .getOne();
  if (music === undefined || music === null) {
    music = new Music();
  }
  // 确保title不为null或undefined
  if (!title || title.trim() === '') {
    title = path.basename(musicFilePath).replace(path.extname(musicFilePath), '') || 'Unknown Title';
  }
  music.title = title;
  music.path = musicFilePath;
  music.library = library;
  music.duration = duration;
  music.year = year;
  music.track = track;
  music.disc = disc;
  music.lastModify = lastModify;
  music.sampleRate = sampleRate;
  music.lossless = lossless;
  music.size = size;
  music.bitrate = bitrate;
  await dataSource.getRepository(Music).save(music);
  return music;
};

export const addArtistsToMusic = async (music: Music, dataSource: DataSource, ...artists: Artist[]) => {
  music.artist = artists;
  await dataSource.getRepository(Music).save(music);
};

export const addMusicToAlbum = async (album: Album, dataSource: DataSource, ...music: Music[]) => {
  for (const saveMusic of music) {
    saveMusic.album = album;
    await dataSource.getRepository(Music).save(saveMusic);
  }
};

export const saveAlbumCover = async (albumId: number, coverPath: string, dataSource: DataSource) => {
  await dataSource.getRepository(Album)
    .createQueryBuilder('album')
    .update()
    .set({
      cover: coverPath,
    })
    .andWhereInIds([albumId])
    .execute();
};

export const saveArtist = async (artist: Artist, dataSource: DataSource) => {
  await dataSource.getRepository(Artist).save(artist);
};

export const saveMusicCoverFile = async (
  musicID3: IAudioMetadata,
): Promise<string | undefined> => {
  const pics = musicID3.common.picture;
  if (pics && pics.length > 0) {
    const cover = pics[0];
    const coverFilename = `${uuidv4()}.jpg`;
    let coverImage = await Jimp.read(cover.data);
    coverImage = coverImage.resize(512, Jimp.AUTO, Jimp.RESIZE_BEZIER);
    await coverImage.write(
      path.join(ApplicationConfig.coverDir, coverFilename),
    );
    return coverFilename;
  }
  return undefined;
};
