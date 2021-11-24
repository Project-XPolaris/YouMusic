import { getRepository } from 'typeorm';
import { Album } from '../database/entites/album';
import { Artist } from '../database/entites/artist';
import { Music } from '../database/entites/music';
import { MediaLibrary } from '../database/entites/library';
import { User } from '../database/entites/user';
import { IAudioMetadata } from 'music-metadata';
import { v4 as uuidv4 } from 'uuid';
import { ApplicationConfig } from '../config';
import * as path from 'path';
import sharp = require('sharp');
import * as md5file from 'md5-file';

export const getOrCreateAlbum = async (name: string, library: MediaLibrary) => {
  let album = await getRepository(Album)
    .createQueryBuilder('album')
    .where('album.name = :name', { name })
    .andWhere('libraryId = :id', { id: library.id })
    .getOne();
  if (album) {
    return album;
  }
  album = new Album();
  album.name = name;
  album.library = library;
  await getRepository(Album).save(album);
  return album;
};

export const getOrCreateArtist = async (
  name: string,
  library: MediaLibrary,
) => {
  let artist = await getRepository(Artist)
    .createQueryBuilder('artist')
    .where('artist.name = :name', { name })
    .andWhere('libraryId = :id', { id: library.id })
    .getOne();
  if (artist) {
    return artist;
  }
  artist = new Artist();
  artist.name = name;
  artist.library = library;
  await getRepository(Artist).save(artist);
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
}: {
  title: string;
  musicFilePath: string;
  library: MediaLibrary;
  duration: number;
  year?: number;
  track?: number;
  disc?: number;
  lastModify: Date;
}) => {
  let music = await getRepository(Music)
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
  await getRepository(Music).save(music);
  return music;
};

export const addArtistsToMusic = async (music: Music, ...artists: Artist[]) => {
  music.artist = artists;
  await getRepository(Music).save(music);
};

export const addMusicToAlbum = async (album: Album, ...music: Music[]) => {
  for (const saveMusic of music) {
    saveMusic.album = album;
    await getRepository(Music).save(saveMusic);
  }
};

export const saveAlbumCover = async (albumId: number, coverPath: string) => {
  await getRepository(Album)
    .createQueryBuilder('album')
    .update()
    .set({
      cover: coverPath,
    })
    .andWhereInIds([albumId])
    .execute();
};

export const saveArtist = async (artist: Artist) => {
  await getRepository(Artist).save(artist);
};

export const saveMusicCoverFile = async (
  musicID3: IAudioMetadata,
): Promise<string | undefined> => {
  const pics = musicID3.common.picture;
  if (pics && pics.length > 0) {
    const cover = pics[0];
    const coverFilename = `${uuidv4()}.jpg`;
    await sharp(cover.data)
      .resize({ width: 512 })
      .toFile(path.join(ApplicationConfig.coverDir, coverFilename));
    return coverFilename;
  }
  return undefined;
};
