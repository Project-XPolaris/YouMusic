import { Injectable } from '@nestjs/common';
import { CreateMusicDto } from './dto/create-music.dto';
import { UpdateMusicDto } from './dto/update-music.dto';
import { getRepository } from 'typeorm';
import { Music } from 'src/database/entites/music';
import { PageFilter } from '../database/utils/type.filter';
import { filterByPage } from '../database/utils/page.filter';

export type MusicQueryFilter = {
  artistId: number;
  albumId: number;
  ids: number[] | string[];
  order: { [key: string]: 'ASC' | 'DESC' };
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

  async findOne(id: number) {
    const musicRepository = getRepository(Music);
    return await musicRepository.findOne(id);
  }

  update(id: number, updateMusicDto: UpdateMusicDto) {}

  async remove(id: number) {
    const musicRepository = getRepository(Music);
    return await musicRepository.delete(id);
  }
}
