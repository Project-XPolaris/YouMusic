import { getManager, getRepository } from 'typeorm';
import { Album } from '../database/entites/album';
import { Artist } from '../database/entites/artist';
import { Music } from '../database/entites/music';
import { MediaLibrary } from '../database/entites/library';
import { User } from '../database/entites/user';
import { uniq } from 'lodash';
import * as mm from 'music-metadata';
import { Genre } from '../database/entites/genre';
import { v4 as uuidv4 } from 'uuid';
import { ApplicationConfig } from '../config';
import * as path from 'path';
import * as fs from 'fs';
import sharp = require('sharp');

export const getOrCreateAlbum = async (name: string, user: User) => {
  let album = await getRepository(Album)
    .createQueryBuilder('album')
    .leftJoinAndSelect('album.users', 'users')
    .where('album.name = :name', { name })
    .andWhere('users.uid = :uid', { uid: user.uid })
    .getOne();
  if (album) {
    return album;
  }
  album = new Album();
  album.name = name;
  album.users = [user];
  await getRepository(Album).save(album);
  return album;
};

export const getOrCreateArtist = async (name: string, user: User) => {
  let artist = await getRepository(Artist)
    .createQueryBuilder('artist')
    .leftJoinAndSelect('artist.users', 'users')
    .where('artist.name = :name', { name })
    .andWhere('users.uid = :uid', { uid: user.uid })
    .getOne();
  if (artist) {
    return artist;
  }
  artist = new Artist();
  artist.name = name;
  artist.users = [user];
  await getRepository(Artist).save(artist);
  return artist;
};

export const getOrCreateMusic = async (
  title: string,
  musicFilePath: string,
  library: MediaLibrary,
  duration: number,
  user: User,
  year?: number,
) => {
  let music = await getRepository(Music)
    .createQueryBuilder('music')
    .leftJoinAndSelect('music.users', 'users')
    .where('music.path = :path', {
      path: musicFilePath,
    })
    .andWhere('music.libraryId = :libraryId', {
      libraryId: library.id,
    })
    .andWhere('users.uid = :uid', { uid: user.uid })
    .getOne();
  if (music === undefined) {
    music = new Music();
  }
  music.title = title;
  music.path = musicFilePath;
  music.library = library;
  music.duration = duration;
  music.users = [user];
  music.year = year;
  await getRepository(Music).save(music);
  return music;
};

export const addArtistsToMusic = async (music: Music, ...artists: Artist[]) => {
  music.artist = artists;
  await getRepository(Music).save(music);
};

export const addArtistsToAlbum = async (album: Album, ...artists: Artist[]) => {
  album.artist = artists;
  await getRepository(Album).save(album);
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

export const parseAndSaveMusic = async (library, user, musicFilePath) => {
  const musicID3 = await mm.parseFile(musicFilePath);
  let album: Album = undefined;
  if (musicID3.common.album) {
    album = await getOrCreateAlbum(musicID3.common.album, user);
  }
  let rawArtists = [];
  if (musicID3.common.artist) {
    rawArtists.push(musicID3.common.artist);
  }
  if (musicID3.common.artists) {
    rawArtists.push(...musicID3.common.artists);
  }

  rawArtists = uniq(rawArtists);
  const artists: Array<Artist> = [];
  for (const rawArtist of rawArtists) {
    const artist = await getOrCreateArtist(rawArtist, user);
    artists.push(artist);
  }
  let title = path.basename(musicFilePath).split('.').shift();
  if (musicID3.common.title) {
    title = musicID3.common.title;
  }
  let duration = 0;
  if (musicID3.format.duration) {
    duration = musicID3.format.duration;
  }
  const genres: Genre[] = [];
  if (musicID3.common.genre) {
    for (const genreName of musicID3.common.genre) {
      const genre = await Genre.createOrGet(genreName, user);
      genres.push(genre);
    }
  }
  const music = await getOrCreateMusic(
    title,
    musicFilePath,
    library,
    duration,
    user,
    musicID3.common.year,
  );
  music.artist = artists;
  music.genre = genres;
  await getRepository(Music).save(music);
  if (album) {
    await addArtistsToAlbum(album, ...artists);
    await addMusicToAlbum(album, music);
    // save cover

    const pics = musicID3.common.picture;
    if (pics && pics.length > 0 && album.cover === null) {
      const cover = pics[0];
      const coverFilename = `${uuidv4()}.jpg`;
      await sharp(cover.data)
        .resize({ width: 512 })
        .toFile(path.join(ApplicationConfig.coverDir, coverFilename));
      await saveAlbumCover(album.id, coverFilename);

      // add cover as avatar whether artist avatar is null
      for (const artist of artists) {
        if (artist.avatar === undefined || artist.avatar === null) {
          const artistAvatarFilename = `${uuidv4()}.jpg`;
          await sharp(cover.data)
            .resize({ width: 512 })
            .toFile(
              path.join(ApplicationConfig.coverDir, artistAvatarFilename),
            );
          artist.avatar = artistAvatarFilename;
          await saveArtist(artist);
        }
      }
    }
  }
};
