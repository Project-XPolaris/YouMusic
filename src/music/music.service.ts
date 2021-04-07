import { Injectable } from '@nestjs/common';
import { UpdateMusicDto } from './dto/update-music.dto';
import { getRepository } from 'typeorm';
import { Music } from 'src/database/entites/music';
import { PageFilter } from '../database/utils/type.filter';
import { filterByPage } from '../database/utils/page.filter';
import { publicUid } from '../vars';
import { MediaLibrary } from '../database/entites/library';
import * as fs from 'fs';
import { Tags, update as updateId3, Promise as id3Promise } from 'node-id3';
import { Artist } from '../database/entites/artist';
import { getOrCreateArtist } from '../services/music';
import { User } from '../database/entites/user';

export type MusicQueryFilter = {
  artistId: number;
  albumId: number;
  ids: number[] | string[];
  order: { [key: string]: 'ASC' | 'DESC' };
  uid: string;
} & PageFilter;

@Injectable()
export class MusicService {
  async findAll(filter: MusicQueryFilter) {
    const musicRepository = getRepository(Music);
    let queryBuilder = musicRepository
      .createQueryBuilder('music')
      .leftJoinAndSelect('music.album', 'album')
      .leftJoinAndSelect('music.artist', 'artist');
    queryBuilder = filterByPage<Music>(filter, queryBuilder);
    if (filter.artistId > 0) {
      queryBuilder.andWhere('artist.id = :id', {
        id: filter.artistId,
      });
    }
    if (filter.albumId > 0) {
      queryBuilder.andWhere('album.id = :id', {
        id: filter.albumId,
      });
    }
    if (filter.ids.length > 0 && filter.ids[0] !== '') {
      console.log(filter.ids);
      queryBuilder.andWhere('music.id IN (:...ids)', { ids: filter.ids });
    }
    queryBuilder = queryBuilder
      .leftJoinAndSelect(
        MediaLibrary,
        'library',
        'music.libraryId = library.id',
      )
      .leftJoin('library.users', 'users')
      .andWhere('users.uid in (:...uid)', { uid: [publicUid, filter.uid] });
    const order = {};
    Object.getOwnPropertyNames(filter.order).forEach((fieldName) => {
      order[`music.${fieldName}`] = filter.order[fieldName];
    });
    queryBuilder.orderBy(order);
    // with album
    return queryBuilder.getManyAndCount();
  }

  async findOne(id: number, uid: string) {
    const musicRepository = getRepository(Music);
    return await musicRepository
      .createQueryBuilder('music')
      .leftJoin('music.users', 'users')
      .whereInIds([id])
      .andWhere('users.uid in (:...uid)', { uid: [publicUid, uid] })
      .getOne();
  }

  async remove(id: number) {
    return await Music.deleteMusic(id);
  }

  async checkRemoveAccessible(id: number, uid: string) {
    const repo = await getRepository(Music);
    const count = await repo
      .createQueryBuilder('music')
      .leftJoinAndSelect(
        MediaLibrary,
        'library',
        'music.libraryId = library.id',
      )
      .leftJoin('library.users', 'users')
      .where('users.uid in (:...uid)', { uid: [publicUid, uid] })
      .where('music.id = :id', { id })
      .getCount();
    return count > 0;
  }
  async updateMusicFile(id: number, uid: string, dto: UpdateMusicDto) {
    const repo = await getRepository(Music);
    const music = await repo.findOne(id, { relations: ['album'] });
    if (music === undefined || music === null) {
      throw new Error('music not exist');
    }
    const user = await getRepository(User).findOne({ uid });
    const tags: { [key: string]: string } = {};
    if (dto.title) {
      tags['title'] = dto.title;
      music.title = dto.title;
    }
    const artists: Artist[] = [];
    if (dto.artist) {
      for (const artistName of dto.artist) {
        const artist = await getOrCreateArtist(artistName, user);
        if (
          (artist.avatar === null || artist.avatar.length === 0) &&
          music.album.cover
        ) {
          // get copy of album
          artist.avatar = await music.album.duplicateCover();
          await getRepository(Artist).save(artist);
        }
        artists.push(artist);
      }
      music.artist = artists;
      tags['artist'] = dto.artist.join('/');
    }
    const file = await fs.promises.readFile(music.path);
    const buf = await id3Promise.update(tags, file);
    fs.promises.writeFile(music.path, buf);
    await getRepository(Music).save(music);
  }
}
