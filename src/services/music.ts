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

export const getOrCreateAlbum = async (name: string, library: MediaLibrary, dataSource: DataSource) => {
  let album = await dataSource.getRepository(Album)
    .createQueryBuilder('album')
    .where('album.name = :name', { name })
    .getOne();
  if (album) {
    return album;
  }
  album = new Album();
  album.name = name;
  await dataSource.getRepository(Album).save(album);
  return album;
};

export const getOrCreateArtist = async (
  name: string,
  library: MediaLibrary,
  dataSource: DataSource,
) => {
  let artist = await dataSource.getRepository(Artist)
    .createQueryBuilder('artist')
    .where('artist.name = :name', { name })
    .getOne();
  if (artist) {
    return artist;
  }
  artist = new Artist();
  artist.name = name;
  await dataSource.getRepository(Artist).save(artist);
  return artist;
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
  if (music === undefined) {
    music = new Music();
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
