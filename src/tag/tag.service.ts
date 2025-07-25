import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PageFilter } from '../database/utils/type.filter';
import { MediaLibrary } from '../database/entites/library';
import { Tag } from '../database/entites/tag';

export type TagQueryFilter = {
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
export class TagService {
  constructor(
    private dataSource: DataSource
  ) {}

  async findAll(filter: TagQueryFilter) {
    const libraries = await MediaLibrary.getLibraryByUid(filter.uid,this.dataSource);
    const musicRepository = this.dataSource.getRepository(Tag);
    const queryBuilder = musicRepository.createQueryBuilder('tag');
    queryBuilder
      .take(filter.pageSize)
      .skip((filter.page - 1) * filter.pageSize);
    const libraryIds = libraries.map((it) => it.id);
    if (libraries.length > 0) {
      queryBuilder
        .leftJoin('tag.music', 'music')
        .groupBy('tag.id')
        .andWhere('music.libraryId in (:...id)', {
          id: libraryIds,
        });
    }
    if (filter.ids.length > 0 && filter.ids[0] !== '') {
      queryBuilder.andWhere('tag.id IN (:...ids)', { ids: filter.ids });
    }
    if (filter.search.length > 0) {
      queryBuilder.andWhere('tag.name like :search', {
        search: `%${filter.search}%`,
      });
    }

    if (filter.musicId > 0) {
      queryBuilder.andWhere('music.id = :id', { id: filter.musicId });
    }
    if (filter.albumId > 0) {
      queryBuilder.andWhere('music.albumId = :aid', { aid: filter.albumId });
    }
    if (filter.followUid && filter.followUid.length > 0) {
      queryBuilder
        .leftJoin('tag.follow', 'follow')
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
        order[`tag.${fieldName}`] = filter.order[fieldName];
      });
      queryBuilder.orderBy(order);
    }
    return queryBuilder.getManyAndCount();
  }

  async findOne(id: number, uid: string) {
    const libraries = await MediaLibrary.getLibraryByUid(uid,this.dataSource);
    const tagRepository = this.dataSource.getRepository(Tag);
    let query = tagRepository.createQueryBuilder('tag').whereInIds([id]);
    if (libraries.length > 0) {
      query = query
        .leftJoin('tag.music', 'music')
        .andWhere('music.libraryId in (:...lid)', {
          lid: libraries.map((it) => it.id),
        });
    }
    return await query.getOne();
  }
}
