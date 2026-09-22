import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PageFilter } from '../database/utils/type.filter';
import { MediaLibrary } from '../database/entites/library';
import { Tag } from '../database/entites/tag';
import { Music } from '../database/entites/music';

export type TagQueryFilter = {
  musicId: number;
  ids: string[];
  order: { [key: string]: 'ASC' | 'DESC' };
  uid: string;
  search: string;
  albumId: number;
  random: boolean;
  followUid: string;
  withMusicCount?: boolean;
} & PageFilter;

export type TagStatistics = {
  totalTags: number;
  totalMusic: number;
  mostUsedTag?: {
    name: string;
    count: number;
  };
  recentlyCreated: number;
};

@Injectable()
export class TagService {
  constructor(private dataSource: DataSource) {}

  async findAll(filter: TagQueryFilter): Promise<[Tag[], number]> {
    const libraries = await MediaLibrary.getLibraryByUid(
      filter.uid,
      this.dataSource,
    );
    const musicRepository = this.dataSource.getRepository(Tag);
    const queryBuilder = musicRepository.createQueryBuilder('tag');

    if (filter.withMusicCount) {
      queryBuilder.addSelect('COUNT(DISTINCT music.id)', 'musicCount');
    }

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

    if (filter.withMusicCount) {
      const result = await queryBuilder.getRawAndEntities();
      const tags = result.entities.map((tag, index) => {
        (tag as Tag & { musicCount?: number }).musicCount =
          parseInt(result.raw[index].musicCount, 10) || 0;
        return tag;
      });

      const countQueryBuilder = musicRepository.createQueryBuilder('tag');
      if (libraries.length > 0) {
        countQueryBuilder
          .leftJoin('tag.music', 'music')
          .andWhere('music.libraryId in (:...id)', {
            id: libraryIds,
          });
      }
      if (filter.ids.length > 0 && filter.ids[0] !== '') {
        countQueryBuilder.andWhere('tag.id IN (:...ids)', { ids: filter.ids });
      }
      if (filter.search.length > 0) {
        countQueryBuilder.andWhere('tag.name like :search', {
          search: `%${filter.search}%`,
        });
      }
      if (filter.musicId > 0) {
        countQueryBuilder.andWhere('music.id = :id', { id: filter.musicId });
      }
      if (filter.albumId > 0) {
        countQueryBuilder.andWhere('music.albumId = :aid', {
          aid: filter.albumId,
        });
      }
      if (filter.followUid && filter.followUid.length > 0) {
        countQueryBuilder
          .leftJoin('tag.follow', 'follow')
          .andWhere('follow.uid = :uid', { uid: filter.uid });
      }

      const count = await countQueryBuilder
        .select('COUNT(DISTINCT tag.id)', 'cnt')
        .getRawOne()
        .then((row) => parseInt(row?.cnt ?? '0', 10) || 0);
      return [tags, count];
    } else {
      return queryBuilder.getManyAndCount();
    }
  }

  async findOne(id: number, uid: string) {
    const libraries = await MediaLibrary.getLibraryByUid(uid, this.dataSource);
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

  async create(name: string): Promise<Tag> {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      throw new BadRequestException('tag name is empty');
    }
    const repo = this.dataSource.getRepository(Tag);
    const existing = await repo.findOne({ where: { name: trimmed } });
    if (existing) {
      throw new BadRequestException('tag already exists');
    }
    const tag = new Tag();
    tag.name = trimmed;
    return await repo.save(tag);
  }

  async update(id: number, name: string): Promise<Tag> {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      throw new BadRequestException('tag name is empty');
    }
    const repo = this.dataSource.getRepository(Tag);
    const tag = await repo.findOne({ where: { id } });
    if (!tag) {
      throw new NotFoundException('tag not found');
    }
    if (tag.name === trimmed) {
      return tag;
    }
    const conflict = await repo.findOne({ where: { name: trimmed } });
    if (conflict && conflict.id !== id) {
      throw new BadRequestException('tag name already exists');
    }
    tag.name = trimmed;
    return await repo.save(tag);
  }

  async remove(id: number): Promise<void> {
    const repo = this.dataSource.getRepository(Tag);
    const tag = await repo.findOne({
      where: { id },
      relations: ['music', 'follow'],
    });
    if (!tag) {
      throw new NotFoundException('tag not found');
    }
    tag.music = [];
    tag.follow = [];
    await repo.save(tag);
    await repo.remove(tag);
  }

  async removeMany(ids: number[]): Promise<void> {
    const uniqueIds = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
    if (uniqueIds.length === 0) {
      throw new BadRequestException('ids is empty');
    }
    for (const id of uniqueIds) {
      await this.remove(id);
    }
  }

  async merge(sourceId: number, targetId: number): Promise<Tag> {
    if (!sourceId || !targetId) {
      throw new BadRequestException('sourceId and targetId are required');
    }
    if (sourceId === targetId) {
      throw new BadRequestException('source and target must differ');
    }
    const repo = this.dataSource.getRepository(Tag);
    const source = await repo.findOne({
      where: { id: sourceId },
      relations: ['music', 'follow'],
    });
    const target = await repo.findOne({
      where: { id: targetId },
      relations: ['music', 'follow'],
    });
    if (!source || !target) {
      throw new NotFoundException('tag not found');
    }

    const musicById = new Map<number, Music>();
    for (const music of target.music || []) {
      musicById.set(music.id, music);
    }
    for (const music of source.music || []) {
      musicById.set(music.id, music);
    }
    target.music = [...musicById.values()];

    const followByUid = new Map<string, (typeof target.follow)[number]>();
    for (const user of target.follow || []) {
      followByUid.set(user.uid, user);
    }
    for (const user of source.follow || []) {
      followByUid.set(user.uid, user);
    }
    target.follow = [...followByUid.values()];

    await repo.save(target);

    source.music = [];
    source.follow = [];
    await repo.save(source);
    await repo.remove(source);

    const merged = await repo.findOne({ where: { id: targetId } });
    if (!merged) {
      throw new NotFoundException('target tag missing after merge');
    }
    return merged;
  }

  async getStatistics(uid: string): Promise<TagStatistics> {
    const libraries = await MediaLibrary.getLibraryByUid(uid, this.dataSource);
    const libraryIds = libraries.map((it) => it.id);
    const tagRepo = this.dataSource.getRepository(Tag);
    const musicRepo = this.dataSource.getRepository(Music);

    let totalTags = 0;
    let totalMusic = 0;
    let mostUsedTag: TagStatistics['mostUsedTag'];
    let recentlyCreated = 0;

    if (libraryIds.length === 0) {
      totalTags = await tagRepo.count();
      totalMusic = await musicRepo
        .createQueryBuilder('music')
        .innerJoin('music.tags', 'tag')
        .select('COUNT(DISTINCT music.id)', 'cnt')
        .getRawOne()
        .then((row) => parseInt(row?.cnt ?? '0', 10) || 0);

      const top = await tagRepo
        .createQueryBuilder('tag')
        .leftJoin('tag.music', 'music')
        .select('tag.name', 'name')
        .addSelect('COUNT(DISTINCT music.id)', 'count')
        .groupBy('tag.id')
        .orderBy('count', 'DESC')
        .limit(1)
        .getRawOne();
      if (top && Number(top.count) > 0) {
        mostUsedTag = { name: top.name, count: Number(top.count) };
      }

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      recentlyCreated = await tagRepo
        .createQueryBuilder('tag')
        .where('tag.createdAt >= :monthStart', { monthStart })
        .getCount();

      return { totalTags, totalMusic, mostUsedTag, recentlyCreated };
    }

    totalTags = await tagRepo
      .createQueryBuilder('tag')
      .innerJoin('tag.music', 'music')
      .andWhere('music.libraryId IN (:...libraryIds)', { libraryIds })
      .select('COUNT(DISTINCT tag.id)', 'cnt')
      .getRawOne()
      .then((row) => parseInt(row?.cnt ?? '0', 10) || 0);

    totalMusic = await musicRepo
      .createQueryBuilder('music')
      .innerJoin('music.tags', 'tag')
      .andWhere('music.libraryId IN (:...libraryIds)', { libraryIds })
      .select('COUNT(DISTINCT music.id)', 'cnt')
      .getRawOne()
      .then((row) => parseInt(row?.cnt ?? '0', 10) || 0);

    const top = await tagRepo
      .createQueryBuilder('tag')
      .innerJoin('tag.music', 'music')
      .andWhere('music.libraryId IN (:...libraryIds)', { libraryIds })
      .select('tag.name', 'name')
      .addSelect('COUNT(DISTINCT music.id)', 'count')
      .groupBy('tag.id')
      .orderBy('count', 'DESC')
      .limit(1)
      .getRawOne();
    if (top && Number(top.count) > 0) {
      mostUsedTag = { name: top.name, count: Number(top.count) };
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    recentlyCreated = await tagRepo
      .createQueryBuilder('tag')
      .innerJoin('tag.music', 'music')
      .andWhere('music.libraryId IN (:...libraryIds)', { libraryIds })
      .andWhere('tag.createdAt >= :monthStart', { monthStart })
      .select('COUNT(DISTINCT tag.id)', 'cnt')
      .getRawOne()
      .then((row) => parseInt(row?.cnt ?? '0', 10) || 0);

    return { totalTags, totalMusic, mostUsedTag, recentlyCreated };
  }
}
