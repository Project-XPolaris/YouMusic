import { Injectable } from '@nestjs/common';
import { UpdateMusicDto } from './dto/update-music.dto';
import { getRepository } from 'typeorm';
import { Music } from 'src/database/entites/music';
import { PageFilter } from '../database/utils/type.filter';
import { filterByPage } from '../database/utils/page.filter';
import { publicUid } from '../vars';
import { MediaLibrary } from '../database/entites/library';

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
    let queryBuilder = musicRepository.createQueryBuilder('music');
    queryBuilder = filterByPage<Music>(filter, queryBuilder);
    if (filter.artistId > 0) {
      queryBuilder = queryBuilder.where('artist.id = :id', {
        id: filter.artistId,
      });
    }
    if (filter.albumId > 0) {
      queryBuilder = queryBuilder.where('album.id = :id', {
        id: filter.albumId,
      });
    }
    if (filter.ids.length > 0 && filter.ids[0] !== '') {
      console.log(filter.ids);
      queryBuilder.where('music.id IN (:...ids)', { ids: filter.ids });
    }
    queryBuilder = queryBuilder
      .leftJoinAndSelect(
        MediaLibrary,
        'library',
        'music.libraryId = library.id',
      )
      .leftJoin('library.users', 'users')
      .where('users.uid in (:...uid)', { uid: [publicUid, filter.uid] });
    const order = {};
    Object.getOwnPropertyNames(filter.order).forEach((fieldName) => {
      order[`music.${fieldName}`] = filter.order[fieldName];
    });
    queryBuilder.orderBy(order);
    // with album
    return queryBuilder
      .leftJoinAndSelect('music.album', 'album')
      .leftJoinAndSelect('music.artist', 'artist')
      .getManyAndCount();
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
}
