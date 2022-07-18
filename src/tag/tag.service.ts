import { Injectable } from '@nestjs/common';
import { getRepository } from 'typeorm';
import { Music } from 'src/database/entites/music';
import { PageFilter } from '../database/utils/type.filter';
import { MediaLibrary } from '../database/entites/library';
import { Tag } from '../database/entites/tag';

export type TagQueryFilter = {
  musicId: number;
  ids: string[];
  order: { [key: string]: 'ASC' | 'DESC' };
  uid: string;
  search: string;
} & PageFilter;

@Injectable()
export class TagService {
  constructor() {}

  async findAll(filter: TagQueryFilter) {
    const libraries = await MediaLibrary.getLibraryByUid(filter.uid);
    const musicRepository = getRepository(Tag);
    const queryBuilder = musicRepository.createQueryBuilder('tag');
    queryBuilder
      .take(filter.pageSize)
      .skip((filter.page - 1) * filter.pageSize);
    if (libraries.length > 0) {
      queryBuilder.where('tag.libraryId in (:...lid)', {
        lid: libraries.map((it) => it.id),
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
      queryBuilder
        .leftJoinAndSelect('tag.music', 'music')
        .andWhere('music.id = :id', { id: filter.musicId });
    }
    const order = {};
    Object.getOwnPropertyNames(filter.order).forEach((fieldName) => {
      order[`tag.${fieldName}`] = filter.order[fieldName];
    });
    queryBuilder.orderBy(order);
    return queryBuilder.getManyAndCount();
  }

  async findOne(id: number, uid: string) {
    const libraries = await MediaLibrary.getLibraryByUid(uid);
    const tagRepository = getRepository(Music);
    let query = tagRepository.createQueryBuilder('tag').whereInIds([id]);
    if (libraries.length > 0) {
      query = query.andWhere('tag.libraryId in (:...lid)', {
        lid: libraries.map((it) => it.id),
      });
    }
    return await query.getOne();
  }
}
