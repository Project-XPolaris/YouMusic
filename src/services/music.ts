import { getManager, getRepository } from 'typeorm';
import { Album } from '../database/entites/album';
import { Artist } from '../database/entites/artist';
import { Music } from '../database/entites/music';
import { MediaLibrary } from '../database/entites/library';
import { User } from '../database/entites/user';
import { uniq } from 'lodash';

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
  if (music) {
    return music;
  }
  music = new Music();
  music.title = title;
  music.path = musicFilePath;
  music.library = library;
  music.duration = duration;
  music.users = [user];
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
