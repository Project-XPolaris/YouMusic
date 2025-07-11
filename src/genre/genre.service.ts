import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PageFilter } from '../database/utils/type.filter';
import { MediaLibrary } from '../database/entites/library';
import { Tag } from '../database/entites/tag';
import { Genre } from '../database/entites/genre';

export type GenreQueryFilter = {
  musicId: number;
  ids: string[];
  order: { [key: string]: 'ASC' | 'DESC' };
  uid: string;
  search: string;
  albumId: number;
  random: boolean;
  followUid: string;
} & PageFilter;

@Injectable()
export class GenreService {
  constructor(private dataSource: DataSource) {}

  async findAll(filter: GenreQueryFilter) {
    const libraries = await MediaLibrary.getLibraryByUid(filter.uid, this.dataSource);
    const genreRepository = this.dataSource.getRepository(Genre);
    const queryBuilder = genreRepository.createQueryBuilder('genre');
    queryBuilder
      .take(filter.pageSize)
      .skip((filter.page - 1) * filter.pageSize);
    if (libraries.length > 0) {
      queryBuilder
        .leftJoin('genre.music', 'music')
        .groupBy('genre.id')
        .andWhere('music.libraryId in (:...id)', {
          id: libraries.map((it) => it.id),
        });
    }
    if (filter.ids.length > 0 && filter.ids[0] !== '') {
      queryBuilder.andWhere('genre.id IN (:...ids)', { ids: filter.ids });
    }
    if (filter.search.length > 0) {
      queryBuilder.andWhere('genre.name like :search', {
        search: `%${filter.search}%`,
      });
    }

    if (filter.musicId > 0) {
      queryBuilder
        .leftJoinAndSelect('genre.music', 'music')
        .andWhere('music.id = :id', { id: filter.musicId });
    }
    if (filter.albumId > 0) {
      queryBuilder
        .leftJoinAndSelect('genre.music', 'music')
        .andWhere('music.albumId = :id', { id: filter.albumId });
    }
    if (filter.followUid && filter.followUid.length > 0) {
      queryBuilder
        .leftJoin('genre.follow', 'follow')
        .andWhere('follow.uid = :uid', { uid: filter.uid });
    }
    if (filter.random) {
      if (this.dataSource.options.type === 'sqlite') {
        queryBuilder.orderBy('RANDOM()');
      } else {
        queryBuilder.orderBy('RAND()');
      }
    } else {
      const order = {};
      Object.getOwnPropertyNames(filter.order).forEach((fieldName) => {
        order[`genre.${fieldName}`] = filter.order[fieldName];
      });
      queryBuilder.orderBy(order);
    }
    return queryBuilder.getManyAndCount();
  }

  async findOne(id: number, uid: string) {
    const libraries = await MediaLibrary.getLibraryByUid(uid, this.dataSource);
    const genreRepository = this.dataSource.getRepository(Genre);
    let query = genreRepository.createQueryBuilder('genre').whereInIds([id]);
    if (libraries.length > 0) {
      query = query
        .leftJoin('genre.music', 'music')
        .andWhere('music.libraryId in (:...lid)', {
          lid: libraries.map((it) => it.id),
        });
    }
    return await query.getOne();
  }
}
